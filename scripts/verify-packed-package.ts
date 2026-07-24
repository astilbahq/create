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
  cwd: string
): Promise<string> => {
  const { stderr, stdout } = await executeFile(command, [...arguments_], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
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
  const allowedFiles = new Set([
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
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
      "--install",
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
    result.installed !== true
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
    const binPath = path.join(
      temporaryRoot,
      "node_modules",
      "create-astilba",
      "dist",
      "bin.js"
    );
    const binSource = await readFile(binPath, "utf-8");

    if (!binSource.startsWith("#!/usr/bin/env node\n")) {
      throw new Error("Packed CLI entrypoint is missing its Node.js shebang.");
    }

    const help = await run(
      "npm",
      ["exec", "--prefix", temporaryRoot, "--", "create-astilba", "--help"],
      temporaryRoot
    );

    if (!help.includes("Create a project with Astilba")) {
      throw new Error("Packed CLI help output is invalid.");
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
