import type { Profile } from "../generator/types.js";
import { dependencyVersions } from "./dependency-versions.js";
import { file, projectProfileConflicts, seededFile } from "./shared.js";

const WORKER_NAME_PATTERN = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u;

export const workersProfile: Profile = {
  conflicts: projectProfileConflicts("workers"),
  files: [
    file(
      "knip.json",
      `
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["tests/**/*.test.ts!"],
  "ignoreDependencies": ["cloudflare"],
  "project": ["src/**/*.ts!", "tests/**/*.ts!", "*.config.ts!"]
}
`
    ),
    seededFile(
      "src/index.ts",
      `
export default {
  fetch(): Promise<Response> {
    return Promise.resolve(
      Response.json({
        name: "{{foundation:projectName}}",
        ok: true,
      })
    );
  },
} satisfies ExportedHandler<CloudflareBindings>;
`
    ),
    seededFile(
      "tests/index.test.ts",
      `
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("returns a successful response", async () => {
    const response = await exports.default.fetch("https://example.com");

    await expect(response.json()).resolves.toEqual({
      name: "{{foundation:projectName}}",
      ok: true,
    });
  });
});
`
    ),
    file(
      "tests/tsconfig.json",
      `
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "skipLibCheck": true,
    "types": ["@cloudflare/vitest-pool-workers/types"]
  },
  "include": ["../worker-configuration.d.ts", "../src/**/*.ts", "./**/*.ts"]
}
`
    ),
    file(
      "tsconfig.config.json",
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
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2023",
    "types": ["node"],
    "verbatimModuleSyntax": true
  },
  "include": ["vitest.config.ts"]
}
`
    ),
    file(
      "tsconfig.json",
      `
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "strict": true,
    "target": "ES2023",
    "verbatimModuleSyntax": true
  },
  "include": ["worker-configuration.d.ts", "src/**/*.ts"]
}
`
    ),
    file(
      "vitest.config.ts",
      `
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
`
    ),
    file(
      "wrangler.jsonc",
      `
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{foundation:projectName}}",
  // Revision-pinned to the newest date supported by the pinned workerd runtime.
  "compatibility_date": "2026-07-15",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/index.ts",
  "observability": {
    "enabled": true,
    "logs": {
      "head_sampling_rate": 1,
    },
    "traces": {
      "enabled": true,
      "head_sampling_rate": 0.01,
    },
  },
}
`
    ),
  ],
  name: "workers",
  packageJson: {
    devDependencies: {
      "@cloudflare/vitest-pool-workers":
        dependencyVersions["@cloudflare/vitest-pool-workers"],
      "@types/node": dependencyVersions["@types/node"],
      wrangler: dependencyVersions.wrangler,
    },
    fields: {
      private: true,
    },
    scripts: {
      build: "pnpm types && wrangler deploy --dry-run --outdir dist",
      deploy: "wrangler deploy",
      dev: "wrangler dev",
      knip: "knip",
      test: "pnpm types && vitest run",
      "test:watch": "pnpm types && vitest",
      typecheck:
        "pnpm types && tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/tsconfig.json && tsc --noEmit -p tsconfig.config.json",
      types: "wrangler types --env-interface CloudflareBindings",
      verify:
        "pnpm check && pnpm typecheck && pnpm test && pnpm knip && pnpm build",
    },
  },
  requires: ["base"],
  validateOptions: (options): undefined => {
    if (!WORKER_NAME_PATTERN.test(options.projectName)) {
      throw new Error(
        "A Cloudflare Worker project name must contain at most 63 lowercase letters, digits, or dashes, and must not start or end with a dash."
      );
    }
  },
};
