import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
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
  const root = await mkdtemp(path.join(temporaryDirectory, "create-astilba-"));
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
      ownership: "seeded",
      path: "README.md",
    },
    {
      content: "export const value = 1;\n",
      mode: 0o644,
      origin: "test",
      ownership: "seeded",
      path: "src/index.ts",
    },
  ],
  profiles: ["test"],
  symlinks: [
    {
      origin: "test",
      path: "GUIDE.md",
      targetPath: "README.md",
    },
  ],
};

describe("applyGenerationPlan", () => {
  it("publishes the complete planned tree", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "project");

    await applyGenerationPlan(plan, destination);

    await expect(
      readFile(path.join(destination, "README.md"), "utf-8")
    ).resolves.toBe("# Example\n");
    await expect(
      readFile(path.join(destination, "src/index.ts"), "utf-8")
    ).resolves.toBe("export const value = 1;\n");
    await expect(readlink(path.join(destination, "GUIDE.md"))).resolves.toBe(
      "README.md"
    );
    await expect(
      lstat(path.join(destination, ".astilba-create-incomplete"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates missing destination parents", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "nested", "projects", "project");

    await applyGenerationPlan(plan, destination);

    await expect(
      readFile(path.join(destination, "README.md"), "utf-8")
    ).resolves.toBe("# Example\n");
  });

  it("removes newly created empty parents after a failed generation", async () => {
    const root = await createTemporaryRoot();
    const parent = path.join(root, "nested", "projects");
    const destination = path.join(parent, "project");
    const invalidPlan: GenerationPlan = {
      files: [
        ...plan.files,
        {
          content: "collision",
          mode: 0o644,
          origin: "test",
          ownership: "managed",
          path: "src",
        },
      ],
      profiles: ["test"],
    };

    await expect(
      applyGenerationPlan(invalidPlan, destination)
    ).rejects.toThrow();
    await expect(lstat(path.join(root, "nested"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("publishes an initialized Git repository as part of the tree", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "project");

    await applyGenerationPlan(plan, destination, { initializeGit: true });

    await expect(
      readFile(path.join(destination, ".git", "HEAD"), "utf-8")
    ).resolves.toBe("ref: refs/heads/main\n");
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

  it("does not mutate a protected root reached through case folding", async () => {
    const root = await createTemporaryRoot();
    const protectedRoot = path.join(root, "Protected");
    const alternateCase = path.join(root, "protected");
    await mkdir(protectedRoot);

    try {
      await lstat(alternateCase);
    } catch {
      // This filesystem is case-sensitive, so it cannot exercise the alias.
      return;
    }

    await expect(
      applyGenerationPlan(
        plan,
        path.join(alternateCase, "new-parent", "project"),
        { forbiddenRoots: [protectedRoot] }
      )
    ).rejects.toThrow(/protected path/u);
    await expect(
      lstat(path.join(protectedRoot, "new-parent"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not create output when generation is already cancelled", async () => {
    const root = await createTemporaryRoot();
    const destination = path.join(root, "nested", "project");
    const controller = new AbortController();
    controller.abort(new Error("test cancellation"));

    await expect(
      applyGenerationPlan(plan, destination, { signal: controller.signal })
    ).rejects.toThrow(/interrupted/u);
    await expect(lstat(path.join(root, "nested"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    "project\u0085name",
    "project\u2028name",
    "project\u2029name",
    "project\u202Ename",
  ])(
    "refuses destination control or formatting characters in %s",
    async (name) => {
      const root = await createTemporaryRoot();

      await expect(
        applyGenerationPlan(plan, path.join(root, name))
      ).rejects.toThrow(/control or formatting characters/u);
      await expect(lstat(path.join(root, name))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  );

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
          ownership: "managed",
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
    ".astilba-create-incomplete",
    ".astilba-create-incomplete/file.txt",
    ".Astilba-Create-Incomplete",
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
            ownership: "managed",
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
