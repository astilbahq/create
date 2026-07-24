import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { scaffoldProject } from "../src/cli.js";
import { projectProfileNames } from "../src/profiles/index.js";
import type { ProjectProfileName } from "../src/profiles/index.js";

const executeFile = promisify(execFile);
const foundationRoot = path.resolve(import.meta.dirname, "..");

const isProjectProfile = (value: string): value is ProjectProfileName =>
  projectProfileNames.some((profile) => profile === value);

const readProfiles = (arguments_: readonly string[]): ProjectProfileName[] => {
  if (arguments_.length === 0) {
    return [...projectProfileNames];
  }

  return arguments_.map((argument) => {
    if (!isProjectProfile(argument)) {
      throw new Error(`Unknown consumer profile: ${argument}.`);
    }

    return argument;
  });
};

const runCommand = async (
  command: string,
  arguments_: readonly string[],
  cwd: string
): Promise<void> => {
  try {
    const { stderr, stdout } = await executeFile(command, [...arguments_], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  } catch (error: unknown) {
    if (error instanceof Error && "stdout" in error) {
      process.stdout.write(String(error.stdout));
    }

    if (error instanceof Error && "stderr" in error) {
      process.stderr.write(String(error.stderr));
    }

    throw error;
  }
};

const verifyBuiltBin = async (temporaryRoot: string): Promise<void> => {
  await runCommand("pnpm", ["build"], foundationRoot);
  const binLink = path.join(temporaryRoot, "typescript-foundation");
  await symlink(path.join(foundationRoot, "dist", "bin.js"), binLink);
  const { stdout } = await executeFile(process.execPath, [binLink, "--help"]);

  if (!stdout.includes("Create a project from the TypeScript Foundation.")) {
    throw new Error("The installed-style CLI entrypoint did not run.");
  }
};

const verifyProfile = async (
  profile: ProjectProfileName,
  temporaryRoot: string
): Promise<void> => {
  const destination = path.join(temporaryRoot, profile);
  await scaffoldProject({
    destination,
    options: {
      description: `A generated ${profile} project with {braces}, "quotes", and </script>.`,
      githubOwner: "example",
      githubRepo: profile,
      packageName: `@example/${profile}`,
      projectName: profile,
    },
    profile,
  });
  await runCommand("pnpm", ["install"], destination);
  await runCommand("pnpm", ["verify"], destination);
};

const main = async (): Promise<void> => {
  const profiles = readProfiles(process.argv.slice(2));
  const temporaryRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), "typescript-foundation-consumers-")
  );

  try {
    await verifyBuiltBin(temporaryRoot);

    const results = await Promise.allSettled(
      profiles.map(async (profile) => {
        process.stdout.write(`\nVerifying generated ${profile} consumer...\n`);
        await verifyProfile(profile, temporaryRoot);
      })
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} generated consumer(s) failed verification.`
      );
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

await main();
