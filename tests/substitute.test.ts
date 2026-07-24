import { describe, expect, it } from "vitest";

import { substitutePlaceholders } from "../src/generator/substitute.js";
import type { ProjectOptions } from "../src/options.js";

const options: ProjectOptions = {
  description: "Example description",
  githubOwner: "example",
  githubRepo: "example-project",
  packageName: "@example/project",
  projectName: "example-project",
};

describe("substitutePlaceholders", () => {
  it("substitutes only known placeholders", () => {
    expect(
      substitutePlaceholders(
        "{{foundation:projectName}} belongs to {{foundation:githubOwner}}.",
        options
      )
    ).toBe("example-project belongs to example.");
  });

  it("rejects unknown placeholders", () => {
    expect(() =>
      substitutePlaceholders("{{foundation:ambientSecret}}", options)
    ).toThrow(/Unknown placeholder/u);
  });

  it("rejects malformed unresolved placeholders", () => {
    expect(() =>
      substitutePlaceholders("{{foundation:projectName", options)
    ).toThrow(/unresolved placeholder/u);
  });

  it("preserves GitHub Actions expressions", () => {
    const githubExpression = ["$", "{{ github.ref }}"].join("");
    expect(substitutePlaceholders(githubExpression, options)).toBe(
      githubExpression
    );
  });

  it("normalizes CRLF line endings", () => {
    expect(substitutePlaceholders("one\r\ntwo\r\n", options)).toBe(
      "one\ntwo\n"
    );
  });
});
