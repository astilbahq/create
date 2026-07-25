import { createHash } from "node:crypto";

import { compareCodeUnits } from "./generator/compare.js";
import { appendPlannedFile, createGenerationPlan } from "./generator/plan.js";
import type {
  GenerationPlan,
  JsonValue,
  PlannedFile,
} from "./generator/types.js";
import type { ProjectOptions } from "./options.js";
import { profileRegistry } from "./profiles/index.js";
import { readRecipeLockfile } from "./recipe-lockfiles.js";
import { getProjectRecipe } from "./recipes.js";
import type { ProjectRecipeId } from "./recipes.js";

export const CREATE_ASTILBA_VERSION = "0.3.0";
export const PROJECT_MANIFEST_PATH = ".astilba/project.json";
export const PROJECT_MANIFEST_SCHEMA =
  "https://astilba.com/schemas/create/v1.json";

interface OwnedDigest {
  readonly path: string;
  readonly sha256: string;
}

interface StructuredFieldDigest {
  readonly pointer: string;
  readonly sha256: string;
}

interface StructuredFileOwnership {
  readonly fields: readonly StructuredFieldDigest[];
  readonly path: string;
}

interface SymlinkOwnership {
  readonly path: string;
  readonly target: string;
}

interface ProjectManifest {
  readonly $schema: typeof PROJECT_MANIFEST_SCHEMA;
  readonly features: readonly [];
  readonly generator: {
    readonly name: "create-astilba";
    readonly version: string;
  };
  readonly ownership: {
    readonly managed: readonly OwnedDigest[];
    readonly metadata: typeof PROJECT_MANIFEST_PATH;
    readonly seeded: readonly string[];
    readonly structured: readonly StructuredFileOwnership[];
    readonly symlinks: readonly SymlinkOwnership[];
  };
  readonly recipe: {
    readonly id: ProjectRecipeId;
    readonly version: number;
  };
  readonly schemaVersion: 1;
}

const digest = (value: string): string =>
  createHash("sha256").update(value, "utf-8").digest("hex");

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

const flattenStructuredFields = (
  value: JsonValue,
  pointer = ""
): StructuredFieldDigest[] => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return [
      {
        pointer: pointer || "/",
        sha256: digest(JSON.stringify(value)),
      },
    ];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenStructuredFields(
      child,
      `${pointer}/${escapeJsonPointerSegment(key)}`
    )
  );
};

const parseStructuredFile = (file: PlannedFile): StructuredFileOwnership => {
  const parsed: unknown = JSON.parse(file.content);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Structured output "${file.path}" must contain a JSON object.`
    );
  }

  return {
    fields: flattenStructuredFields(parsed as JsonValue).toSorted(
      (left, right) => compareCodeUnits(left.pointer, right.pointer)
    ),
    path: file.path,
  };
};

const createProjectManifest = (
  plan: GenerationPlan,
  recipeId: ProjectRecipeId
): ProjectManifest => {
  const recipe = getProjectRecipe(recipeId);

  return {
    $schema: PROJECT_MANIFEST_SCHEMA,
    features: [],
    generator: {
      name: "create-astilba",
      version: CREATE_ASTILBA_VERSION,
    },
    ownership: {
      managed: plan.files
        .filter((file) => file.ownership === "managed")
        .map((file) => ({
          path: file.path,
          sha256: digest(file.content),
        })),
      metadata: PROJECT_MANIFEST_PATH,
      seeded: plan.files
        .filter((file) => file.ownership === "seeded")
        .map((file) => file.path),
      structured: plan.files
        .filter((file) => file.ownership === "structured")
        .map(parseStructuredFile),
      symlinks: (plan.symlinks ?? []).map((symlink) => ({
        path: symlink.path,
        target: symlink.targetPath,
      })),
    },
    recipe: {
      id: recipe.id,
      version: recipe.version,
    },
    schemaVersion: 1,
  };
};

export const createProjectGenerationPlan = (
  recipeId: ProjectRecipeId,
  options: ProjectOptions
): GenerationPlan => {
  const recipe = getProjectRecipe(recipeId);
  const basePlan = createGenerationPlan(
    [recipe.profile],
    profileRegistry,
    options
  );
  const lockfile: PlannedFile = Object.freeze({
    content: readRecipeLockfile(recipeId),
    mode: 0o644,
    origin: `recipe:${recipeId}:lockfile`,
    ownership: "managed",
    path: "pnpm-lock.yaml",
  });
  const plan = appendPlannedFile(basePlan, lockfile);
  const reservedRoot = PROJECT_MANIFEST_PATH.split("/")[0] ?? ".astilba";
  const conflictingOutput = [
    ...plan.files.map((file) => file.path),
    ...(plan.symlinks ?? []).map((symlink) => symlink.path),
  ].find(
    (path) =>
      path.toLowerCase() === reservedRoot.toLowerCase() ||
      path.toLowerCase().startsWith(`${reservedRoot.toLowerCase()}/`)
  );

  if (conflictingOutput) {
    throw new Error(
      `Output "${conflictingOutput}" conflicts with the Astilba project manifest.`
    );
  }

  const manifest = createProjectManifest(plan, recipeId);
  const manifestFile: PlannedFile = Object.freeze({
    content: `${JSON.stringify(manifest, null, 2)}\n`,
    mode: 0o644,
    origin: "create-astilba-manifest",
    ownership: "metadata",
    path: PROJECT_MANIFEST_PATH,
  });

  return appendPlannedFile(plan, manifestFile);
};
