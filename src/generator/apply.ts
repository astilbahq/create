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

const assertNoSymlinkAncestors = async (candidate: string): Promise<void> => {
  const resolved = path.resolve(candidate);
  const { root } = path.parse(resolved);
  const segments = path
    .relative(root, resolved)
    .split(path.sep)
    .filter(Boolean);
  const ancestors: string[] = [];
  let current = root;

  for (const segment of segments) {
    current = path.join(current, segment);
    ancestors.push(current);
  }

  await Promise.all(
    ancestors.map(async (ancestor) => {
      if (!(await pathExists(ancestor))) {
        throw new Error(`Destination parent does not exist: ${ancestor}.`);
      }

      const stats = await lstat(ancestor);

      if (stats.isSymbolicLink()) {
        throw new Error(
          `Destination parent must not contain symlinks: ${ancestor}.`
        );
      }
    })
  );
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
  await rmdir(staging);
};

export const applyGenerationPlan = async (
  plan: GenerationPlan,
  destination: string,
  options: ApplyPlanOptions = {}
): Promise<void> => {
  assertSafeDestinationPath(destination);
  const requestedDestination = path.resolve(destination);
  const requestedParent = path.dirname(requestedDestination);
  await assertNoSymlinkAncestors(requestedParent);

  const parent = await realpath(requestedParent);
  const resolvedDestination = path.join(
    parent,
    path.basename(requestedDestination)
  );

  const resolvedForbiddenRoots = await Promise.all(
    (options.forbiddenRoots ?? []).map((root) => realpath(root))
  );

  for (const resolvedForbiddenRoot of resolvedForbiddenRoots) {
    if (isWithinPath(resolvedDestination, resolvedForbiddenRoot)) {
      throw new Error(
        `Destination must not be inside the protected path: ${resolvedForbiddenRoot}.`
      );
    }
  }

  const staging = await mkdtemp(
    path.join(parent, `.${path.basename(resolvedDestination)}.foundation-`)
  );

  try {
    await Promise.all(
      plan.files.map(async (file) => {
        const output = resolveOutputPath(staging, file.path);
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
        const output = resolveOutputPath(staging, link.path);
        const target = resolveOutputPath(staging, link.targetPath);
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

    await applyFileModes(plan, staging);

    if (options.initializeGit === true) {
      await initializeGitRepository(staging);
    }

    await publishStagingTree(staging, resolvedDestination);
  } catch (error: unknown) {
    await rm(staging, { force: true, recursive: true });

    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error("Destination must not already exist.", {
        cause: error,
      });
    }

    throw error;
  }
};
