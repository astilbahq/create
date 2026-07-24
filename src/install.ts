import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

const isCommandMissing = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === "ENOENT";

const runPnpm = async (
  command: string,
  arguments_: readonly string[],
  cwd: string
): Promise<void> => {
  await executeFile(command, [...arguments_], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
};

export const installProjectDependencies = async (
  destination: string
): Promise<void> => {
  try {
    await runPnpm("pnpm", ["install"], destination);
    return;
  } catch (error: unknown) {
    if (!isCommandMissing(error)) {
      throw new Error(
        `The project was created, but pnpm install failed. Run "pnpm install" in ${destination} after resolving the reported package-manager error.`,
        { cause: error }
      );
    }
  }

  try {
    await runPnpm("corepack", ["pnpm", "install"], destination);
  } catch (error: unknown) {
    throw new Error(
      `The project was created, but pnpm is unavailable. Install pnpm, then run "pnpm install" in ${destination}.`,
      { cause: error }
    );
  }
};
