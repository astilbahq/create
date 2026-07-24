import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { scaffoldProject } from "../src/cli.js";
import { isProjectRecipeId, projectRecipeIds } from "../src/recipes.js";
import type { ProjectRecipeId } from "../src/recipes.js";

const executeFile = promisify(execFile);

const readRecipes = (arguments_: readonly string[]): ProjectRecipeId[] => {
  if (arguments_.length === 0) {
    return [...projectRecipeIds];
  }

  return arguments_.map((argument) => {
    if (!isProjectRecipeId(argument)) {
      throw new Error(`Unknown consumer recipe: ${argument}.`);
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

const verifyRecipe = async (
  recipe: ProjectRecipeId,
  temporaryRoot: string
): Promise<void> => {
  const destination = path.join(temporaryRoot, recipe);
  await scaffoldProject({
    destination,
    dryRun: false,
    initializeGit: true,
    installDependencies: false,
    json: false,
    options: {
      description: `A generated ${recipe} project with {braces}, "quotes", and </script>.`,
      githubOwner: "example",
      githubRepo: recipe,
      packageName: `@example/${recipe}`,
      projectName: recipe,
    },
    recipe,
  });
  await runCommand("pnpm", ["install"], destination);
  await runCommand("pnpm", ["verify"], destination);
};

const main = async (): Promise<void> => {
  const recipes = readRecipes(process.argv.slice(2));
  const temporaryRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-consumers-")
  );

  try {
    const results = await Promise.allSettled(
      recipes.map(async (recipe) => {
        process.stdout.write(`\nVerifying generated ${recipe} consumer...\n`);
        await verifyRecipe(recipe, temporaryRoot);
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
