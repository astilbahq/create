import { readFile } from "node:fs/promises";
import path from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  createProjectGenerationPlan,
  PROJECT_MANIFEST_PATH,
  PROJECT_MANIFEST_SCHEMA,
} from "../src/manifest.js";
import { projectRecipeIds } from "../src/recipes.js";

const root = path.resolve(import.meta.dirname, "..");
const options = {
  description: "A schema-valid generated project.",
  githubOwner: "example",
  githubRepo: "generated",
  packageName: "@example/generated",
  projectName: "generated",
} as const;

describe("project manifest schema", () => {
  it("validates every generated recipe manifest", async () => {
    const schema = JSON.parse(
      await readFile(path.join(root, "schemas/create-project-v1.json"), "utf-8")
    ) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema
    );

    expect(schema).toMatchObject({
      $id: PROJECT_MANIFEST_SCHEMA,
      $schema: "https://json-schema.org/draft/2020-12/schema",
    });

    for (const recipeId of projectRecipeIds) {
      const manifest = createProjectGenerationPlan(
        recipeId,
        options
      ).files.find((file) => file.path === PROJECT_MANIFEST_PATH);
      const value: unknown = JSON.parse(manifest?.content ?? "");

      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("rejects unsafe paths and malformed structured pointers", async () => {
    const schema = JSON.parse(
      await readFile(path.join(root, "schemas/create-project-v1.json"), "utf-8")
    ) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema
    );
    const manifestFile = createProjectGenerationPlan(
      "typescript-library",
      options
    ).files.find((file) => file.path === PROJECT_MANIFEST_PATH);
    const manifest = JSON.parse(manifestFile?.content ?? "") as {
      ownership: {
        managed: { path: string; sha256: string }[];
        structured: { fields: { pointer: string; sha256: string }[] }[];
      };
    };

    expect(
      validate({
        ...manifest,
        ownership: {
          ...manifest.ownership,
          managed: [
            ...manifest.ownership.managed,
            { path: "nested\\escape", sha256: "0".repeat(64) },
          ],
        },
      })
    ).toBe(false);
    expect(
      validate({
        ...manifest,
        ownership: {
          ...manifest.ownership,
          structured: [
            {
              fields: [{ pointer: "/invalid~pointer", sha256: "0".repeat(64) }],
              path: "package.json",
            },
          ],
        },
      })
    ).toBe(false);
  });
});
