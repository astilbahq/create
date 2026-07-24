import type { Profile } from "../generator/types.js";
import { dependencyVersions } from "./dependency-versions.js";
import { file, projectProfileConflicts, seededFile } from "./shared.js";

export const libraryProfile: Profile = {
  conflicts: projectProfileConflicts("library"),
  files: [
    file(
      "knip.json",
      `
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["tests/**/*.test.ts!"],
  "project": ["src/**/*.ts!", "tests/**/*.ts!", "*.config.ts!"]
}
`
    ),
    seededFile(
      "src/index.ts",
      `
export const greet = (name: string): string => \`Hello, \${name}!\`;
`
    ),
    seededFile(
      "tests/index.test.ts",
      `
import { describe, expect, it } from "vitest";

import { greet } from "../src/index.js";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("world")).toBe("Hello, world!");
  });
});
`
    ),
    file(
      "tsconfig.build.json",
      `
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests/**/*.ts", "*.config.ts"]
}
`
    ),
    file(
      "tsconfig.json",
      `
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "strict": true,
    "target": "ES2023",
    "types": ["node", "vitest/globals"],
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "*.config.ts"]
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
  name: "library",
  packageJson: {
    devDependencies: {
      "@arethetypeswrong/cli": dependencyVersions["@arethetypeswrong/cli"],
      "@types/node": dependencyVersions["@types/node"],
      publint: dependencyVersions.publint,
    },
    fields: {
      exports: {
        // oxlint-disable-next-line eslint/sort-keys -- Export condition order changes resolution semantics.
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
      files: ["dist"],
      private: false,
      publishConfig: {
        access: "public",
      },
      sideEffects: false,
    },
    scripts: {
      build: "tsc -p tsconfig.build.json",
      knip: "knip",
      "pack:check": "pnpm build && publint && attw --pack --profile esm-only",
      test: "vitest run",
      "test:watch": "vitest",
      typecheck: "tsc --noEmit",
      verify:
        "pnpm check && pnpm typecheck && pnpm test && pnpm knip && pnpm pack:check",
    },
  },
  requires: ["base"],
};
