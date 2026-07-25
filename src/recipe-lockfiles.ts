import { readFileSync } from "node:fs";

import type { ProjectRecipeId } from "./recipes.js";

const recipeRoot = new URL("../recipes/", import.meta.url);

export const readRecipeLockfile = (recipe: ProjectRecipeId): string =>
  readFileSync(new URL(`${recipe}/pnpm-lock.yaml`, recipeRoot), "utf-8");
