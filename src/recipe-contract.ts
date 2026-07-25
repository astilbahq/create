import { createHash } from "node:crypto";

import {
  createProjectGenerationPlan,
  PROJECT_MANIFEST_PATH,
} from "./manifest.js";
import type { ProjectRecipeId } from "./recipes.js";

const canonicalOptions = {
  description: "Canonical Astilba Create recipe.",
  githubOwner: "astilba",
  githubRepo: "generated-project",
  packageName: "@astilba/generated-project",
  projectName: "generated-project",
} as const;

export const digestRecipeOutput = (recipeId: ProjectRecipeId): string => {
  const plan = createProjectGenerationPlan(recipeId, canonicalOptions);
  const contract = {
    files: plan.files
      .filter((file) => file.path !== PROJECT_MANIFEST_PATH)
      .map((file) => ({
        content: file.content,
        mode: file.mode,
        origin: file.origin,
        ownership: file.ownership,
        path: file.path,
      })),
    profiles: plan.profiles,
    symlinks: plan.symlinks ?? [],
  };

  return createHash("sha256")
    .update(JSON.stringify(contract), "utf-8")
    .digest("hex");
};
