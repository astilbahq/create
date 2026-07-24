import { access, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import { runProcess } from "../src/install.js";

const temporaryRoots: string[] = [];

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
      await writeFile(
        path.join(root, "child.js"),
        `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "completed"), 1500);\n`,
        "utf-8"
      );
      await writeFile(
        path.join(root, "cancel-test.cmd"),
        "@echo off\r\nnode child.js\r\n",
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
      const childPath = path.join(root, "child.cjs");
      await writeFile(
        childPath,
        `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "completed"), 1500);\n`,
        "utf-8"
      );
      const parentPath = path.join(root, "parent.cjs");
      await writeFile(
        parentPath,
        `require("node:child_process").spawn(process.execPath, [${JSON.stringify(childPath)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`,
        "utf-8"
      );
      const controller = new AbortController();
      const running = runProcess(
        process.execPath,
        [parentPath],
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
