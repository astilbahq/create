import { describe, expect, it, vi } from "vitest";

import { CreateAstilbaError } from "../src/errors.js";
import { installProjectDependencies, runProcess } from "../src/install.js";
import type { ProcessRunner } from "../src/install.js";
import { toolchainVersions } from "../src/profiles/toolchain-versions.js";

const result = { stderr: "", stdout: "" };

const missingCommand = (): NodeJS.ErrnoException =>
  Object.assign(new Error("Command not found."), { code: "ENOENT" });

describe("dependency installation", () => {
  it("uses an exact matching pnpm with a frozen lockfile", async () => {
    const runner = vi.fn<ProcessRunner>((_command, arguments_) =>
      Promise.resolve(
        arguments_[0] === "--version"
          ? { stderr: "", stdout: `${toolchainVersions.pnpm}\n` }
          : result
      )
    );

    await installProjectDependencies("/project", { runner });

    expect(runner.mock.calls[0]).toEqual([
      "pnpm",
      ["--version"],
      "/project",
      undefined,
    ]);
    expect(runner.mock.calls[1]).toEqual([
      "pnpm",
      ["install", "--frozen-lockfile", "--reporter=append-only"],
      "/project",
      undefined,
    ]);
  });

  it("uses Corepack when the ambient pnpm version does not match", async () => {
    const runner = vi.fn<ProcessRunner>((command, arguments_) => {
      if (command === "pnpm") {
        return Promise.resolve({ stderr: "", stdout: "10.0.0\n" });
      }

      if (arguments_.at(-1) === "--version") {
        return Promise.resolve({
          stderr: "",
          stdout: `${toolchainVersions.pnpm}\n`,
        });
      }

      return Promise.resolve(result);
    });

    await installProjectDependencies("/project", { runner });

    expect(runner.mock.calls[1]).toEqual([
      "corepack",
      [`pnpm@${toolchainVersions.pnpm}`, "--version"],
      "/project",
      undefined,
    ]);
    expect(runner.mock.calls[2]).toEqual([
      "corepack",
      [
        `pnpm@${toolchainVersions.pnpm}`,
        "install",
        "--frozen-lockfile",
        "--reporter=append-only",
      ],
      "/project",
      undefined,
    ]);
  });

  it("reports a distinct package-manager availability failure", async () => {
    const runner = vi.fn<ProcessRunner>(() => Promise.reject(missingCommand()));

    await expect(
      installProjectDependencies("/project", { runner })
    ).rejects.toMatchObject({
      code: "PACKAGE_MANAGER_UNAVAILABLE",
      destination: "/project",
      phase: "installation",
      projectCreated: true,
    });
  });

  it("preserves bounded package-manager diagnostics on install failure", async () => {
    const failure = Object.assign(new Error("Install failed."), {
      stderr: "Registry request failed.",
    });
    const runner = vi.fn<ProcessRunner>((_command, arguments_) => {
      if (arguments_.at(-1) === "--version") {
        return Promise.resolve({
          stderr: "",
          stdout: `${toolchainVersions.pnpm}\n`,
        });
      }

      return Promise.reject(failure);
    });

    let thrown: unknown;

    try {
      await installProjectDependencies("/project", { runner });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CreateAstilbaError);
    expect(thrown).toMatchObject({
      code: "INSTALLATION_FAILED",
      destination: "/project",
      diagnostics: "Registry request failed.",
      phase: "installation",
      projectCreated: true,
    });
    expect((thrown as Error).message).not.toContain("Registry request failed.");
  });

  it("does not start a package manager after cancellation", async () => {
    const controller = new AbortController();
    const interruption = new CreateAstilbaError("Interrupted.", {
      code: "CANCELLED",
      exitCode: 130,
      phase: "installation",
      projectCreated: true,
    });
    controller.abort(interruption);
    const runner = vi.fn<ProcessRunner>();

    await expect(
      installProjectDependencies("/project", {
        runner,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({
      cause: interruption,
      code: "CANCELLED",
      destination: "/project",
      exitCode: 130,
      phase: "installation",
      projectCreated: true,
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not spawn a process for an already-aborted command", async () => {
    const controller = new AbortController();
    controller.abort(new Error("test cancellation"));

    await expect(
      runProcess("this-command-must-not-run", [], "/project", controller.signal)
    ).rejects.toMatchObject({ code: "ABORT_ERR" });
  });
});
