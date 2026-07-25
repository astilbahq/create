import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createGenerationPlan } from "../src/generator/plan.js";
import { profileRegistry } from "../src/profiles/index.js";
import { toolchainVersions } from "../src/profiles/toolchain-versions.js";
import { getProjectRecipe, projectRecipeIds } from "../src/recipes.js";
import {
  CANONICAL_PNPM_CONFIG,
  createCanonicalPnpmEnvironment,
} from "./canonical-pnpm-environment.js";

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const canonicalOptions = {
  description: "Canonical Astilba Create recipe.",
  githubOwner: "astilba",
  githubRepo: "generated-project",
  packageName: "@astilba/generated-project",
  projectName: "generated-project",
} as const;

const main = async (): Promise<void> => {
  const temporaryRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-lockfiles-")
  );

  try {
    await writeFile(
      path.join(temporaryRoot, ".npmrc"),
      CANONICAL_PNPM_CONFIG,
      "utf-8"
    );
    const environment = createCanonicalPnpmEnvironment(temporaryRoot);

    for (const recipeId of projectRecipeIds) {
      const recipe = getProjectRecipe(recipeId);
      const destination = path.join(temporaryRoot, recipeId);
      const plan = createGenerationPlan(
        [recipe.profile],
        profileRegistry,
        canonicalOptions
      );
      const dependencyInputs = new Map(
        plan.files
          .filter((file) =>
            ["package.json", "pnpm-workspace.yaml"].includes(file.path)
          )
          .map((file) => [file.path, file.content])
      );

      // oxlint-disable-next-line eslint/no-await-in-loop -- Lockfiles are generated serially to avoid multiplying registry traffic.
      await mkdir(destination);

      for (const input of ["package.json", "pnpm-workspace.yaml"] as const) {
        const content = dependencyInputs.get(input);

        if (!content) {
          throw new Error(
            `Recipe ${recipeId} did not generate required dependency input ${input}.`
          );
        }

        // oxlint-disable-next-line eslint/no-await-in-loop -- Both dependency inputs must exist before pnpm resolves the recipe.
        await writeFile(path.join(destination, input), content, "utf-8");
      }

      // oxlint-disable-next-line eslint/no-await-in-loop -- Each command depends on its generated project tree.
      await executeFile(
        "corepack",
        [
          `pnpm@${toolchainVersions.pnpm}`,
          "install",
          "--lockfile-only",
          "--ignore-scripts",
          "--reporter=silent",
        ],
        {
          cwd: destination,
          env: environment,
          maxBuffer: 20 * 1024 * 1024,
        }
      );

      // oxlint-disable-next-line eslint/no-await-in-loop -- Each canonical lockfile is written after its corresponding install.
      const lockfile = await readFile(
        path.join(destination, "pnpm-lock.yaml"),
        "utf-8"
      );
      const canonicalDirectory = path.join(repositoryRoot, "recipes", recipeId);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Directory creation belongs to the current recipe.
      await mkdir(canonicalDirectory, { recursive: true });
      // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve deterministic recipe order in command output and writes.
      await writeFile(
        path.join(canonicalDirectory, "pnpm-lock.yaml"),
        lockfile,
        "utf-8"
      );
      process.stdout.write(`Updated ${recipeId} lockfile.\n`);
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

await main();
