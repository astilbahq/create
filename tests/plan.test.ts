import { setImmediate as waitForImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  createGenerationPlan,
  createProfileRegistry,
} from "../src/generator/plan.js";
import type { Profile } from "../src/generator/types.js";
import type { ProjectOptions } from "../src/options.js";

const options: ProjectOptions = {
  description: "Example description",
  githubOwner: "example",
  githubRepo: "example-project",
  packageName: "@example/project",
  projectName: "example-project",
};

const registry = new Map<string, Profile>([
  [
    "base",
    {
      files: [
        {
          content: "# {{foundation:projectName}}\n",
          path: "README.md",
        },
      ],
      name: "base",
      packageJson: {
        fields: {
          description: "{{foundation:description}}",
          name: "{{foundation:packageName}}",
          private: true,
          version: "0.0.0",
        },
        scripts: {
          test: "vitest run",
        },
      },
    },
  ],
  [
    "react",
    {
      name: "react",
      packageJson: {
        dependencies: {
          react: "19.2.7",
        },
      },
      requires: ["base"],
    },
  ],
]);

describe("createGenerationPlan", () => {
  it("rejects duplicate profile names before building the registry", () => {
    expect(() =>
      createProfileRegistry([{ name: "duplicate" }, { name: "duplicate" }])
    ).toThrow(/Duplicate profile name/u);
  });

  it("resolves requirements and produces sorted deterministic output", () => {
    const first = createGenerationPlan(["react"], registry, options);
    const second = createGenerationPlan(["react"], registry, options);

    expect(first).toEqual(second);
    expect(first.profiles).toEqual(["base", "react"]);
    expect(first.files.map((file) => file.path)).toEqual([
      "README.md",
      "package.json",
    ]);
    expect(
      first.files.find((file) => file.path === "package.json")?.content
    ).toContain('"react": "19.2.7"');
    expect(first.files.find((file) => file.path === "package.json")?.content)
      .toBe(`{
  "name": "@example/project",
  "version": "0.0.0",
  "private": true,
  "description": "Example description",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "react": "19.2.7"
  }
}
`);
  });

  it("rejects duplicate output paths", () => {
    const collisionRegistry = new Map<string, Profile>([
      ...registry,
      [
        "collision",
        {
          files: [{ content: "duplicate", path: "README.md" }],
          name: "collision",
          requires: ["base"],
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["collision"], collisionRegistry, options)
    ).toThrow(/Output collision/u);
  });

  it("plans explicit symlinks to generated files", () => {
    const symlinkRegistry = new Map<string, Profile>([
      [
        "base",
        {
          files: [{ content: "# Instructions\n", path: "AGENTS.md" }],
          name: "base",
          symlinks: [{ path: "CLAUDE.md", targetPath: "AGENTS.md" }],
        },
      ],
    ]);

    const plan = createGenerationPlan(["base"], symlinkRegistry, options);

    expect(plan.symlinks).toEqual([
      {
        origin: "base",
        path: "CLAUDE.md",
        targetPath: "AGENTS.md",
      },
    ]);
  });

  it("rejects symlinks without a planned file target", () => {
    const symlinkRegistry = new Map<string, Profile>([
      [
        "base",
        {
          name: "base",
          symlinks: [{ path: "CLAUDE.md", targetPath: "AGENTS.md" }],
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], symlinkRegistry, options)
    ).toThrow(/must target a planned file/u);
  });

  it("rejects collisions between files and symlinks", () => {
    const symlinkRegistry = new Map<string, Profile>([
      [
        "base",
        {
          files: [{ content: "# Instructions\n", path: "AGENTS.md" }],
          name: "base",
          symlinks: [{ path: "AGENTS.md", targetPath: "AGENTS.md" }],
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], symlinkRegistry, options)
    ).toThrow(/Output collision/u);
  });

  it("rejects conflicting structured package values", () => {
    const conflictRegistry = new Map<string, Profile>([
      ...registry,
      [
        "conflict",
        {
          name: "conflict",
          packageJson: {
            scripts: { test: "different test command" },
          },
          requires: ["base"],
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["conflict"], conflictRegistry, options)
    ).toThrow(/Conflicting script/u);
  });

  it("treats reordered package conditions as a conflict", () => {
    const orderSensitiveRegistry = new Map<string, Profile>([
      [
        "first",
        {
          name: "first",
          packageJson: {
            fields: {
              exports: {
                // oxlint-disable-next-line eslint/sort-keys -- This test requires order-sensitive conditions.
                ".": {
                  types: "./dist/index.d.ts",
                  import: "./dist/index.js",
                },
              },
            },
          },
        },
      ],
      [
        "second",
        {
          name: "second",
          packageJson: {
            fields: {
              exports: {
                ".": {
                  import: "./dist/index.js",
                  types: "./dist/index.d.ts",
                },
              },
            },
          },
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["first", "second"], orderSensitiveRegistry, options)
    ).toThrow(/conflicting package.json field/iu);
  });

  it("rejects reducer-owned package fields", () => {
    const reservedFieldRegistry = new Map<string, Profile>([
      [
        "base",
        {
          name: "base",
          packageJson: {
            fields: {
              scripts: { test: "vitest run" },
            },
          },
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], reservedFieldRegistry, options)
    ).toThrow(/typed reducer/u);
  });

  it("rejects placeholders in package object keys", () => {
    const placeholderRegistry = new Map<string, Profile>([
      [
        "base",
        {
          name: "base",
          packageJson: {
            fields: {
              bin: {
                "{{foundation:projectName}}": "dist/cli.js",
              },
            },
          },
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], placeholderRegistry, options)
    ).toThrow(/must not contain a placeholder/u);
  });

  it("rejects placeholders in reducer keys", () => {
    const placeholderRegistry = new Map<string, Profile>([
      [
        "base",
        {
          name: "base",
          packageJson: {
            scripts: {
              "{{foundation:projectName}}": "vitest run",
            },
          },
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], placeholderRegistry, options)
    ).toThrow(/must not contain a placeholder/u);
  });

  it("rejects profile conflicts", () => {
    const conflictRegistry = new Map<string, Profile>([
      ...registry,
      [
        "incompatible",
        {
          conflicts: ["react"],
          name: "incompatible",
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["react", "incompatible"], conflictRegistry, options)
    ).toThrow(/conflicts/u);
  });

  it("rejects registry aliases", () => {
    const aliasRegistry = new Map<string, Profile>([
      ["alias", { name: "actual" }],
    ]);

    expect(() =>
      createGenerationPlan(["alias"], aliasRegistry, options)
    ).toThrow(/does not match profile name/u);
  });

  it("rejects dependency cycles", () => {
    const cycleRegistry = new Map<string, Profile>([
      ["left", { name: "left", requires: ["right"] }],
      ["right", { name: "right", requires: ["left"] }],
    ]);

    expect(() =>
      createGenerationPlan(["left"], cycleRegistry, options)
    ).toThrow(/cycle/u);
  });

  it("rejects asynchronous profile option validation without leaking its rejection", async () => {
    const validationError = new Error("Asynchronous validation failed.");
    let leakedRejection = false;
    const observeRejection = (reason: unknown): void => {
      if (reason === validationError) {
        leakedRejection = true;
      }
    };
    const asynchronousRegistry = new Map<string, Profile>([
      [
        "async",
        {
          name: "async",
          validateOptions: (async () => {
            await Promise.resolve();
            throw validationError;
          }) as unknown as NonNullable<Profile["validateOptions"]>,
        },
      ],
    ]);

    process.on("unhandledRejection", observeRejection);

    try {
      expect(() =>
        createGenerationPlan(["async"], asynchronousRegistry, options)
      ).toThrow(/must be synchronous/u);
      await waitForImmediate();
      expect(leakedRejection).toBe(false);
    } finally {
      process.off("unhandledRejection", observeRejection);
    }
  });

  it("rejects case-insensitive output collisions", () => {
    const collisionRegistry = new Map<string, Profile>([
      [
        "base",
        {
          files: [
            { content: "upper", path: "README.md" },
            { content: "lower", path: "readme.md" },
          ],
          name: "base",
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], collisionRegistry, options)
    ).toThrow(/case-insensitive filesystems/u);
  });

  it("rejects a file that blocks a descendant path", () => {
    const blockingRegistry = new Map<string, Profile>([
      [
        "base",
        {
          files: [
            { content: "file", path: "src" },
            { content: "child", path: "src/index.ts" },
          ],
          name: "base",
        },
      ],
    ]);

    expect(() =>
      createGenerationPlan(["base"], blockingRegistry, options)
    ).toThrow(/blocks descendant path/u);
  });

  it("sorts output with a locale-independent code-unit order", () => {
    const sortingRegistry = new Map<string, Profile>([
      [
        "base",
        {
          files: [
            { content: "lower", path: "a.md" },
            { content: "upper", path: "Z.md" },
          ],
          name: "base",
        },
      ],
    ]);

    const plan = createGenerationPlan(["base"], sortingRegistry, options);

    expect(plan.files.map((file) => file.path)).toEqual(["Z.md", "a.md"]);
  });
});
