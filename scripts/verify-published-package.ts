import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

import { createSpawnInvocation } from "../src/spawn-invocation.js";

const executeFile = promisify(execFile);
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/u;
const RECIPE_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

interface AcceptanceOptions {
  readonly initializeGit: boolean;
  readonly installDependencies: boolean;
  readonly recipe: string;
  readonly version: string;
}

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

const readOptions = (): AcceptanceOptions => {
  const rawArguments = process.argv.slice(2);
  const commandArguments =
    rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  const arguments_ =
    commandArguments.length > 0
      ? commandArguments
      : [
          `--version=${process.env.ASTILBA_ACCEPTANCE_VERSION ?? ""}`,
          `--recipe=${process.env.ASTILBA_ACCEPTANCE_RECIPE ?? ""}`,
          process.env.ASTILBA_ACCEPTANCE_GIT ?? "",
          process.env.ASTILBA_ACCEPTANCE_INSTALL ?? "",
        ];
  const { positionals, values } = parseArgs({
    allowNegative: true,
    allowPositionals: true,
    args: arguments_,
    options: {
      git: { type: "boolean" },
      install: { type: "boolean" },
      recipe: { type: "string" },
      version: { type: "string" },
    },
    strict: true,
  });

  if (positionals.length > 0) {
    throw new Error("Published acceptance does not accept positional values.");
  }

  if (!(values.version && SEMVER_PATTERN.test(values.version))) {
    throw new Error(
      "Published acceptance requires an exact semantic --version."
    );
  }

  if (!(values.recipe && RECIPE_PATTERN.test(values.recipe))) {
    throw new Error("Published acceptance requires a valid --recipe.");
  }

  if (values.git === undefined || values.install === undefined) {
    throw new Error(
      "Published acceptance requires explicit --git/--no-git and --install/--no-install choices."
    );
  }

  return {
    initializeGit: values.git,
    installDependencies: values.install,
    recipe: values.recipe,
    version: values.version,
  };
};

const runCommand = async (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  { forwardOutput = false }: { readonly forwardOutput?: boolean } = {}
): Promise<CommandResult> => {
  const invocation = createSpawnInvocation(command, arguments_);

  try {
    const { stderr, stdout } = await executeFile(
      invocation.command,
      [...invocation.arguments_],
      {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 15 * 60 * 1000,
      }
    );

    if (forwardOutput) {
      process.stdout.write(stdout);
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr);
    }

    return { stderr, stdout };
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

const verifyGitState = async (
  destination: string,
  initializeGit: boolean
): Promise<void> => {
  const gitDirectory = path.join(destination, ".git");

  if (!initializeGit) {
    if (await pathExists(gitDirectory)) {
      throw new Error("Published acceptance unexpectedly initialized Git.");
    }
    return;
  }

  const { stdout } = await runCommand(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    destination
  );

  if (stdout.trim() !== "true") {
    throw new Error("Published acceptance did not initialize a Git worktree.");
  }
};

const verifyGeneratedProject = async (
  destination: string,
  options: AcceptanceOptions,
  recipeVersion: number
): Promise<void> => {
  const manifest = JSON.parse(
    await readFile(path.join(destination, ".astilba", "project.json"), "utf-8")
  ) as {
    readonly generator?: {
      readonly name?: string;
      readonly version?: string;
    };
    readonly recipe?: { readonly id?: string; readonly version?: number };
    readonly schemaVersion?: number;
  };

  if (
    manifest.generator?.name !== "create-astilba" ||
    manifest.generator.version !== options.version ||
    manifest.recipe?.id !== options.recipe ||
    manifest.recipe.version !== recipeVersion ||
    manifest.schemaVersion !== 1
  ) {
    throw new Error(
      "Published acceptance generated an unexpected project manifest."
    );
  }

  const claudePath = path.join(destination, "CLAUDE.md");
  const claudeStats = await lstat(claudePath);
  if (
    !claudeStats.isSymbolicLink() ||
    (await readlink(claudePath)) !== "AGENTS.md"
  ) {
    throw new Error(
      "Published acceptance did not preserve the canonical agent-instruction link."
    );
  }

  await verifyGitState(destination, options.initializeGit);

  const dependenciesWereInstalled = await pathExists(
    path.join(destination, "node_modules")
  );
  if (dependenciesWereInstalled !== options.installDependencies) {
    throw new Error(
      options.installDependencies
        ? "Published acceptance did not install dependencies."
        : "Published acceptance unexpectedly installed dependencies."
    );
  }

  if (!dependenciesWereInstalled) {
    await runCommand("pnpm", ["install", "--frozen-lockfile"], destination, {
      forwardOutput: true,
    });
  }

  await runCommand("pnpm", ["verify"], destination, { forwardOutput: true });
};

const verifyCatalog = async (
  temporaryRoot: string,
  options: AcceptanceOptions
): Promise<number> => {
  const { stdout } = await runCommand(
    "npx",
    ["--yes", `create-astilba@${options.version}`, "--catalog", "--json"],
    temporaryRoot
  );
  const catalog = JSON.parse(stdout) as {
    readonly generator?: { readonly version?: string };
    readonly ok?: boolean;
    readonly recipes?: readonly {
      readonly id?: string;
      readonly version?: number;
    }[];
    readonly schemaVersion?: number;
  };

  const selectedRecipe = catalog.recipes?.find(
    (recipe) => recipe.id === options.recipe
  );

  if (
    catalog.generator?.version !== options.version ||
    catalog.ok !== true ||
    catalog.schemaVersion !== 1 ||
    !Number.isSafeInteger(selectedRecipe?.version) ||
    (selectedRecipe?.version ?? 0) < 1
  ) {
    throw new Error("Published package returned an invalid recipe catalog.");
  }

  return selectedRecipe?.version ?? 0;
};

const verifyDryRun = async (
  temporaryRoot: string,
  options: AcceptanceOptions
): Promise<void> => {
  const destinationName = "dry-run-project";
  const destination = path.join(temporaryRoot, destinationName);
  const { stdout } = await runCommand(
    "npx",
    [
      "--yes",
      `create-astilba@${options.version}`,
      destinationName,
      `--recipe=${options.recipe}`,
      "--description=Published-acceptance-dry-run.",
      "--github-owner=example",
      options.initializeGit ? "--git" : "--no-git",
      options.installDependencies ? "--install" : "--no-install",
      "--dry-run",
      "--json",
    ],
    temporaryRoot
  );
  const result = JSON.parse(stdout) as {
    readonly action?: string;
    readonly ok?: boolean;
    readonly recipe?: string;
    readonly schemaVersion?: number;
  };

  if (
    result.action !== "plan" ||
    result.ok !== true ||
    result.recipe !== options.recipe ||
    result.schemaVersion !== 1 ||
    (await pathExists(destination))
  ) {
    throw new Error(
      "Published package dry run did not remain side-effect free."
    );
  }
};

const createPublicProject = async (
  temporaryRoot: string,
  options: AcceptanceOptions
): Promise<string> => {
  const destinationName = "public-project";
  const result = await runCommand(
    "npm",
    [
      "create",
      `astilba@${options.version}`,
      "--",
      `--recipe=${options.recipe}`,
      "--description=Published-acceptance-project.",
      "--github-owner=example",
      options.initializeGit ? "--git" : "--no-git",
      options.installDependencies ? "--install" : "--no-install",
      "--",
      destinationName,
    ],
    temporaryRoot,
    { forwardOutput: true }
  );

  if (!result.stdout.includes("Created ")) {
    throw new Error(
      "The public npm create journey did not report a created project."
    );
  }

  return path.join(temporaryRoot, destinationName);
};

const main = async (): Promise<void> => {
  const options = readOptions();
  const temporaryRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-published-")
  );

  try {
    process.stdout.write(
      `Verifying create-astilba@${options.version} on ${process.platform}/${process.arch} with ${options.recipe}...\n`
    );
    const recipeVersion = await verifyCatalog(temporaryRoot, options);
    await verifyDryRun(temporaryRoot, options);
    const destination = await createPublicProject(temporaryRoot, options);
    await verifyGeneratedProject(destination, options, recipeVersion);
    process.stdout.write("Published package acceptance passed.\n");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

await main();
