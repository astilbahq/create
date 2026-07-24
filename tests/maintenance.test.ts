import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dependencyVersions } from "../src/profiles/dependency-versions.js";
import { githubFiles } from "../src/profiles/github-files.js";
import { toolchainVersions } from "../src/profiles/toolchain-versions.js";

interface RegexManager {
  readonly datasourceTemplate?: string;
  readonly depNameTemplate?: string;
  readonly managerFilePatterns: readonly string[];
  readonly matchStrings: readonly string[];
  readonly registryUrlTemplate?: string;
}

interface RenovateConfig {
  readonly customManagers: readonly RegexManager[];
  readonly platformAutomerge: boolean;
}

interface RootPackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly engines: {
    readonly node: string;
    readonly pnpm: string;
  };
  readonly packageManager: string;
}

const root = path.resolve(import.meta.dirname, "..");

const readRenovateConfig = async (): Promise<RenovateConfig> =>
  JSON.parse(
    await readFile(path.join(root, "renovate.json"), "utf-8")
  ) as RenovateConfig;

const readGeneratedRenovateConfig = (): RenovateConfig => {
  const declaration = githubFiles.find(
    (candidate) => candidate.path === "renovate.json"
  );

  if (!declaration) {
    throw new Error("The generated Renovate configuration is missing.");
  }

  return JSON.parse(declaration.content) as RenovateConfig;
};

const extractDependencies = (
  managers: readonly RegexManager[],
  file: string,
  source: string
): string[] =>
  managers
    .filter((manager) =>
      manager.managerFilePatterns.some((pattern) =>
        new RegExp(pattern.slice(1, -1), "u").test(file)
      )
    )
    .flatMap((manager) =>
      manager.matchStrings.flatMap((pattern) => {
        const matches = source.matchAll(new RegExp(pattern, "gu"));

        return [...matches].flatMap((match) => {
          const dependencyName =
            match.groups?.depName ?? manager.depNameTemplate;

          return dependencyName ? [dependencyName] : [];
        });
      })
    );

describe("maintenance configuration", () => {
  it("tracks every dependency pin embedded in generated profiles", async () => {
    const config = await readRenovateConfig();
    const file = "src/profiles/dependency-versions.ts";
    const source = await readFile(path.join(root, file), "utf-8");
    const extracted = extractDependencies(config.customManagers, file, source);

    expect(extracted.toSorted()).toEqual(
      Object.keys(dependencyVersions).toSorted()
    );
  });

  it("tracks every GitHub Action embedded in generated workflows", async () => {
    const config = await readRenovateConfig();
    const file = "src/profiles/github-files.ts";
    const source = await readFile(path.join(root, file), "utf-8");
    const actionManagers = config.customManagers.filter((manager) =>
      manager.matchStrings.some((pattern) => pattern.includes("{40}"))
    );
    const extracted = extractDependencies(actionManagers, file, source);
    const pinnedActions = [
      ...source.matchAll(
        /[a-z\d_.-]+\/[a-z\d_.-]+(?:\/[a-z\d_.-]+)?@[a-f\d]{40} # v\d+\.\d+\.\d+/giu
      ),
    ];

    expect(extracted).toHaveLength(pinnedActions.length);
    expect(new Set(extracted)).toEqual(
      new Set([
        "actions/checkout",
        "actions/dependency-review-action",
        "actions/setup-node",
        "amannn/action-semantic-pull-request",
        "github/codeql-action",
        "pnpm/action-setup",
        "zizmorcore/zizmor-action",
      ])
    );
  });

  it("tracks generated Node.js and pnpm pins", async () => {
    const config = await readRenovateConfig();
    const file = "src/profiles/toolchain-versions.ts";
    const source = await readFile(path.join(root, file), "utf-8");
    const matchingManagers = config.customManagers.filter((manager) =>
      manager.managerFilePatterns.some((pattern) =>
        new RegExp(pattern.slice(1, -1), "u").test(file)
      )
    );

    expect(
      matchingManagers.map((manager) => manager.depNameTemplate).toSorted()
    ).toEqual(["node", "pnpm"]);
    expect(
      matchingManagers.every((manager) =>
        manager.matchStrings.some((pattern) =>
          new RegExp(pattern, "u").test(source)
        )
      )
    ).toBe(true);
  });

  it("keeps generated Zizmor updates visible to Renovate", () => {
    const config = readGeneratedRenovateConfig();
    const source = githubFiles.find(
      (candidate) => candidate.path === ".github/workflows/zizmor.yml"
    )?.content;

    expect(source).toBeDefined();
    expect(
      extractDependencies(
        config.customManagers,
        ".github/workflows/zizmor.yml",
        source ?? ""
      )
    ).toEqual(["zizmorcore/zizmor"]);
  });

  it("keeps exact current Node.js CI pins visible to Renovate", async () => {
    const rootConfig = await readRenovateConfig();
    const rootFile = ".github/workflows/verification.yml";
    const rootSource = await readFile(path.join(root, rootFile), "utf-8");
    const generatedConfig = readGeneratedRenovateConfig();
    const generatedSource = githubFiles.find(
      (candidate) => candidate.path === rootFile
    )?.content;

    expect(
      extractDependencies(rootConfig.customManagers, rootFile, rootSource)
    ).toEqual(["node", "node"]);
    expect(
      extractDependencies(
        generatedConfig.customManagers,
        rootFile,
        generatedSource ?? ""
      )
    ).toEqual(["node"]);
  });

  it("keeps root Zizmor CLI pins visible to Renovate", async () => {
    const config = await readRenovateConfig();
    const workflows = ["generated-workflows.yml", "zizmor.yml"];

    await Promise.all(
      workflows.map(async (workflow) => {
        const file = `.github/workflows/${workflow}`;
        const source = await readFile(path.join(root, file), "utf-8");

        expect(
          extractDependencies(config.customManagers, file, source)
        ).toEqual(["zizmorcore/zizmor"]);
      })
    );
  });

  it("waits for required checks before Renovate automerges", async () => {
    const rootConfig = await readRenovateConfig();
    const generatedConfig = readGeneratedRenovateConfig();

    expect(rootConfig.platformAutomerge).toBe(false);
    expect(generatedConfig.platformAutomerge).toBe(false);
  });

  it("tracks embedded container and Zizmor CLI pins", async () => {
    const config = await readRenovateConfig();
    const file = "src/profiles/github-files.ts";
    const source = await readFile(path.join(root, file), "utf-8");
    const matchingManagers = config.customManagers.filter((manager) =>
      manager.managerFilePatterns.some((pattern) =>
        new RegExp(pattern.slice(1, -1), "u").test(file)
      )
    );
    const dockerManagers = matchingManagers.filter(
      (manager) => manager.datasourceTemplate === "docker"
    );
    const managedContainers = dockerManagers.flatMap((manager) =>
      manager.matchStrings.flatMap((pattern) =>
        [...source.matchAll(new RegExp(pattern, "gu"))].flatMap((match) => {
          const dependency = match.groups?.depName;
          const registryUrl = manager.registryUrlTemplate;

          if (!(dependency && registryUrl)) {
            return [];
          }

          const registryHost = new URL(registryUrl).host;
          const registry =
            registryHost === "index.docker.io" ? "docker.io" : registryHost;

          return [
            {
              digest: match.groups?.currentDigest,
              identity: `${registry}/${dependency}`,
            },
          ];
        })
      )
    );
    const pinnedContainers = [
      ...source.matchAll(
        /docker:\/\/(?<registry>[a-z\d.-]+(?::\d+)?)\/(?<dependency>[a-z\d._/-]+)(?::[^@\s]+)?@(?<digest>sha256:[a-f\d]{64})/giu
      ),
    ].flatMap((match) => {
      const dependency = match.groups?.dependency;
      const registry = match.groups?.registry;

      return dependency && registry
        ? [
            {
              digest: match.groups?.digest,
              identity: `${registry}/${dependency}`,
            },
          ]
        : [];
    });
    const matchedNames = matchingManagers.flatMap((manager) =>
      manager.matchStrings.flatMap((pattern) =>
        [...source.matchAll(new RegExp(pattern, "gu"))].flatMap((match) =>
          match.groups?.depName || manager.depNameTemplate
            ? [match.groups?.depName ?? manager.depNameTemplate]
            : []
        )
      )
    );

    expect(
      source.match(
        /docker:\/\/docker\.io\/rhysd\/actionlint:[^@\s]+@sha256:[a-f\d]{64}/u
      )
    ).not.toBeNull();
    expect(
      source.match(
        /docker:\/\/ghcr\.io\/google\/osv-scanner:[^@\s]+@sha256:[a-f\d]{64}/u
      )
    ).not.toBeNull();
    expect(matchedNames).toEqual(
      expect.arrayContaining([
        "google/osv-scanner",
        "rhysd/actionlint",
        "zizmorcore/zizmor",
      ])
    );
    expect(
      managedContainers.toSorted((left, right) =>
        left.identity.localeCompare(right.identity)
      )
    ).toEqual(
      pinnedContainers.toSorted((left, right) =>
        left.identity.localeCompare(right.identity)
      )
    );
    expect(
      managedContainers.every((container) =>
        container.digest?.startsWith("sha256:")
      )
    ).toBe(true);
    expect(
      dockerManagers.every((manager) =>
        manager.matchStrings.some((pattern) =>
          pattern.includes("(?<currentDigest>sha256:")
        )
      )
    ).toBe(true);
  });

  it("keeps shared root and generated workflows byte-identical", async () => {
    const sharedWorkflows = [
      "actionlint.yml",
      "codeql.yml",
      "dependency-review.yml",
      "osv-scanner.yml",
      "pr-title.yml",
      "zizmor.yml",
    ];

    await Promise.all(
      sharedWorkflows.map(async (name) => {
        const relativePath = `.github/workflows/${name}`;
        const declaration = githubFiles.find(
          (candidate) => candidate.path === relativePath
        );
        const rootContent = await readFile(
          path.join(root, relativePath),
          "utf-8"
        );

        expect(declaration?.content).toBe(rootContent);
      })
    );
  });

  it("keeps overlapping root and generated toolchain pins aligned", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf-8")
    ) as RootPackageJson;
    const rootDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const overlappingDependencies = Object.entries(dependencyVersions).filter(
      ([name]) => name in rootDependencies
    );

    expect(overlappingDependencies.length).toBeGreaterThan(0);

    for (const [name, version] of overlappingDependencies) {
      expect(rootDependencies[name]).toBe(version);
    }

    await expect(
      readFile(path.join(root, ".node-version"), "utf-8")
    ).resolves.toBe(`${toolchainVersions.node}\n`);
    expect(toolchainVersions.nodeEngine).toBe(
      `>=${toolchainVersions.nodeMinimum}`
    );
    expect(packageJson.engines.node).toBe(toolchainVersions.nodeEngine);
    expect(packageJson.engines.pnpm).toBe(`>=${toolchainVersions.pnpm}`);
    expect(packageJson.packageManager).toBe(`pnpm@${toolchainVersions.pnpm}`);
  });

  it("tests generated consumers at the Node.js floor and pinned version", async () => {
    const rootWorkflow = await readFile(
      path.join(root, ".github/workflows/verification.yml"),
      "utf-8"
    );
    const generatedWorkflow = githubFiles.find(
      (candidate) => candidate.path === ".github/workflows/verification.yml"
    )?.content;
    const matrix = `node: ["${toolchainVersions.nodeMinimum}", "${toolchainVersions.node}"]`;

    expect(rootWorkflow.split(matrix)).toHaveLength(3);
    expect(rootWorkflow).toContain(
      `name: Consumer (\${{ matrix.profile }}, Node \${{ matrix.node }})`
    );
    expect(generatedWorkflow).toContain(matrix);
  });

  it("lints and audits emitted workflows in CI", async () => {
    const auditWorkflow = await readFile(
      path.join(root, ".github/workflows/generated-workflows.yml"),
      "utf-8"
    );

    expect(auditWorkflow).toContain("pnpm generate:workflow-audit-fixture");
    const emittedWorkflows = githubFiles
      .filter((candidate) => candidate.path.startsWith(".github/workflows/"))
      .map((candidate) => candidate.path)
      .toSorted();
    const lintedWorkflows = [
      ...auditWorkflow.matchAll(
        /\.generated-audit\/(?<path>\.github\/workflows\/[a-z\d-]+\.yml)/gu
      ),
    ]
      .flatMap((match) => (match.groups?.path ? [match.groups.path] : []))
      .toSorted();

    expect(lintedWorkflows).toEqual(emittedWorkflows);
    expect(auditWorkflow).toContain("inputs: .generated-audit");
    expect(auditWorkflow).toContain("online-audits: false");
    expect(auditWorkflow).toContain("token: offline");
    expect(auditWorkflow).not.toContain(`\${{ github.token }}`);
  });
});
