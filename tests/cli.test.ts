import { lstat, mkdtemp, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseScaffoldArguments, scaffoldProject } from "../src/cli.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe("parseScaffoldArguments", () => {
  it("defaults destinations beside the foundation checkout", () => {
    const request = parseScaffoldArguments([
      "my-project",
      "--profile",
      "library",
      "--description",
      "An example project.",
      "--github-owner",
      "example",
    ]);

    expect(request).not.toBe("help");
    expect(request).toMatchObject({
      destination: path.resolve(import.meta.dirname, "../..", "my-project"),
    });
  });

  it("infers names from the destination", () => {
    expect(
      parseScaffoldArguments(
        [
          "my-project",
          "--profile",
          "library",
          "--description",
          "An example project.",
          "--github-owner",
          "example",
        ],
        "/work"
      )
    ).toEqual({
      destination: path.resolve("/work/my-project"),
      options: {
        description: "An example project.",
        githubOwner: "example",
        githubRepo: "my-project",
        packageName: "my-project",
        projectName: "my-project",
      },
      profile: "library",
    });
  });

  it("allows explicit names", () => {
    const request = parseScaffoldArguments(
      [
        "output",
        "--profile=react",
        "--description=An example project.",
        "--github-owner=example",
        "--github-repo=web",
        "--package-name=@example/web",
        "--project-name=web",
      ],
      "/work"
    );

    expect(request).not.toBe("help");
    expect(request).toMatchObject({
      options: {
        githubRepo: "web",
        packageName: "@example/web",
        projectName: "web",
      },
    });
  });

  it("rejects an unknown profile", () => {
    expect(() =>
      parseScaffoldArguments([
        "output",
        "--profile",
        "mobile",
        "--description",
        "An example project.",
        "--github-owner",
        "example",
      ])
    ).toThrow(/unknown project profile/iu);
  });

  it("rejects an invalid inferred project name", () => {
    expect(() =>
      parseScaffoldArguments([
        "My Project",
        "--profile",
        "react",
        "--description",
        "An example project.",
        "--github-owner",
        "example",
      ])
    ).toThrow(/project name/iu);
  });

  it.each([
    "project\nname",
    "project\u0085name",
    "project\u2028name",
    "project\u2029name",
    "project\u202Ename",
  ])(
    "rejects control or formatting characters in destination %s",
    (destination) => {
      expect(() =>
        parseScaffoldArguments([
          destination,
          "--profile",
          "react",
          "--description",
          "An example project.",
          "--github-owner",
          "example",
          "--github-repo",
          "project",
          "--package-name",
          "project",
          "--project-name",
          "project",
        ])
      ).toThrow(/control or formatting characters/iu);
    }
  );

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
  ])("rejects unsafe destination argument %s", (destination) => {
    expect(() =>
      parseScaffoldArguments([
        destination,
        "--profile",
        "react",
        "--description",
        "An example project.",
        "--github-owner",
        "example",
        "--github-repo",
        "project",
        "--package-name",
        "project",
        "--project-name",
        "project",
      ])
    ).toThrow(/normalized portable relative path without traversal/iu);
  });

  it("returns help without requiring other options", () => {
    expect(parseScaffoldArguments(["--help"])).toBe("help");
  });

  it("creates a project with a fresh Git history", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "typescript-foundation-cli-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "project");

    await scaffoldProject({
      destination,
      options: {
        description: "An example library.",
        githubOwner: "example",
        githubRepo: "project",
        packageName: "@example/project",
        projectName: "project",
      },
      profile: "library",
    });

    const gitStats = await lstat(path.join(destination, ".git"));
    expect(gitStats.isDirectory()).toBe(true);
    await expect(
      lstat(path.join(destination, ".git", "HEAD"))
    ).resolves.toBeDefined();
    await expect(readlink(path.join(destination, "CLAUDE.md"))).resolves.toBe(
      "AGENTS.md"
    );
  });
});
