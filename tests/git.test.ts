import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeGitRepository } from "../src/generator/git.js";

const temporaryRoots: string[] = [];

const createTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(
    path.join(await realpath(tmpdir()), "create-astilba-git-")
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

describe("initializeGitRepository", () => {
  it("ignores ambient Git redirects and templates", async () => {
    const root = await createTemporaryRoot();
    const repository = path.join(root, "repository");
    const redirectedGitDirectory = path.join(root, "redirected.git");
    const ambientTemplate = path.join(root, "ambient-template");
    await mkdir(path.join(ambientTemplate, "hooks"), { recursive: true });
    await mkdir(repository);
    await writeFile(
      path.join(ambientTemplate, "hooks", "pre-commit"),
      "#!/bin/sh\nexit 1\n",
      "utf-8"
    );

    await initializeGitRepository(repository, {
      ...process.env,
      GIT_DIR: redirectedGitDirectory,
      GIT_TEMPLATE_DIR: ambientTemplate,
    });

    await expect(
      readFile(path.join(repository, ".git", "HEAD"), "utf-8")
    ).resolves.toBe("ref: refs/heads/main\n");
    await expect(
      lstat(path.join(repository, ".git", "hooks", "pre-commit"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(redirectedGitDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails without leaving a partial repository", async () => {
    const root = await createTemporaryRoot();
    const repository = path.join(root, "repository");
    await mkdir(repository);

    await expect(
      initializeGitRepository(repository, {
        PATH: path.join(root, "missing-bin"),
      })
    ).rejects.toThrow();
    await expect(lstat(path.join(repository, ".git"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to replace existing Git metadata", async () => {
    const root = await createTemporaryRoot();
    const repository = path.join(root, "repository");
    const sentinel = path.join(repository, ".git", "sentinel");
    await mkdir(path.dirname(sentinel), { recursive: true });
    await writeFile(sentinel, "preserve me\n", "utf-8");

    await expect(initializeGitRepository(repository)).rejects.toThrow(
      "The destination already contains Git metadata."
    );
    await expect(readFile(sentinel, "utf-8")).resolves.toBe("preserve me\n");
  });

  it("honours cancellation before starting Git", async () => {
    const root = await createTemporaryRoot();
    const repository = path.join(root, "repository");
    const controller = new AbortController();
    await mkdir(repository);
    controller.abort(new Error("test cancellation"));

    await expect(
      initializeGitRepository(repository, process.env, controller.signal)
    ).rejects.toThrow();
    await expect(lstat(path.join(repository, ".git"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("honours cancellation during asynchronous setup", async () => {
    const root = await createTemporaryRoot();
    const repository = path.join(root, "repository");
    const controller = new AbortController();
    const cancellation = new Error("test cancellation");
    await mkdir(repository);

    const initializing = initializeGitRepository(
      repository,
      process.env,
      controller.signal
    );
    controller.abort(cancellation);

    await expect(initializing).rejects.toBe(cancellation);
    await expect(readdir(repository)).resolves.toEqual([]);
    await expect(readdir(root)).resolves.toEqual(["repository"]);
  });
});
