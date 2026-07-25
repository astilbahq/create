import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { digestRecipeOutput } from "../src/recipe-contract.js";
import { getProjectRecipe, projectRecipeIds } from "../src/recipes.js";

interface RecipeContracts {
  readonly recipes: Readonly<
    Record<
      string,
      {
        readonly currentVersion: number;
        readonly versions: Readonly<
          Record<string, { readonly outputSha256: string }>
        >;
      }
    >
  >;
  readonly schemaVersion: number;
}

const root = path.resolve(import.meta.dirname, "..");

describe("recipe compatibility contracts", () => {
  it("requires an intentional recipe version and fingerprint update", async () => {
    const contracts = JSON.parse(
      await readFile(path.join(root, "recipes/contracts.json"), "utf-8")
    ) as RecipeContracts;

    expect(contracts.schemaVersion).toBe(1);
    expect(Object.keys(contracts.recipes)).toEqual(projectRecipeIds);

    for (const recipeId of projectRecipeIds) {
      const recipe = contracts.recipes[recipeId];
      const { version } = getProjectRecipe(recipeId);

      expect(recipe?.currentVersion).toBe(version);
      expect(recipe?.versions[String(version)]).toEqual({
        outputSha256: digestRecipeOutput(recipeId),
      });
      expect(Object.keys(recipe?.versions ?? {}).map(Number)).toEqual(
        Array.from({ length: version }, (_, index) => index + 1)
      );
    }
  });
});
