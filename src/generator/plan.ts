import type { ProjectOptions } from "../options.js";
import { validateProjectOptions } from "../options.js";
import { compareCodeUnits } from "./compare.js";
import { buildPackageJson } from "./package-json.js";
import { normalizeOutputPath } from "./paths.js";
import { substitutePlaceholders } from "./substitute.js";
import type { GenerationPlan, PlannedFile, Profile } from "./types.js";

const resolveProfiles = (
  selectedNames: readonly string[],
  registry: ReadonlyMap<string, Profile>
): Profile[] => {
  const ordered: Profile[] = [];
  const resolved = new Set<string>();
  const visiting = new Set<string>();

  const visit = (name: string): void => {
    if (resolved.has(name)) {
      return;
    }

    if (visiting.has(name)) {
      throw new Error(`Profile dependency cycle includes "${name}".`);
    }

    const profile = registry.get(name);

    if (!profile) {
      throw new Error(`Unknown profile: ${name}.`);
    }

    if (profile.name !== name) {
      throw new Error(
        `Profile registry key "${name}" does not match profile name "${profile.name}".`
      );
    }

    visiting.add(name);

    for (const requiredName of profile.requires ?? []) {
      visit(requiredName);
    }

    visiting.delete(name);
    resolved.add(name);
    ordered.push(profile);
  };

  for (const name of selectedNames) {
    visit(name);
  }

  const selected = new Set(ordered.map((profile) => profile.name));

  for (const profile of ordered) {
    for (const conflict of profile.conflicts ?? []) {
      if (selected.has(conflict)) {
        throw new Error(
          `Profile "${profile.name}" conflicts with profile "${conflict}".`
        );
      }
    }
  }

  return ordered;
};

const validatePortablePathSet = (
  plannedByPath: ReadonlyMap<string, PlannedFile>
): void => {
  const pathByPortableKey = new Map<string, string>();

  for (const path of plannedByPath.keys()) {
    const portableKey = path.toLowerCase();
    const existing = pathByPortableKey.get(portableKey);

    if (existing !== undefined && existing !== path) {
      throw new Error(
        `Output paths "${existing}" and "${path}" collide on case-insensitive filesystems.`
      );
    }

    pathByPortableKey.set(portableKey, path);
  }

  for (const path of plannedByPath.keys()) {
    const segments = path.toLowerCase().split("/");

    for (let length = 1; length < segments.length; length += 1) {
      const parent = segments.slice(0, length).join("/");
      const blockingPath = pathByPortableKey.get(parent);

      if (blockingPath !== undefined) {
        throw new Error(
          `Output file "${blockingPath}" blocks descendant path "${path}".`
        );
      }
    }
  }
};

export const createGenerationPlan = (
  selectedNames: readonly string[],
  registry: ReadonlyMap<string, Profile>,
  rawOptions: ProjectOptions
): GenerationPlan => {
  if (selectedNames.length === 0) {
    throw new Error("At least one profile must be selected.");
  }

  const options = validateProjectOptions(rawOptions);
  const profiles = resolveProfiles(selectedNames, registry);
  const plannedByPath = new Map<string, PlannedFile>();

  for (const profile of profiles) {
    for (const declaration of profile.files ?? []) {
      const path = normalizeOutputPath(declaration.path);

      if (plannedByPath.has(path)) {
        const previous = plannedByPath.get(path);
        throw new Error(
          `Output collision at "${path}" between "${previous?.origin}" and "${profile.name}".`
        );
      }

      plannedByPath.set(path, {
        content: substitutePlaceholders(declaration.content, options),
        mode: declaration.mode ?? 0o644,
        origin: profile.name,
        path,
      });
    }
  }

  const packageJson = buildPackageJson(profiles, options);

  if (packageJson !== undefined) {
    if (plannedByPath.has("package.json")) {
      throw new Error(
        'Output collision at "package.json"; use packageJson fragments instead.'
      );
    }

    plannedByPath.set("package.json", {
      content: packageJson,
      mode: 0o644,
      origin: "package-json-reducer",
      path: "package.json",
    });
  }

  validatePortablePathSet(plannedByPath);

  const files = [...plannedByPath.values()].toSorted((left, right) =>
    compareCodeUnits(left.path, right.path)
  );

  return Object.freeze({
    files: Object.freeze(files.map((file) => Object.freeze(file))),
    profiles: Object.freeze(profiles.map((profile) => profile.name)),
  });
};
