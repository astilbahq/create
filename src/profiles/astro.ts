import type { Profile } from "../generator/types.js";
import { dependencyVersions } from "./dependency-versions.js";
import { file, projectProfileConflicts, seededFile } from "./shared.js";

export const astroProfile: Profile = {
  allowedBuildDependencies: ["sharp"],
  conflicts: projectProfileConflicts("astro"),
  files: [
    file(
      "astro.config.mjs",
      `
import { defineConfig } from "astro/config";

export default defineConfig({});
`
    ),
    file(
      "knip.json",
      `
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["src/pages/**/*.astro!"],
  "project": ["src/**/*.{astro,ts}!", "*.config.{mjs,ts}!"]
}
`
    ),
    seededFile(
      "src/pages/index.astro",
      `
---
const title = "{{foundation:projectName}}";
const description = {{foundation:descriptionJson}};
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content={description} />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
  </head>
  <body>
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  </body>
</html>
`
    ),
    seededFile(
      "tests/smoke.test.ts",
      `
import { describe, expect, it } from "vitest";

describe("project", () => {
  it("has a name", () => {
    expect("{{foundation:projectName}}").not.toHaveLength(0);
  });
});
`
    ),
    file(
      "tsconfig.json",
      `
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
`
    ),
    file(
      "vitest.config.ts",
      `
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
`
    ),
  ],
  name: "astro",
  packageJson: {
    dependencies: {
      astro: dependencyVersions.astro,
    },
    devDependencies: {
      "@astrojs/check": dependencyVersions["@astrojs/check"],
      "@types/node": dependencyVersions["@types/node"],
    },
    fields: {
      private: true,
    },
    scripts: {
      build: "astro build",
      dev: "astro dev",
      knip: "knip",
      preview: "astro preview",
      test: "vitest run",
      "test:watch": "vitest",
      typecheck: "astro check",
      verify:
        "pnpm check && pnpm typecheck && pnpm test && pnpm knip && pnpm build",
    },
  },
  requires: ["base"],
};
