import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyGenerationPlan } from "../src/generator/apply.js";
import { createGenerationPlan } from "../src/generator/plan.js";
import { profileRegistry, projectProfileNames } from "../src/profiles/index.js";

const options = {
  description: "A generated test project.",
  githubOwner: "example",
  githubRepo: "generated",
  packageName: "@example/generated",
  projectName: "generated",
} as const;

const temporaryRoots: string[] = [];

const createTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-profiles-")
  );
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe("project profiles", () => {
  it.each(projectProfileNames)(
    "creates a complete deterministic %s plan",
    (profile) => {
      const first = createGenerationPlan([profile], profileRegistry, options);
      const second = createGenerationPlan([profile], profileRegistry, options);
      const paths = first.files.map((file) => file.path);
      const contents = new Map(
        first.files.map((file) => [file.path, file.content])
      );

      expect(first).toEqual(second);
      expect(first.profiles).toEqual(["base", profile]);
      expect(paths).toContain("package.json");
      expect(paths).toContain("README.md");
      expect(paths).toContain("AGENTS.md");
      expect(paths).not.toContain("CLAUDE.md");
      expect(first.symlinks).toEqual([
        {
          origin: "base",
          path: "CLAUDE.md",
          targetPath: "AGENTS.md",
        },
      ]);
      expect(paths).toContain("SECURITY.md");
      expect(paths).toContain("renovate.json");
      expect(paths).toContain(".github/workflows/verification.yml");
      expect(paths).toContain(".github/workflows/codeql.yml");
      expect(paths).toContain("tsconfig.json");
      expect(paths).toContain("knip.json");
      expect(paths).toContain("vitest.config.ts");
      expect(
        first.files.every((file) => !file.content.includes("{{foundation:"))
      ).toBe(true);
      expect(contents.get(".github/ISSUE_TEMPLATE/config.yml")).toContain(
        "https://github.com/example/generated/security/advisories/new"
      );
      expect(contents.get("SECURITY.md")).toContain(
        "https://github.com/example/generated/security/advisories/new"
      );
      expect(contents.get("docs/repository-settings.md")).toContain(
        "Renovate for `example/generated`"
      );
      expect(contents.get("README.md")).toContain(
        "`CLAUDE.md` is a symbolic link"
      );
      expect(contents.get("pnpm-workspace.yaml")).toContain(
        '"brace-expansion@>=5.0.0 <5.0.8": 5.0.8'
      );
      expect(contents.get("pnpm-workspace.yaml")).toContain(
        "minimumReleaseAgeExclude:\n  - brace-expansion@5.0.8"
      );
      expect(contents.get("pnpm-workspace.yaml")).not.toMatch(
        /^\s*-\s+brace-expansion\s*$/mu
      );
      expect([...contents.values()].join("\n")).not.toContain(
        "astilbahq/create"
      );
    }
  );

  it.each(projectProfileNames)(
    "writes the %s profile to an empty destination",
    async (profile) => {
      const root = await createTemporaryRoot();
      const destination = path.join(root, profile);
      const plan = createGenerationPlan([profile], profileRegistry, options);

      await applyGenerationPlan(plan, destination);

      const packageJson = JSON.parse(
        await readFile(path.join(destination, "package.json"), "utf-8")
      ) as {
        name: string;
        scripts: Record<string, string>;
      };

      expect(packageJson.name).toBe("@example/generated");
      expect(packageJson.scripts.verify).toContain("pnpm check");
      expect(await readdir(destination)).toContain("src");
      const claudeStats = await lstat(path.join(destination, "CLAUDE.md"));
      expect(claudeStats.isSymbolicLink()).toBe(true);
      expect(await readlink(path.join(destination, "CLAUDE.md"))).toBe(
        "AGENTS.md"
      );
      await expect(
        readFile(path.join(destination, "CLAUDE.md"), "utf-8")
      ).resolves.toBe(
        await readFile(path.join(destination, "AGENTS.md"), "utf-8")
      );
    }
  );

  it("rejects incompatible project profiles", () => {
    expect(() =>
      createGenerationPlan(["astro", "react"], profileRegistry, options)
    ).toThrow(/conflicts/iu);
  });

  it("preserves the condition order of library exports", () => {
    const plan = createGenerationPlan(["library"], profileRegistry, options);
    const packageJson = plan.files.find(
      (file) => file.path === "package.json"
    )?.content;

    expect(packageJson?.indexOf('"types"')).toBeLessThan(
      packageJson?.indexOf('"import"') ?? -1
    );
  });

  it.each([
    ["library", ["esbuild"]],
    ["react", ["esbuild"]],
    ["astro", ["esbuild", "sharp"]],
    ["workers", ["esbuild", "sharp", "workerd"]],
  ] as const)(
    "allows only the lifecycle dependencies used by %s",
    (profile, dependencies) => {
      const workspace = createGenerationPlan(
        [profile],
        profileRegistry,
        options
      ).files.find((file) => file.path === "pnpm-workspace.yaml")?.content;
      const allowed = [
        ...(workspace?.matchAll(/^ {2}(?<dependency>[^:\n]+): true$/gmu) ?? []),
      ].flatMap((match) =>
        match.groups?.dependency ? [match.groups.dependency] : []
      );

      expect(allowed).toEqual(dependencies);
    }
  );

  it("does not expose the internal base as a project profile", () => {
    expect(projectProfileNames).not.toContain("base");
    expect(profileRegistry.has("base")).toBe(true);
  });

  it.each(["my_worker", "my.worker", "a".repeat(64)])(
    "rejects a Workers-incompatible project name: %s",
    (projectName) => {
      expect(() =>
        createGenerationPlan(["workers"], profileRegistry, {
          ...options,
          projectName,
        })
      ).toThrow(/Cloudflare Worker project name/u);
    }
  );

  it("keeps generic project names available to non-Workers profiles", () => {
    expect(() =>
      createGenerationPlan(["library"], profileRegistry, {
        ...options,
        projectName: "my_library",
      })
    ).not.toThrow();
  });

  it("emits parseable maintenance configuration and immutable workflow references", () => {
    const plan = createGenerationPlan(["library"], profileRegistry, options);
    const renovate = plan.files.find(
      (plannedFile) => plannedFile.path === "renovate.json"
    );
    const workflows = plan.files.filter((plannedFile) =>
      plannedFile.path.startsWith(".github/workflows/")
    );

    expect(() => JSON.parse(renovate?.content ?? "")).not.toThrow();
    expect(workflows.length).toBeGreaterThan(0);

    for (const workflow of workflows) {
      const references = workflow.content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("uses: "));

      expect(references.length).toBeGreaterThan(0);

      for (const reference of references) {
        if (reference.includes("docker://")) {
          expect(reference).toMatch(/@sha256:[a-f\d]{64}$/u);
        } else {
          expect(reference).toMatch(/@[a-f\d]{40} # v\d+\.\d+\.\d+$/u);
        }
      }

      expect(workflow.content).not.toContain("\\${{");
    }
  });
});
