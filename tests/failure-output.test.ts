import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { CreateAstilbaError } from "../src/errors.js";
import { writeHumanFailure } from "../src/failure-output.js";

const renderFailure = (failure: CreateAstilbaError): string => {
  let rendered = "";
  const output = new PassThrough();
  output.on("data", (chunk: Buffer) => {
    rendered += chunk.toString("utf-8");
  });

  writeHumanFailure(failure, output);
  return rendered;
};

describe("human failure output", () => {
  it("identifies an incomplete destination and its marker", () => {
    const rendered = renderFailure(
      new CreateAstilbaError("Publication failed.", {
        code: "GENERATION_FAILED",
        destination: "/work/project",
        destinationState: "incomplete",
        phase: "generation",
      })
    );

    expect(rendered).toContain("Error: Publication failed.");
    expect(rendered).toContain("/work/project/.astilba-create-incomplete");
    expect(rendered).toContain("remove or recover the destination");
  });

  it("explains how to finish an interrupted installation", () => {
    const rendered = renderFailure(
      new CreateAstilbaError("Project creation was interrupted.", {
        code: "CANCELLED",
        destination: "/work/project",
        destinationState: "complete",
        exitCode: 130,
        phase: "installation",
      })
    );

    expect(rendered).not.toContain("Error:");
    expect(rendered).toContain("the project was created");
    expect(rendered).toContain("pnpm install --frozen-lockfile");
  });

  it("states when cancellation lands after the project was created", () => {
    const rendered = renderFailure(
      new CreateAstilbaError("Project creation was interrupted.", {
        code: "CANCELLED",
        destination: "/work/project",
        destinationState: "complete",
        exitCode: 130,
        phase: "generation",
      })
    );

    expect(rendered).toContain("the project was created");
    expect(rendered).toContain(
      "Create stopped before any optional dependency installation"
    );
  });

  it("explains how to recover from an unexpected installer failure", () => {
    const rendered = renderFailure(
      new CreateAstilbaError("Installation failed.", {
        code: "INSTALLATION_FAILED",
        destination: "/work/project",
        destinationState: "complete",
        phase: "installation",
      })
    );

    expect(rendered).toContain("the project was created");
    expect(rendered).toContain("dependency installation needs attention");
    expect(rendered).toContain("pnpm install --frozen-lockfile");
  });

  it("states when generation left the destination uncommitted", () => {
    const rendered = renderFailure(
      new CreateAstilbaError("Generation failed.", {
        code: "GENERATION_FAILED",
        destination: "/work/project",
        destinationState: "unchanged",
        phase: "generation",
      })
    );

    expect(rendered).toContain(
      "Recovery: Create did not commit generated files to /work/project."
    );
  });
});
