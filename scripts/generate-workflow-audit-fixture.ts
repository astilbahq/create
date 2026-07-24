import path from "node:path";

import { applyGenerationPlan } from "../src/generator/apply.js";
import { createGenerationPlan } from "../src/generator/plan.js";
import { profileRegistry } from "../src/profiles/index.js";

const foundationRoot = path.resolve(import.meta.dirname, "..");
const destination = path.join(foundationRoot, ".generated-audit");
const plan = createGenerationPlan(["library"], profileRegistry, {
  description: "Generated workflow audit fixture.",
  githubOwner: "example",
  githubRepo: "generated-audit",
  packageName: "generated-audit",
  projectName: "generated-audit",
});

await applyGenerationPlan(plan, destination, {
  initializeGit: false,
});
