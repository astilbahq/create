export { applyGenerationPlan } from "./generator/apply.js";
export { createGenerationPlan } from "./generator/plan.js";
export { normalizeOutputPath, resolveOutputPath } from "./generator/paths.js";
export { substitutePlaceholders } from "./generator/substitute.js";
export { validateProjectOptions } from "./options.js";
export type {
  GenerationPlan,
  JsonValue,
  PackageJsonFragment,
  PlannedFile,
  Profile,
  TextFileDeclaration,
} from "./generator/types.js";
export type { ApplyPlanOptions } from "./generator/apply.js";
export type { ProjectOptions } from "./options.js";
