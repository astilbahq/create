import { createProfileRegistry } from "../generator/plan.js";
import type { Profile } from "../generator/types.js";
import { astroProfile } from "./astro.js";
import { baseProfile } from "./base.js";
import { libraryProfile } from "./library.js";
import { reactProfile } from "./react.js";
import { workersProfile } from "./workers.js";

export { projectProfileNames, type ProjectProfileName } from "./shared.js";

const profiles: readonly Profile[] = [
  baseProfile,
  libraryProfile,
  astroProfile,
  reactProfile,
  workersProfile,
];

export const profileRegistry = createProfileRegistry(profiles);
