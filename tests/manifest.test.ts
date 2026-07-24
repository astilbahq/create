import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CREATE_ASTILBA_VERSION,
  createProjectGenerationPlan,
  PROJECT_MANIFEST_PATH,
  PROJECT_MANIFEST_SCHEMA,
} from "../src/manifest.js";
import { projectRecipeIds } from "../src/recipes.js";

const options = {
  description: "A deterministic generated project.",
  githubOwner: "example",
  githubRepo: "generated",
  packageName: "@example/generated",
  projectName: "generated",
} as const;

const digest = (value: string): string =>
  createHash("sha256").update(value, "utf-8").digest("hex");

describe("project manifest", () => {
  it.each(projectRecipeIds)(
    "records deterministic provenance and ownership for %s",
    (recipe) => {
      const first = createProjectGenerationPlan(recipe, options);
      const second = createProjectGenerationPlan(recipe, options);
      const manifestFile = first.files.find(
        (file) => file.path === PROJECT_MANIFEST_PATH
      );

      expect(first).toEqual(second);
      expect(manifestFile).toBeDefined();

      const manifest = JSON.parse(manifestFile?.content ?? "") as {
        readonly $schema: string;
        readonly features: readonly unknown[];
        readonly generator: {
          readonly name: string;
          readonly version: string;
        };
        readonly ownership: {
          readonly managed: readonly {
            readonly path: string;
            readonly sha256: string;
          }[];
          readonly metadata: string;
          readonly seeded: readonly string[];
          readonly structured: readonly {
            readonly fields: readonly {
              readonly pointer: string;
              readonly sha256: string;
            }[];
            readonly path: string;
          }[];
          readonly symlinks: readonly {
            readonly path: string;
            readonly target: string;
          }[];
        };
        readonly recipe: { readonly id: string; readonly version: number };
        readonly schemaVersion: number;
      };

      expect(manifest).toMatchObject({
        $schema: PROJECT_MANIFEST_SCHEMA,
        features: [],
        generator: {
          name: "create-astilba",
          version: CREATE_ASTILBA_VERSION,
        },
        recipe: { id: recipe, version: 1 },
        schemaVersion: 1,
      });

      const ownedPaths = [
        ...manifest.ownership.managed.map((entry) => entry.path),
        manifest.ownership.metadata,
        ...manifest.ownership.seeded,
        ...manifest.ownership.structured.map((entry) => entry.path),
      ].toSorted();
      const generatedPaths = first.files.map((file) => file.path).toSorted();

      expect(ownedPaths).toEqual(generatedPaths);
      expect(new Set(ownedPaths).size).toBe(ownedPaths.length);
      expect(manifest.ownership.metadata).toBe(PROJECT_MANIFEST_PATH);
      expect(manifestFile?.ownership).toBe("metadata");
      expect(manifest.ownership.symlinks).toEqual([
        { path: "CLAUDE.md", target: "AGENTS.md" },
      ]);

      for (const entry of manifest.ownership.managed) {
        const file = first.files.find(
          (candidate) => candidate.path === entry.path
        );
        expect(entry.sha256).toBe(digest(file?.content ?? ""));
      }

      expect(manifest.ownership.structured).toHaveLength(1);
      expect(manifest.ownership.structured[0]?.path).toBe("package.json");
      expect(
        manifest.ownership.structured[0]?.fields.some(
          (field) => field.pointer === "/scripts/verify"
        )
      ).toBe(true);
    }
  );

  it("keeps application source seeded and configuration managed", () => {
    const plan = createProjectGenerationPlan("react-vite-spa", options);
    const manifestFile = plan.files.find(
      (file) => file.path === PROJECT_MANIFEST_PATH
    );
    const manifest = JSON.parse(manifestFile?.content ?? "") as {
      readonly ownership: {
        readonly managed: readonly { readonly path: string }[];
        readonly seeded: readonly string[];
      };
    };

    expect(manifest.ownership.seeded).toContain("src/app.tsx");
    expect(manifest.ownership.seeded).toContain("src/main.tsx");
    expect(manifest.ownership.managed.map((entry) => entry.path)).toContain(
      "vite.config.ts"
    );
  });

  it("does not capture ambient or sensitive provenance", () => {
    const manifest = createProjectGenerationPlan(
      "typescript-library",
      options
    ).files.find((file) => file.path === PROJECT_MANIFEST_PATH)?.content;

    expect(manifest).toBeDefined();
    expect(manifest).not.toContain(process.cwd());
    expect(manifest).not.toContain("createdAt");
    expect(manifest).not.toContain("timestamp");
    expect(manifest).not.toContain("token");
  });
});
