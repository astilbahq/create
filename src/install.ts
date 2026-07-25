import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";

import { CreateAstilbaError } from "./errors.js";
import { toolchainVersions } from "./profiles/toolchain-versions.js";
import { createSpawnInvocation } from "./spawn-invocation.js";

const DIAGNOSTIC_TAIL_LENGTH = 8192;

interface ProcessResult {
  readonly stderr: string;
  readonly stdout: string;
}

interface ProcessFailure extends Error {
  code?: string;
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
}

const appendTail = (current: string, chunk: Buffer): string =>
  `${current}${chunk.toString("utf-8")}`.slice(-DIAGNOSTIC_TAIL_LENGTH);

export type ProcessRunner = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  signal?: AbortSignal
) => Promise<ProcessResult>;

const createProcessAbortError = (reason: unknown): ProcessFailure =>
  Object.assign(
    new Error(
      reason instanceof Error ? reason.message : "Package manager interrupted.",
      { cause: reason }
    ),
    { code: "ABORT_ERR" }
  );

const terminateProcessTree = (
  child: ChildProcess,
  platform: NodeJS.Platform = process.platform
): Promise<void> => {
  const processId = child.pid;

  if (processId === undefined) {
    return Promise.resolve();
  }

  if (platform !== "win32") {
    const killGroup = (signal: NodeJS.Signals): boolean => {
      try {
        process.kill(-processId, signal);
        return true;
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ESRCH"
        ) {
          return false;
        }

        child.kill(signal);
        return true;
      }
    };

    const groupWasRunning = killGroup("SIGTERM");

    if (!groupWasRunning) {
      return Promise.resolve();
    }

    // oxlint-disable-next-line promise/avoid-new -- The grace period is intentionally represented by a timer-backed promise.
    return new Promise((resolve) => {
      setTimeout(() => {
        killGroup("SIGKILL");
        resolve();
      }, 500);
    });
  }

  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const taskkill = path.win32.join(systemRoot, "System32", "taskkill.exe");

  // oxlint-disable-next-line promise/avoid-new -- ChildProcess exposes completion through events rather than a promise API.
  return new Promise((resolve) => {
    const killer = spawn(taskkill, ["/pid", String(processId), "/t", "/f"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    let finished = false;
    const finish = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      resolve();
    };

    killer.once("error", () => {
      child.kill();
      finish();
    });
    killer.once("close", finish);
  });
};

export const runProcess: ProcessRunner = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  signal?: AbortSignal
): Promise<ProcessResult> =>
  // oxlint-disable-next-line promise/avoid-new -- ChildProcess exposes completion through events rather than a promise API.
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createProcessAbortError(signal.reason));
      return;
    }

    const invocation = createSpawnInvocation(command, arguments_);
    const child = spawn(invocation.command, [...invocation.arguments_], {
      cwd,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let stdout = "";
    let settled = false;
    let termination: Promise<void> | undefined;
    const onAbort = (): void => {
      termination ??= terminateProcessTree(child);
    };
    const settle = async (): Promise<boolean> => {
      if (settled) {
        return false;
      }

      settled = true;
      signal?.removeEventListener("abort", onAbort);
      await termination;
      return true;
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendTail(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendTail(stderr, chunk);
    });
    child.once("error", (error: ProcessFailure) => {
      error.stderr = stderr;
      error.stdout = stdout;
      void (async () => {
        if (await settle()) {
          reject(error);
        }
      })();
    });
    child.once("close", (exitCode) => {
      if (signal?.aborted) {
        const error = createProcessAbortError(signal.reason);
        error.stderr = stderr;
        error.stdout = stdout;
        void (async () => {
          if (await settle()) {
            reject(error);
          }
        })();
        return;
      }

      if (exitCode === 0) {
        void (async () => {
          if (await settle()) {
            resolve({ stderr, stdout });
          }
        })();
        return;
      }

      const error = new Error(
        `${command} exited with status ${exitCode ?? "unknown"}.`
      ) as ProcessFailure;
      error.exitCode = exitCode;
      error.stderr = stderr;
      error.stdout = stdout;
      void (async () => {
        if (await settle()) {
          reject(error);
        }
      })();
    });
  });

const diagnosticsFrom = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "";
  }

  const failure = error as ProcessFailure;
  const diagnostics = [failure.stderr, failure.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .trim();

  return diagnostics;
};

const interruptionError = (
  destination: string,
  reason: unknown
): CreateAstilbaError =>
  new CreateAstilbaError(
    reason instanceof Error
      ? reason.message
      : "Project creation was interrupted.",
    {
      cause: reason,
      code: "CANCELLED",
      destination,
      exitCode: 130,
      phase: "installation",
      projectCreated: true,
    }
  );

interface PackageManagerCommand {
  readonly arguments_: readonly string[];
  readonly command: string;
}

const resolvePackageManager = async (
  destination: string,
  runner: ProcessRunner,
  signal?: AbortSignal
): Promise<PackageManagerCommand> => {
  const expected = toolchainVersions.pnpm;
  let discoveredVersion: string | undefined;
  let pnpmDiagnostics = "";

  try {
    const result = await runner("pnpm", ["--version"], destination, signal);
    discoveredVersion = result.stdout.trim();

    if (discoveredVersion === expected) {
      return { arguments_: [], command: "pnpm" };
    }
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw interruptionError(destination, signal.reason);
    }

    pnpmDiagnostics = diagnosticsFrom(error);
  }

  const corepackArguments = [`pnpm@${expected}`] as const;

  try {
    const result = await runner(
      "corepack",
      [...corepackArguments, "--version"],
      destination,
      signal
    );

    if (result.stdout.trim() === expected) {
      return { arguments_: corepackArguments, command: "corepack" };
    }
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw interruptionError(destination, signal.reason);
    }

    const corepackDiagnostics = diagnosticsFrom(error);

    throw new CreateAstilbaError(
      `Could not prepare pnpm ${expected} through Corepack.`,
      {
        cause: error,
        code: "PACKAGE_MANAGER_UNAVAILABLE",
        destination,
        diagnostics: corepackDiagnostics || pnpmDiagnostics,
        phase: "installation",
        projectCreated: true,
      }
    );
  }

  const discovered = discoveredVersion
    ? ` pnpm ${discoveredVersion} was found instead.`
    : "";

  throw new CreateAstilbaError(
    `The project requires pnpm ${expected}, but that exact version is unavailable.${discovered} Install it or enable Corepack, then run "pnpm install --frozen-lockfile" in ${destination}.`,
    {
      code: "PACKAGE_MANAGER_UNAVAILABLE",
      destination,
      phase: "installation",
      projectCreated: true,
    }
  );
};

export const installProjectDependencies = async (
  destination: string,
  options: {
    readonly runner?: ProcessRunner;
    readonly signal?: AbortSignal;
  } = {}
): Promise<void> => {
  if (options.signal?.aborted) {
    throw interruptionError(destination, options.signal.reason);
  }
  const runner = options.runner ?? runProcess;
  const packageManager = await resolvePackageManager(
    destination,
    runner,
    options.signal
  );

  try {
    await runner(
      packageManager.command,
      [
        ...packageManager.arguments_,
        "install",
        "--frozen-lockfile",
        "--reporter=append-only",
      ],
      destination,
      options.signal
    );
  } catch (error: unknown) {
    if (options.signal?.aborted) {
      throw interruptionError(destination, options.signal.reason);
    }

    throw new CreateAstilbaError(
      `The project was created, but pnpm install failed. Resolve the package-manager error, then run "pnpm install --frozen-lockfile" in ${destination}.`,
      {
        cause: error,
        code: "INSTALLATION_FAILED",
        destination,
        diagnostics: diagnosticsFrom(error),
        phase: "installation",
        projectCreated: true,
      }
    );
  }
};
