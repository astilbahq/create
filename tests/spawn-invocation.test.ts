import { describe, expect, it } from "vitest";

import { createSpawnInvocation } from "../src/spawn-invocation.js";

describe("package-manager process invocation", () => {
  it("executes package managers directly outside Windows", () => {
    expect(
      createSpawnInvocation("pnpm", ["--version"], { platform: "linux" })
    ).toEqual({
      arguments_: ["--version"],
      command: "pnpm",
    });
  });

  it("uses cmd.exe for Windows command shims", () => {
    expect(
      createSpawnInvocation("corepack", ["pnpm@11.10.0", "--version"], {
        comSpec: "C:\\Windows\\System32\\cmd.exe",
        platform: "win32",
      })
    ).toEqual({
      arguments_: ["/d", "/s", "/c", "corepack pnpm@11.10.0 --version"],
      command: "C:\\Windows\\System32\\cmd.exe",
    });
  });

  it("rejects shell metacharacters before invoking cmd.exe", () => {
    expect(() =>
      createSpawnInvocation("pnpm", ["install", "&", "whoami"], {
        platform: "win32",
      })
    ).toThrow(/unsafe package-manager token/iu);
  });
});
