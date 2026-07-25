import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

const assertGitDirectoryAbsent = async (
  gitDirectory: string
): Promise<void> => {
  try {
    await lstat(gitDirectory);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error("The destination already contains Git metadata.");
};

const createIsolatedGitEnvironment = (
  ambientEnvironment: NodeJS.ProcessEnv,
  templateDirectory: string
): NodeJS.ProcessEnv => {
  const environment = Object.fromEntries(
    Object.entries(ambientEnvironment).filter(
      ([key, value]) =>
        value !== undefined && !key.toUpperCase().startsWith("GIT_")
    )
  );
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

  return {
    ...environment,
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_TEMPLATE_DIR: templateDirectory,
  };
};

const assertInitializedRepository = async (root: string): Promise<void> => {
  const gitDirectory = path.join(root, ".git");
  const stats = await lstat(gitDirectory);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Git did not create the expected repository directory.");
  }

  const head = await readFile(path.join(gitDirectory, "HEAD"), "utf-8");

  if (head !== "ref: refs/heads/main\n") {
    throw new Error("Git did not initialize the expected main branch.");
  }
};

export const initializeGitRepository = async (
  root: string,
  ambientEnvironment: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal
): Promise<void> => {
  signal?.throwIfAborted();

  const gitDirectory = path.join(root, ".git");
  await assertGitDirectoryAbsent(gitDirectory);
  const templateDirectory = await mkdtemp(
    path.join(path.dirname(root), ".astilba-create-git-template-")
  );

  try {
    signal?.throwIfAborted();
    await executeFile(
      "git",
      [
        "init",
        "--quiet",
        "--initial-branch=main",
        `--template=${templateDirectory}`,
        root,
      ],
      {
        env: createIsolatedGitEnvironment(
          ambientEnvironment,
          templateDirectory
        ),
        signal,
      }
    );
    await assertInitializedRepository(root);
  } catch (error: unknown) {
    await rm(gitDirectory, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(templateDirectory, { force: true, recursive: true });
  }
};
