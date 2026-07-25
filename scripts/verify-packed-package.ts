import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import { createCatalogResult } from "../src/cli.js";
import {
  PROJECT_MANIFEST_PATH,
  PROJECT_MANIFEST_SCHEMA,
} from "../src/manifest.js";
import { projectRecipeIds } from "../src/recipes.js";

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");

const run = async (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  timeout?: number
): Promise<string> => {
  const { stderr, stdout } = await executeFile(command, [...arguments_], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    ...(timeout === undefined ? {} : { timeout }),
  });

  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }

  return stdout;
};

const createTarball = async (temporaryRoot: string): Promise<string> => {
  const packOutput = await run(
    "pnpm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    repositoryRoot
  );
  const packResult = JSON.parse(packOutput) as {
    readonly filename?: string;
  };

  if (!packResult.filename) {
    throw new Error("pnpm pack did not report the package filename.");
  }

  return path.resolve(repositoryRoot, packResult.filename);
};

const inspectTarball = async (tarball: string): Promise<void> => {
  const tarListing = await run("tar", ["-tzf", tarball], repositoryRoot);
  const entries = tarListing.trim().split("\n").filter(Boolean);
  const recipeLockfiles = projectRecipeIds.map(
    (recipe) => `package/recipes/${recipe}/pnpm-lock.yaml`
  );
  const allowedFiles = new Set([
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
    "package/recipes/contracts.json",
    "package/schemas/catalog-v1.json",
    "package/schemas/create-project-v1.json",
    ...recipeLockfiles,
  ]);
  const unexpected = entries.filter(
    (entry) =>
      !entry.startsWith("package/dist/") &&
      !entry.startsWith("package/dist\\") &&
      !allowedFiles.has(entry)
  );

  if (unexpected.length > 0) {
    throw new Error(
      `Packed package contains unexpected files: ${unexpected.join(", ")}.`
    );
  }

  for (const expected of allowedFiles) {
    if (!entries.includes(expected)) {
      throw new Error(`Packed package is missing ${expected}.`);
    }
  }
};

const verifyGeneratedRecipe = async (
  harnessRoot: string,
  recipe: (typeof projectRecipeIds)[number],
  temporaryRoot: string
): Promise<void> => {
  const destination = path.join(temporaryRoot, recipe);
  const output = await run(
    "npm",
    [
      "exec",
      "--prefix",
      harnessRoot,
      "--",
      "create-astilba",
      recipe,
      "--recipe",
      recipe,
      "--description",
      `Packed ${recipe} consumer.`,
      "--github-owner",
      "example",
      "--package-name",
      `@example/${recipe}`,
      "--no-git",
      "--no-install",
      "--json",
    ],
    temporaryRoot
  );
  const result = JSON.parse(output) as {
    readonly ok?: boolean;
    readonly recipe?: string;
    readonly schemaVersion?: number;
    readonly installed?: boolean;
  };

  if (
    result.ok !== true ||
    result.recipe !== recipe ||
    result.schemaVersion !== 1 ||
    result.installed !== false
  ) {
    throw new Error(`Packed CLI returned an invalid result for ${recipe}.`);
  }

  const manifest = JSON.parse(
    await readFile(path.join(destination, PROJECT_MANIFEST_PATH), "utf-8")
  ) as {
    readonly $schema?: string;
    readonly recipe?: { readonly id?: string };
  };

  if (
    manifest.$schema !== PROJECT_MANIFEST_SCHEMA ||
    manifest.recipe?.id !== recipe
  ) {
    throw new Error(`Generated manifest is invalid for ${recipe}.`);
  }

  await run("pnpm", ["install", "--frozen-lockfile"], destination);
  await run("pnpm", ["verify"], destination);
};

const main = async (): Promise<void> => {
  const temporaryRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-package-")
  );

  try {
    const [explicitTarball] = process.argv.slice(2);
    const tarball = explicitTarball
      ? path.resolve(explicitTarball)
      : await createTarball(temporaryRoot);
    await access(tarball);
    await inspectTarball(tarball);

    await writeFile(
      path.join(temporaryRoot, "package.json"),
      '{"name":"create-astilba-package-test","private":true}\n',
      "utf-8"
    );
    await run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      temporaryRoot
    );
    const installedPackageRoot = path.join(
      temporaryRoot,
      "node_modules",
      "create-astilba"
    );
    const installedPackage = JSON.parse(
      await readFile(path.join(installedPackageRoot, "package.json"), "utf-8")
    ) as { readonly version?: string };

    if (installedPackage.version === undefined) {
      throw new Error("Packed package does not declare a version.");
    }

    const binPath = path.join(installedPackageRoot, "dist", "bin.js");
    const binSource = await readFile(binPath, "utf-8");

    if (!binSource.startsWith("#!/usr/bin/env node\n")) {
      throw new Error("Packed CLI entrypoint is missing its Node.js shebang.");
    }

    const help = await run(
      "npm",
      ["exec", "--prefix", temporaryRoot, "--", "create-astilba", "--help"],
      temporaryRoot
    );

    if (
      !help.includes("Create a project with Astilba") ||
      !help.includes("npx --yes create-astilba@latest --catalog [--json]")
    ) {
      throw new Error("Packed CLI help output is invalid.");
    }

    const catalogOutput = await run(
      "npm",
      [
        "exec",
        "--prefix",
        temporaryRoot,
        "--",
        "create-astilba",
        "--catalog",
        "--json",
      ],
      temporaryRoot,
      10_000
    );
    const catalog = JSON.parse(catalogOutput) as {
      readonly command?: string;
      readonly generator?: { readonly version?: string };
      readonly ok?: boolean;
      readonly recipes?: readonly {
        readonly description?: string;
        readonly id?: string;
        readonly label?: string;
        readonly version?: number;
      }[];
      readonly schemaVersion?: number;
    };

    const catalogSchema = JSON.parse(
      await readFile(
        path.join(installedPackageRoot, "schemas", "catalog-v1.json"),
        "utf-8"
      )
    ) as object;
    const validateCatalog = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(catalogSchema);

    if (!validateCatalog(catalog)) {
      throw new Error(
        `Packed CLI catalog does not match its schema: ${JSON.stringify(
          validateCatalog.errors
        )}`
      );
    }

    if (
      catalog.command !== "catalog" ||
      catalog.generator?.version !== installedPackage.version ||
      catalog.ok !== true ||
      catalog.schemaVersion !== 1 ||
      JSON.stringify(catalog.recipes) !==
        JSON.stringify(createCatalogResult().recipes)
    ) {
      throw new Error("Packed CLI catalog output is invalid.");
    }

    for (const recipe of projectRecipeIds) {
      process.stdout.write(`Verifying packed ${recipe} recipe...\n`);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Verify one dependency-heavy consumer at a time to keep release memory bounded.
      await verifyGeneratedRecipe(temporaryRoot, recipe, temporaryRoot);
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

await main();
