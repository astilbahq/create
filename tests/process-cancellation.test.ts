import {
  access,
  copyFile,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import { runProcess } from "../src/install.js";

const temporaryRoots: string[] = [];
const fixtures = path.join(import.meta.dirname, "fixtures");

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe.runIf(process.platform === "win32")(
  "Windows process cancellation",
  () => {
    it("terminates descendants of a command shim", async () => {
      const root = await mkdtemp(
        path.join(await realpath(tmpdir()), "astilba-cancel-")
      );
      temporaryRoots.push(root);
      const marker = path.join(root, "descendant-completed");
      await copyFile(
        path.join(fixtures, "process-cancellation-child.mjs"),
        path.join(root, "child.mjs")
      );
      await writeFile(
        path.join(root, "cancel-test.cmd"),
        "@echo off\r\nnode child.mjs descendant-completed\r\n",
        "utf-8"
      );
      const controller = new AbortController();
      const running = runProcess(
        "cancel-test.cmd",
        [],
        root,
        controller.signal
      );

      await wait(200);
      controller.abort(new Error("test cancellation"));
      await expect(running).rejects.toMatchObject({ code: "ABORT_ERR" });
      await wait(1800);
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    });
  }
);

describe.runIf(process.platform !== "win32")(
  "POSIX process cancellation",
  () => {
    it("terminates the package-manager process group", async () => {
      const root = await mkdtemp(
        path.join(await realpath(tmpdir()), "astilba-cancel-")
      );
      temporaryRoots.push(root);
      const marker = path.join(root, "descendant-completed");
      const childPath = path.join(root, "child.mjs");
      await copyFile(
        path.join(fixtures, "process-cancellation-child.mjs"),
        childPath
      );
      const parentPath = path.join(root, "parent.mjs");
      await copyFile(
        path.join(fixtures, "process-cancellation-parent.mjs"),
        parentPath
      );
      const controller = new AbortController();
      const running = runProcess(
        process.execPath,
        [parentPath, childPath, marker],
        root,
        controller.signal
      );

      await wait(200);
      controller.abort(new Error("test cancellation"));
      await expect(running).rejects.toMatchObject({ code: "ABORT_ERR" });
      await wait(1800);
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    });
  }
);
