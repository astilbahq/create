import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { initializeGitRepository } from "./git.js";
import {
  assertSafeDestinationPath,
  INCOMPLETE_MARKER_PATH,
  isWithinPath,
  resolveOutputPath,
} from "./paths.js";
import type { GenerationPlan } from "./types.js";

export interface ApplyPlanOptions {
  readonly forbiddenRoots?: readonly string[];
  readonly initializeGit?: boolean;
  readonly signal?: AbortSignal;
}

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await lstat(candidate);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
};

const createPlannedSymlink = async (
  output: string,
  target: string
): Promise<void> => {
  try {
    await symlink(path.relative(path.dirname(output), target), output, "file");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EACCES" || error.code === "EPERM")
    ) {
      throw new Error(
        "Could not create the planned symbolic link. Enable symbolic-link support for this filesystem; Windows requires Developer Mode or elevated privileges.",
        { cause: error }
      );
    }

    throw error;
  }
};

interface PreparedParent {
  readonly createdDirectories: readonly string[];
  readonly realPath: string;
}

const removeEmptyDirectories = async (
  directories: readonly string[]
): Promise<void> => {
  for (const directory of [...directories].toReversed()) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Parents must be removed from the deepest directory upward.
      await rmdir(directory);
    } catch {
      // Preserve externally modified directories.
    }
  }
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error("Project generation was interrupted.", {
      cause: signal.reason,
    });
  }
};

const assertOutsideForbiddenRoots = (
  candidate: string,
  forbiddenRoots: readonly string[]
): void => {
  for (const forbiddenRoot of forbiddenRoots) {
    if (isWithinPath(candidate, forbiddenRoot)) {
      throw new Error(
        `Destination must not be inside the protected path: ${forbiddenRoot}.`
      );
    }
  }
};

const prepareDestinationParent = async (
  candidate: string,
  forbiddenRoots: readonly string[],
  signal?: AbortSignal
): Promise<PreparedParent> => {
  const resolved = path.resolve(candidate);
  const { root } = path.parse(resolved);
  const segments = path
    .relative(root, resolved)
    .split(path.sep)
    .filter(Boolean);
  const createdDirectories: string[] = [];
  let current = root;

  try {
    for (const segment of segments) {
      throwIfAborted(signal);
      current = path.join(current, segment);

      // oxlint-disable-next-line eslint/no-await-in-loop -- Each path segment is validated before descending into it.
      if (!(await pathExists(current))) {
        assertOutsideForbiddenRoots(current, forbiddenRoots);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Parent creation is intentionally one segment at a time.
        await mkdir(current, { mode: 0o755 });
        createdDirectories.push(current);
      }

      // oxlint-disable-next-line eslint/no-await-in-loop -- The newly observed path must be checked for races and symlinks.
      const stats = await lstat(current);

      if (stats.isSymbolicLink()) {
        throw new Error(
          `Destination parent must not contain symlinks: ${current}.`
        );
      }

      if (!stats.isDirectory()) {
        throw new Error(`Destination parent must be a directory: ${current}.`);
      }

      // oxlint-disable-next-line eslint/no-await-in-loop -- Canonical containment must be checked before creating the next segment.
      const canonicalCurrent = await realpath(current);
      assertOutsideForbiddenRoots(canonicalCurrent, forbiddenRoots);
    }

    throwIfAborted(signal);
    return {
      createdDirectories,
      realPath: await realpath(resolved),
    };
  } catch (error: unknown) {
    await removeEmptyDirectories(createdDirectories);
    throw error;
  }
};

const applyFileModes = async (
  plan: GenerationPlan,
  staging: string
): Promise<void> => {
  const directories = new Set<string>();

  for (const output of [...plan.files, ...(plan.symlinks ?? [])]) {
    let directory = path.posix.dirname(output.path);

    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }

  await Promise.all([
    ...plan.files.map((file) =>
      chmod(resolveOutputPath(staging, file.path), file.mode)
    ),
    ...[...directories].map((directory) =>
      chmod(resolveOutputPath(staging, directory), 0o755)
    ),
  ]);
};

const publishStagingTree = async (
  staging: string,
  destination: string
): Promise<void> => {
  await mkdir(destination, { mode: 0o755 });
  const incompleteMarker = path.join(destination, INCOMPLETE_MARKER_PATH);

  try {
    await writeFile(incompleteMarker, "Generation is incomplete.\n", {
      encoding: "utf-8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error: unknown) {
    try {
      await rmdir(destination);
    } catch {
      // Preserve a destination changed by another process.
    }

    throw error;
  }

  const stagingNames = await readdir(staging);
  const names = stagingNames.toSorted();
  const moves = await Promise.allSettled(
    names.map(async (name) => {
      await rename(path.join(staging, name), path.join(destination, name));
      return name;
    })
  );
  const movedNames = moves.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const failedMoveCount = moves.filter(
    (result) => result.status === "rejected"
  ).length;

  if (failedMoveCount > 0) {
    const rollbacks = await Promise.allSettled(
      movedNames.map((name) =>
        rename(path.join(destination, name), path.join(staging, name))
      )
    );
    const failedRollbackCount = rollbacks.filter(
      (result) => result.status === "rejected"
    ).length;

    if (failedRollbackCount === 0) {
      await rm(incompleteMarker, { force: true });

      try {
        await rmdir(destination);
      } catch {
        // Preserve an externally modified destination rather than deleting data
        // that the generator does not own.
      }

      throw new Error("Could not publish the complete generated tree.");
    }

    throw new Error(
      `Could not publish the complete generated tree, and ${failedRollbackCount} rollback operation(s) failed. The incomplete marker was preserved.`
    );
  }

  await rm(incompleteMarker);

  try {
    await rm(staging, { force: true, recursive: true });
  } catch {
    // Publication is already committed. A cleanup failure must not report the
    // complete destination as a failed generation.
  }
};

export const applyGenerationPlan = async (
  plan: GenerationPlan,
  destination: string,
  options: ApplyPlanOptions = {}
): Promise<void> => {
  throwIfAborted(options.signal);
  assertSafeDestinationPath(destination);
  const requestedDestination = path.resolve(destination);
  const requestedParent = path.dirname(requestedDestination);
  const resolvedForbiddenRoots = await Promise.all(
    (options.forbiddenRoots ?? []).map((root) => realpath(root))
  );

  assertOutsideForbiddenRoots(requestedDestination, resolvedForbiddenRoots);

  const preparedParent = await prepareDestinationParent(
    requestedParent,
    resolvedForbiddenRoots,
    options.signal
  );
  const resolvedDestination = path.join(
    preparedParent.realPath,
    path.basename(requestedDestination)
  );
  let staging: string | undefined;

  try {
    throwIfAborted(options.signal);
    assertOutsideForbiddenRoots(resolvedDestination, resolvedForbiddenRoots);

    const activeStaging = await mkdtemp(
      path.join(
        preparedParent.realPath,
        `.${path.basename(resolvedDestination)}.foundation-`
      )
    );
    staging = activeStaging;

    await Promise.all(
      plan.files.map(async (file) => {
        throwIfAborted(options.signal);
        const output = resolveOutputPath(activeStaging, file.path);
        await mkdir(path.dirname(output), { mode: 0o755, recursive: true });
        await writeFile(output, file.content, {
          encoding: "utf-8",
          flag: "wx",
          mode: file.mode,
        });
      })
    );

    await Promise.all(
      (plan.symlinks ?? []).map(async (link) => {
        throwIfAborted(options.signal);
        const output = resolveOutputPath(activeStaging, link.path);
        const target = resolveOutputPath(activeStaging, link.targetPath);
        const targetStats = await lstat(target);

        if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
          throw new Error(
            `Symlink "${link.path}" must target a regular planned file.`
          );
        }

        await mkdir(path.dirname(output), { mode: 0o755, recursive: true });
        await createPlannedSymlink(output, target);
      })
    );

    throwIfAborted(options.signal);
    await applyFileModes(plan, activeStaging);
    throwIfAborted(options.signal);

    if (options.initializeGit === true) {
      await initializeGitRepository(activeStaging, process.env, options.signal);
    }

    throwIfAborted(options.signal);
    await publishStagingTree(activeStaging, resolvedDestination);
  } catch (error: unknown) {
    if (staging !== undefined) {
      await rm(staging, { force: true, recursive: true });
    }
    await removeEmptyDirectories(preparedParent.createdDirectories);

    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error("Destination must not already exist.", {
        cause: error,
      });
    }

    throw error;
  }
};
