import { describe, expect, it } from "vitest";

import { validateProjectOptions } from "../src/options.js";
import type { ProjectOptions } from "../src/options.js";

const validOptions: ProjectOptions = {
  description: "A useful TypeScript project.",
  githubOwner: "ReesMorris",
  githubRepo: "useful-project",
  packageName: "@example/useful-project",
  projectName: "useful-project",
};

describe("validateProjectOptions", () => {
  it("accepts a supported option set", () => {
    expect(validateProjectOptions(validOptions)).toEqual(validOptions);
  });

  it.each([
    ["projectName", "../escape"],
    ["packageName", "@scope/../escape"],
    ["description", "unsafe\u0000description"],
    ["githubOwner", "-invalid"],
    ["githubRepo", "invalid/repository"],
  ] as const)("rejects an unsafe %s", (field, value) => {
    expect(() =>
      validateProjectOptions({ ...validOptions, [field]: value })
    ).toThrow();
  });

  it("rejects silently trimmed values", () => {
    expect(() =>
      validateProjectOptions({
        ...validOptions,
        description: " padded description ",
      })
    ).toThrow(/whitespace/u);
  });
});
