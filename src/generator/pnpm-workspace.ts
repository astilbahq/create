import { compareCodeUnits } from "./compare.js";
import type { Profile } from "./types.js";

export const buildPnpmWorkspace = (
  profiles: readonly Profile[]
): string | undefined => {
  const allowedBuildDependencies = new Set(
    profiles.flatMap((profile) => profile.allowedBuildDependencies ?? [])
  );

  if (allowedBuildDependencies.size === 0) {
    return undefined;
  }

  const allowBuilds = [...allowedBuildDependencies]
    .toSorted(compareCodeUnits)
    .map((dependency) => `  ${dependency}: true`)
    .join("\n");

  return `packages: []

allowBuilds:
${allowBuilds}

minimumReleaseAge: 4320

# Exact security exception for GHSA-mh99-v99m-4gvg.
minimumReleaseAgeExclude:
  - brace-expansion@5.0.8

overrides:
  "brace-expansion@>=5.0.0 <5.0.8": 5.0.8
`;
};
