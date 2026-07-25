import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Writable } from "node:stream";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  CATALOG_OUTPUT_SCHEMA_VERSION,
  createCatalogResult,
  parseCliArguments,
  runCli,
} from "../src/cli.js";
import { CREATE_ASTILBA_VERSION } from "../src/manifest.js";
import { projectRecipeIds } from "../src/recipes.js";
import type { CliTerminal } from "../src/terminal.js";

const root = path.resolve(import.meta.dirname, "..");

const createTextOutput = (): {
  readonly read: () => string;
  readonly stream: Writable;
} => {
  let output = "";
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf-8");
  });

  return {
    read: () => output,
    stream,
  };
};

const createFailingTerminal = (): CliTerminal => ({
  cancel: () => {
    throw new Error("Catalog mode must not render terminal UI.");
  },
  confirm: () => {
    throw new Error("Catalog mode must not prompt.");
  },
  intro: () => {
    throw new Error("Catalog mode must not render terminal UI.");
  },
  note: () => {
    throw new Error("Catalog mode must not render terminal UI.");
  },
  outro: () => {
    throw new Error("Catalog mode must not render terminal UI.");
  },
  select: () => {
    throw new Error("Catalog mode must not prompt.");
  },
  spinner: () => {
    throw new Error("Catalog mode must not render terminal UI.");
  },
  text: () => {
    throw new Error("Catalog mode must not prompt.");
  },
});

describe("recipe catalog", () => {
  it("parses catalog mode without project input", () => {
    expect(parseCliArguments(["--catalog", "--json"])).toEqual({
      command: "catalog",
      json: true,
    });
  });

  it.each([
    ["destination", "--catalog"],
    ["--catalog", "--description", "Example"],
    ["--catalog", "--dry-run"],
    ["--catalog", "--git"],
    ["--catalog", "--no-git"],
    ["--catalog", "--github-owner", "example"],
    ["--catalog", "--github-repo", "example"],
    ["--catalog", "--install"],
    ["--catalog", "--no-install"],
    ["--catalog", "--package-name", "example"],
    ["--catalog", "--project-name", "example"],
    ["--catalog", "--recipe", "typescript-library"],
    ["--catalog", "--yes"],
  ])("rejects project input in catalog mode: %s", (...arguments_) => {
    expect(() => parseCliArguments(arguments_)).toThrow(
      "--catalog can only be combined with --json."
    );
  });

  it("derives a minimal deterministic public catalog from the recipe registry", () => {
    const first = createCatalogResult();
    const second = createCatalogResult();

    expect(first).toEqual(second);
    expect(first).toEqual({
      command: "catalog",
      generator: {
        name: "create-astilba",
        version: CREATE_ASTILBA_VERSION,
      },
      ok: true,
      recipes: [
        {
          description: "An ESM package with declarations and packaging checks.",
          id: "typescript-library",
          label: "TypeScript library",
          version: 2,
        },
        {
          description: "A client-rendered React application built with Vite.",
          id: "react-vite-spa",
          label: "React + Vite application",
          version: 2,
        },
        {
          description: "A statically rendered Astro site.",
          id: "astro-static-site",
          label: "Astro static site",
          version: 2,
        },
        {
          description: "A TypeScript service running on Cloudflare Workers.",
          id: "cloudflare-worker-service",
          label: "Cloudflare Worker service",
          version: 2,
        },
      ],
      schemaVersion: CATALOG_OUTPUT_SCHEMA_VERSION,
    });
    expect(first.recipes.map((recipe) => recipe.id)).toEqual(projectRecipeIds);
    expect(JSON.stringify(first)).not.toContain("profile");
  });

  it("conforms to the packaged strict JSON schema", async () => {
    const schema = JSON.parse(
      await readFile(path.join(root, "schemas/catalog-v1.json"), "utf-8")
    ) as object;
    const validate = new Ajv2020({ strict: true }).compile(schema);

    expect(validate(createCatalogResult())).toBe(true);
    expect(validate.errors).toBeNull();
    expect(
      validate({
        ...createCatalogResult(),
        generator: {
          name: "create-astilba",
          version: "1.0.0-01",
        },
      })
    ).toBe(false);
  });

  it("emits exactly one JSON object without prompting or terminal rendering", async () => {
    const output = createTextOutput();

    await runCli(["--catalog", "--json"], {
      interactive: true,
      output: output.stream,
      terminal: createFailingTerminal(),
    });

    expect(output.read()).toBe(`${JSON.stringify(createCatalogResult())}\n`);
  });

  it("renders a human-readable catalog from the same public data", async () => {
    const output = createTextOutput();

    await runCli(["--catalog"], {
      interactive: false,
      output: output.stream,
      terminal: createFailingTerminal(),
    });

    expect(output.read()).toContain(
      `Astilba Create ${CREATE_ASTILBA_VERSION}\n\nAvailable recipes:`
    );

    for (const recipe of createCatalogResult().recipes) {
      expect(output.read()).toContain(
        `${recipe.id}\n    ${recipe.label} — ${recipe.description}`
      );
    }
  });
});
