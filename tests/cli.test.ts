import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isJsonOutputRequested,
  parseCliArguments,
  resolveScaffoldRequest,
  scaffoldProject,
} from "../src/cli.js";
import { PROJECT_MANIFEST_PATH } from "../src/manifest.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

const completeArguments = [
  "my-project",
  "--recipe",
  "typescript-library",
  "--description",
  "An example project.",
  "--github-owner",
  "example",
] as const;

describe("Astilba Create CLI", () => {
  it("resolves destinations from the caller's working directory", async () => {
    const parsed = parseCliArguments(completeArguments);

    expect(parsed.command).toBe("create");

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/my-project"),
      options: {
        description: "An example project.",
        githubOwner: "example",
        githubRepo: "my-project",
        packageName: "my-project",
        projectName: "my-project",
      },
      recipe: "typescript-library",
    });
  });

  it("allows explicit project names and lifecycle choices", async () => {
    const parsed = parseCliArguments([
      "output",
      "--recipe=react-vite-spa",
      "--description=An example project.",
      "--github-owner=example",
      "--github-repo=web",
      "--package-name=@example/web",
      "--project-name=web",
      "--no-git",
      "--install",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      initializeGit: false,
      installDependencies: true,
      options: {
        githubRepo: "web",
        packageName: "@example/web",
        projectName: "web",
      },
    });
  });

  it("infers portable project metadata from a human-friendly directory", async () => {
    const parsed = parseCliArguments([
      "My App",
      "--recipe=cloudflare-worker-service",
      "--description=An example project.",
      "--github-owner=example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/My App"),
      options: {
        githubRepo: "my-app",
        packageName: "my-app",
        projectName: "my-app",
      },
    });
  });

  it("rejects a directory name that cannot produce project metadata", async () => {
    const parsed = parseCliArguments([
      "___",
      "--recipe=typescript-library",
      "--description=An example project.",
      "--github-owner=example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/letter or digit/iu);
  });

  it("rejects an unknown recipe", () => {
    expect(() =>
      parseCliArguments([
        "output",
        "--recipe",
        "mobile",
        "--description",
        "An example project.",
        "--github-owner",
        "example",
      ])
    ).toThrow(/unknown project recipe/iu);
  });

  it("rejects incomplete non-interactive input", async () => {
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/non-interactive creation requires/iu);
  });

  it.each([
    "/absolute",
    "../escape",
    "nested/../escape",
    "C:\\absolute",
    "\\\\server\\share",
    "C:../escape",
    "D:project",
    ".. /project",
    "nested/.. /escape",
    "CON",
    "name.",
    "name ",
    "name?.txt",
  ])("rejects unsafe destination argument %s", async (destination) => {
    const parsed = parseCliArguments([
      destination,
      "--recipe",
      "react-vite-spa",
      "--description",
      "An example project.",
      "--github-owner",
      "example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/normalized portable relative path without traversal/iu);
  });

  it("returns help and version commands without requiring project options", () => {
    expect(parseCliArguments(["--help"])).toEqual({
      command: "help",
      json: false,
    });
    expect(parseCliArguments(["--version", "--json"])).toEqual({
      command: "version",
      json: true,
    });
  });

  it("only enables JSON output for a parsed JSON option", () => {
    expect(isJsonOutputRequested(["--json", "--unknown"])).toBe(true);
    expect(isJsonOutputRequested(["--description", "--json"])).toBe(false);
  });

  it("creates a project with provenance and a fresh Git history", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-cli-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "project");

    await scaffoldProject({
      destination,
      dryRun: false,
      initializeGit: true,
      installDependencies: false,
      json: false,
      options: {
        description: "An example library.",
        githubOwner: "example",
        githubRepo: "project",
        packageName: "@example/project",
        projectName: "project",
      },
      recipe: "typescript-library",
    });

    const gitStats = await lstat(path.join(destination, ".git"));
    expect(gitStats.isDirectory()).toBe(true);
    await expect(
      lstat(path.join(destination, ".git", "HEAD"))
    ).resolves.toBeDefined();
    await expect(readlink(path.join(destination, "CLAUDE.md"))).resolves.toBe(
      "AGENTS.md"
    );

    const manifest = JSON.parse(
      await readFile(path.join(destination, PROJECT_MANIFEST_PATH), "utf-8")
    ) as { readonly recipe?: { readonly id?: string } };
    expect(manifest.recipe?.id).toBe("typescript-library");
  });

  it("plans without touching the destination", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-dry-run-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "project");

    const result = await scaffoldProject({
      destination,
      dryRun: true,
      initializeGit: true,
      installDependencies: true,
      json: false,
      options: {
        description: "An example application.",
        githubOwner: "example",
        githubRepo: "project",
        packageName: "@example/project",
        projectName: "project",
      },
      recipe: "react-vite-spa",
    });

    expect(result.installed).toBe(false);
    expect(result.plan.files.map((file) => file.path)).toContain(
      PROJECT_MANIFEST_PATH
    );
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
