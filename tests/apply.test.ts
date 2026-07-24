import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyGenerationPlan } from "../src/generator/apply.js";
import type { GenerationPlan } from "../src/generator/types.js";

const temporaryRoots: string[] = [];

const createTemporaryRoot = async (): Promise<string> => {
  const temporaryDirectory = await realpath(tmpdir());
  const root = await mkdtemp(
    path.join(temporaryDirectory, "typescript-foundation-")
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

const plan: GenerationPlan = {
  files: [
    {
      content: "# Example\n",
      mode: 0o644,
      origin: "test",
      path: "README.md",
    },
    {
      content: "export const value = 1;\n",
      mode: 0o644,
      origin: "test",
      path: "src/index.ts",
    },
  ],
  profiles: ["test"],
};

describe("applyGenerationPlan", () => {
  it("atomically creates the planned tree", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "project");

    await applyGenerationPlan(plan, destination);

    await expect(
      readFile(path.join(destination, "README.md"), "utf-8")
    ).resolves.toBe("# Example\n");
    await expect(
      readFile(path.join(destination, "src/index.ts"), "utf-8")
    ).resolves.toBe("export const value = 1;\n");
    await expect(
      lstat(path.join(destination, ".typescript-foundation-incomplete"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses an existing destination without changing it", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "project");
    await mkdir(destination);
    await writeFile(path.join(destination, "owned.txt"), "keep\n", "utf-8");

    await expect(applyGenerationPlan(plan, destination)).rejects.toThrow(
      /must not already exist/u
    );
    await expect(
      readFile(path.join(destination, "owned.txt"), "utf-8")
    ).resolves.toBe("keep\n");
  });

  it("refuses a destination beneath a protected root", async () => {
    const root = await createTemporaryRoot();

    await expect(
      applyGenerationPlan(plan, path.join(root, "project"), {
        forbiddenRoots: [root],
      })
    ).rejects.toThrow(/protected path/u);
  });

  it("refuses symlinked destination ancestors", async () => {
    const root = await createTemporaryRoot();
    const realParent = path.join(root, "real");
    const linkedParent = path.join(root, "linked");
    await mkdir(realParent);
    await symlink(realParent, linkedParent);

    await expect(
      applyGenerationPlan(plan, path.join(linkedParent, "project"))
    ).rejects.toThrow(/symlink/u);
  });

  it("refuses a symlink above the immediate destination parent", async () => {
    const root = await createTemporaryRoot();
    const realParent = path.join(root, "real");
    const nestedParent = path.join(realParent, "nested");
    const linkedParent = path.join(root, "linked");
    await mkdir(nestedParent, { recursive: true });
    await symlink(realParent, linkedParent);

    await expect(
      applyGenerationPlan(plan, path.join(linkedParent, "nested", "project"))
    ).rejects.toThrow(/symlink/u);
  });

  it("removes staging output after a failed write", async () => {
    const root = await createTemporaryRoot();
    const invalidPlan: GenerationPlan = {
      files: [
        ...plan.files,
        {
          content: "collision",
          mode: 0o644,
          origin: "test",
          path: "src",
        },
      ],
      profiles: ["test"],
    };

    await expect(
      applyGenerationPlan(invalidPlan, path.join(root, "project"))
    ).rejects.toThrow();

    const entries = await readdir(root);
    expect(entries).toEqual([]);
    await expect(lstat(path.join(root, "project"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    ".typescript-foundation-incomplete",
    ".typescript-foundation-incomplete/file.txt",
    ".TypeScript-Foundation-Incomplete",
  ])(
    "rejects internal publication path %s as generated output",
    async (outputPath) => {
      const root = await createTemporaryRoot();
      const destination = path.join(root, "project");
      const invalidPlan: GenerationPlan = {
        files: [
          {
            content: "must not disappear\n",
            mode: 0o644,
            origin: "test",
            path: outputPath,
          },
        ],
        profiles: ["test"],
      };

      await expect(
        applyGenerationPlan(invalidPlan, destination)
      ).rejects.toThrow(/unsafe output path/iu);
      await expect(lstat(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  );
});
