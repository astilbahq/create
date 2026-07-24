import { describe, expect, it } from "vitest";

import {
  isWithinPath,
  normalizeOutputPath,
  resolveOutputPath,
} from "../src/generator/paths.js";

describe("normalizeOutputPath", () => {
  it("accepts a normalized relative path", () => {
    expect(normalizeOutputPath("src/index.ts")).toBe("src/index.ts");
  });

  it.each([
    "",
    ".",
    "../escape",
    "src/../escape",
    "/absolute",
    "C:\\absolute",
    "\\\\server\\share",
    "double//separator",
    "nul\u0000byte",
    "line\nbreak",
    "tab\tname",
    ".git/config",
    "nested/.GIT/config",
    ".typescript-foundation-incomplete",
    ".typescript-foundation-incomplete/file.txt",
    ".TypeScript-Foundation-Incomplete",
    "CON",
    "con.txt",
    "file?.ts",
    "file:stream",
    "trailing.",
    "trailing ",
    "unicode-λ.ts",
    "{{foundation:projectName}}.md",
  ])("rejects %j", (candidate) => {
    expect(() => normalizeOutputPath(candidate)).toThrow();
  });
});

describe("resolveOutputPath", () => {
  it("resolves beneath the destination", () => {
    expect(resolveOutputPath("/tmp/project", "src/index.ts")).toBe(
      "/tmp/project/src/index.ts"
    );
  });
});

describe("isWithinPath", () => {
  it("recognizes descendants without prefix confusion", () => {
    expect(isWithinPath("/tmp/project/src", "/tmp/project")).toBe(true);
    expect(isWithinPath("/tmp/project-other", "/tmp/project")).toBe(false);
  });
});
