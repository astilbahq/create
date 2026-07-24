import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { digestRecipeOutput } from "../src/recipe-contract.js";
import { getProjectRecipe, projectRecipeIds } from "../src/recipes.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const recipesDirectory = path.join(repositoryRoot, "recipes");
const contractsPath = path.join(recipesDirectory, "contracts.json");

interface RecipeContract {
  readonly currentVersion: number;
  readonly versions: Readonly<
    Record<string, { readonly outputSha256: string }>
  >;
}

interface RecipeContracts {
  readonly recipes: Readonly<Record<string, RecipeContract>>;
  readonly schemaVersion: 1;
}

const readContracts = async (): Promise<RecipeContracts> => {
  try {
    return JSON.parse(
      await readFile(contractsPath, "utf-8")
    ) as RecipeContracts;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { recipes: {}, schemaVersion: 1 };
    }

    throw error;
  }
};

const existing = await readContracts();

for (const recipeId of Object.keys(existing.recipes)) {
  if (!projectRecipeIds.some((candidate) => candidate === recipeId)) {
    throw new Error(
      `Published recipe ${recipeId} is missing from the recipe catalogue. Recipe IDs and contract history cannot be removed.`
    );
  }
}

const recipes = Object.fromEntries(
  projectRecipeIds.map((recipeId) => {
    const { version } = getProjectRecipe(recipeId);
    const outputSha256 = digestRecipeOutput(recipeId);
    const previous = existing.recipes[recipeId];
    const recorded = previous?.versions[String(version)];

    if (previous && version < previous.currentVersion) {
      throw new Error(
        `Recipe ${recipeId} cannot move from version ${previous.currentVersion} back to ${version}.`
      );
    }

    if (previous && version > previous.currentVersion + 1) {
      throw new Error(
        `Recipe ${recipeId} must advance one version at a time; expected ${previous.currentVersion + 1}, received ${version}.`
      );
    }

    if (recorded && recorded.outputSha256 !== outputSha256) {
      throw new Error(
        `Recipe ${recipeId} version ${version} already has a different output contract. Increment the recipe version before updating contracts.`
      );
    }

    if (
      previous &&
      version > previous.currentVersion &&
      Object.values(previous.versions).some(
        (contract) => contract.outputSha256 === outputSha256
      )
    ) {
      throw new Error(
        `Recipe ${recipeId} version ${version} repeats an earlier output contract. Do not increment a recipe version without an output change.`
      );
    }

    return [
      recipeId,
      {
        currentVersion: version,
        versions: {
          ...previous?.versions,
          [version]: { outputSha256 },
        },
      },
    ];
  })
);
const contracts: RecipeContracts = { recipes, schemaVersion: 1 };

await mkdir(recipesDirectory, { recursive: true });
await writeFile(
  contractsPath,
  `${JSON.stringify(contracts, null, 2)}\n`,
  "utf-8"
);
process.stdout.write("Updated recipe contracts.\n");
