import path from "node:path";

import { applyGenerationPlan } from "../src/generator/apply.js";
import { createProjectGenerationPlan } from "../src/manifest.js";

const foundationRoot = path.resolve(import.meta.dirname, "..");
const destination = path.join(foundationRoot, ".generated-audit");
const plan = createProjectGenerationPlan("typescript-library", {
  description: "Generated workflow audit fixture.",
  githubOwner: "example",
  githubRepo: "generated-audit",
  packageName: "generated-audit",
  projectName: "generated-audit",
});

await applyGenerationPlan(plan, destination, {
  initializeGit: false,
});
