import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baseRef = process.env.RECIPE_BASE_REF;

interface RecipeContract {
  readonly currentVersion: number;
  readonly versions: Readonly<
    Record<string, { readonly outputSha256: string }>
  >;
}

interface RecipeContracts {
  readonly recipes: Readonly<Record<string, RecipeContract>>;
  readonly schemaVersion: number;
}

if (!baseRef) {
  throw new Error("RECIPE_BASE_REF must identify the pull request base ref.");
}

await executeFile("git", ["cat-file", "-e", `${baseRef}^{commit}`], {
  cwd: repositoryRoot,
});

let baseSource: string | undefined;

try {
  const result = await executeFile(
    "git",
    ["show", `${baseRef}:recipes/contracts.json`],
    { cwd: repositoryRoot }
  );
  baseSource = result.stdout;
} catch {
  process.stdout.write(
    "The base revision predates recipe contract history; no historical entries exist to compare.\n"
  );
}

if (baseSource !== undefined) {
  const base = JSON.parse(baseSource) as RecipeContracts;
  const current = JSON.parse(
    await readFile(path.join(repositoryRoot, "recipes/contracts.json"), "utf-8")
  ) as RecipeContracts;

  for (const [recipeId, baseRecipe] of Object.entries(base.recipes)) {
    const currentRecipe = current.recipes[recipeId];

    if (!currentRecipe) {
      throw new Error(`Recipe contract history was removed for ${recipeId}.`);
    }

    if (currentRecipe.currentVersion < baseRecipe.currentVersion) {
      throw new Error(`Recipe ${recipeId} moved to an earlier version.`);
    }

    for (const [version, contract] of Object.entries(baseRecipe.versions)) {
      if (
        currentRecipe.versions[version]?.outputSha256 !== contract.outputSha256
      ) {
        throw new Error(
          `Published recipe contract ${recipeId} v${version} was changed or removed.`
        );
      }
    }
  }

  process.stdout.write("Published recipe contract history is unchanged.\n");
}
