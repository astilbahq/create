import type { ProjectOptions } from "../options.js";
import { validateProjectOptions } from "../options.js";
import { compareCodeUnits } from "./compare.js";
import { buildPackageJson } from "./package-json.js";
import { normalizeOutputPath } from "./paths.js";
import { buildPnpmWorkspace } from "./pnpm-workspace.js";
import { substitutePlaceholders } from "./substitute.js";
import type {
  GenerationPlan,
  PlannedFile,
  PlannedSymlink,
  Profile,
} from "./types.js";

const consumeRejectedValidation = async (value: unknown): Promise<void> => {
  try {
    await value;
  } catch {
    // The synchronous contract error is the actionable failure.
  }
};

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

const validateProfileRegistry = (
  registry: ReadonlyMap<string, Profile>
): void => {
  for (const [name, profile] of registry) {
    if (profile.name !== name) {
      throw new Error(
        `Profile registry key "${name}" does not match profile name "${profile.name}".`
      );
    }

    for (const requiredName of profile.requires ?? []) {
      if (requiredName === name) {
        throw new Error(`Profile "${name}" must not require itself.`);
      }

      if (!registry.has(requiredName)) {
        throw new Error(
          `Profile "${name}" requires unknown profile "${requiredName}".`
        );
      }
    }

    for (const conflictName of profile.conflicts ?? []) {
      if (conflictName === name) {
        throw new Error(`Profile "${name}" must not conflict with itself.`);
      }

      if (!registry.has(conflictName)) {
        throw new Error(
          `Profile "${name}" conflicts with unknown profile "${conflictName}".`
        );
      }
    }
  }

  for (const name of registry.keys()) {
    resolveProfiles([name], registry);
  }
};

export const createProfileRegistry = (
  profiles: readonly Profile[]
): ReadonlyMap<string, Profile> => {
  const registry = new Map<string, Profile>();

  for (const profile of profiles) {
    if (registry.has(profile.name)) {
      throw new Error(`Duplicate profile name: "${profile.name}".`);
    }

    registry.set(profile.name, profile);
  }

  validateProfileRegistry(registry);
  return registry;
};

const validatePortablePathSet = (
  plannedByPath: ReadonlyMap<string, { readonly path: string }>
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

export const appendPlannedFile = (
  plan: GenerationPlan,
  file: PlannedFile
): GenerationPlan => {
  const path = normalizeOutputPath(file.path);
  const existingOutputs = new Map<string, { readonly path: string }>([
    ...plan.files.map(
      (plannedFile) => [plannedFile.path, plannedFile] as const
    ),
    ...(plan.symlinks ?? []).map(
      (plannedSymlink) => [plannedSymlink.path, plannedSymlink] as const
    ),
  ]);
  const existing = existingOutputs.get(path);

  if (existing !== undefined) {
    throw new Error(`Output collision at "${path}".`);
  }

  const appendedFile = Object.freeze({ ...file, path });
  existingOutputs.set(path, appendedFile);
  validatePortablePathSet(existingOutputs);

  return Object.freeze({
    ...plan,
    files: Object.freeze(
      [...plan.files, appendedFile].toSorted((left, right) =>
        compareCodeUnits(left.path, right.path)
      )
    ),
  });
};

const planSymlinks = (
  profiles: readonly Profile[],
  plannedByPath: ReadonlyMap<string, PlannedFile>
): Map<string, PlannedSymlink> => {
  const symlinkByPath = new Map<string, PlannedSymlink>();

  for (const profile of profiles) {
    for (const declaration of profile.symlinks ?? []) {
      const path = normalizeOutputPath(declaration.path);
      const targetPath = normalizeOutputPath(declaration.targetPath);
      const previous =
        plannedByPath.get(path)?.origin ?? symlinkByPath.get(path)?.origin;

      if (previous !== undefined) {
        throw new Error(
          `Output collision at "${path}" between "${previous}" and "${profile.name}".`
        );
      }

      symlinkByPath.set(path, {
        origin: profile.name,
        path,
        targetPath,
      });
    }
  }

  for (const symlink of symlinkByPath.values()) {
    if (!plannedByPath.has(symlink.targetPath)) {
      throw new Error(
        `Symlink "${symlink.path}" must target a planned file, but "${symlink.targetPath}" is not one.`
      );
    }
  }

  return symlinkByPath;
};

export const createGenerationPlan = (
  selectedNames: readonly string[],
  registry: ReadonlyMap<string, Profile>,
  rawOptions: ProjectOptions
): GenerationPlan => {
  if (selectedNames.length === 0) {
    throw new Error("At least one profile must be selected.");
  }

  validateProfileRegistry(registry);
  const options = validateProjectOptions(rawOptions);
  const profiles = resolveProfiles(selectedNames, registry);
  const plannedByPath = new Map<string, PlannedFile>();

  for (const profile of profiles) {
    const validationResult: unknown = profile.validateOptions?.(options);

    if (validationResult !== undefined) {
      void consumeRejectedValidation(validationResult);
      throw new Error(
        `Profile "${profile.name}" option validation must be synchronous.`
      );
    }

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
        ownership: declaration.ownership ?? "managed",
        path,
      });
    }
  }

  const pnpmWorkspace = buildPnpmWorkspace(profiles);

  if (pnpmWorkspace !== undefined) {
    if (plannedByPath.has("pnpm-workspace.yaml")) {
      throw new Error(
        'Output collision at "pnpm-workspace.yaml"; use allowedBuildDependencies instead.'
      );
    }

    plannedByPath.set("pnpm-workspace.yaml", {
      content: pnpmWorkspace,
      mode: 0o644,
      origin: "pnpm-workspace-reducer",
      ownership: "managed",
      path: "pnpm-workspace.yaml",
    });
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
      ownership: "structured",
      path: "package.json",
    });
  }

  const symlinkByPath = planSymlinks(profiles, plannedByPath);
  const plannedOutputs = new Map<string, { readonly path: string }>([
    ...plannedByPath,
    ...symlinkByPath,
  ]);
  validatePortablePathSet(plannedOutputs);

  const files = [...plannedByPath.values()].toSorted((left, right) =>
    compareCodeUnits(left.path, right.path)
  );
  const symlinks = [...symlinkByPath.values()].toSorted((left, right) =>
    compareCodeUnits(left.path, right.path)
  );

  return Object.freeze({
    files: Object.freeze(files.map((file) => Object.freeze(file))),
    profiles: Object.freeze(profiles.map((profile) => profile.name)),
    symlinks: Object.freeze(symlinks.map((symlink) => Object.freeze(symlink))),
  });
};
