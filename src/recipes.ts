import type { ProjectProfileName } from "./profiles/index.js";

export const projectRecipeIds = [
  "typescript-library",
  "react-vite-spa",
  "astro-static-site",
  "cloudflare-worker-service",
] as const;

export type ProjectRecipeId = (typeof projectRecipeIds)[number];

export interface ProjectRecipe {
  readonly description: string;
  readonly id: ProjectRecipeId;
  readonly label: string;
  readonly profile: ProjectProfileName;
  readonly version: number;
}

const recipes: readonly ProjectRecipe[] = [
  {
    description: "An ESM package with declarations and packaging checks.",
    id: "typescript-library",
    label: "TypeScript library",
    profile: "library",
    version: 2,
  },
  {
    description: "A client-rendered React application built with Vite.",
    id: "react-vite-spa",
    label: "React + Vite application",
    profile: "react",
    version: 2,
  },
  {
    description: "A statically rendered Astro site.",
    id: "astro-static-site",
    label: "Astro static site",
    profile: "astro",
    version: 2,
  },
  {
    description: "A TypeScript service running on Cloudflare Workers.",
    id: "cloudflare-worker-service",
    label: "Cloudflare Worker service",
    profile: "workers",
    version: 2,
  },
];

export const recipeRegistry: ReadonlyMap<ProjectRecipeId, ProjectRecipe> =
  new Map(recipes.map((recipe) => [recipe.id, Object.freeze(recipe)]));

export const isProjectRecipeId = (value: string): value is ProjectRecipeId =>
  projectRecipeIds.some((recipeId) => recipeId === value);

export const getProjectRecipe = (id: ProjectRecipeId): ProjectRecipe => {
  const recipe = recipeRegistry.get(id);

  if (!recipe) {
    throw new Error(`Unknown project recipe "${id}".`);
  }

  return recipe;
};
