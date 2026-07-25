import { execFile } from "node:child_process";
import path from "node:path";
import { PassThrough } from "node:stream";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  CliPromptCancelledError,
  createClackTerminal,
} from "../src/terminal.js";

const executeFile = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

class TtyPassThrough extends PassThrough {
  public readonly columns = 20;
  public readonly isTTY = true;
  public readonly rawModeChanges: boolean[] = [];

  public setRawMode(enabled: boolean): this {
    this.rawModeChanges.push(enabled);
    return this;
  }
}

describe("Clack terminal adapter", () => {
  it("uses the provided streams across real prompt types", async () => {
    const input = new TtyPassThrough();
    const output = new TtyPassThrough();
    let rendered = "";
    output.on("data", (chunk: Buffer) => {
      rendered += chunk.toString("utf-8");
    });
    const terminal = createClackTerminal({ input, output });

    const textAnswer = terminal.text("destination", {
      message: "Where should the project be created?",
    });
    await waitForImmediate();
    input.write("my-project\r");
    await expect(textAnswer).resolves.toBe("my-project");

    const defaultAnswer = terminal.text("project-name", {
      defaultValue: "my-project",
      message: "Project name",
      validate: (value) =>
        value === "my-project" ? undefined : "Use the default.",
    });
    await waitForImmediate();
    input.write("\r");
    await expect(defaultAnswer).resolves.toBe("my-project");

    const initialAnswer = terminal.text("package-name", {
      initialValue: "@example/my-project",
      message: "Package name",
    });
    await waitForImmediate();
    input.write("\r");
    await expect(initialAnswer).resolves.toBe("@example/my-project");

    const selectAnswer = terminal.select("recipe", {
      message: "Choose a recipe",
      options: [{ label: "TypeScript library", value: "typescript-library" }],
    });
    await waitForImmediate();
    input.write("\r");
    await expect(selectAnswer).resolves.toBe("typescript-library");

    const confirmAnswer = terminal.confirm("initialize-git", {
      initialValue: true,
      message: "Create the project?",
    });
    await waitForImmediate();
    input.write("\r");

    await expect(confirmAnswer).resolves.toBe(true);
    expect(input.rawModeChanges).toContain(true);
    expect(input.rawModeChanges.at(-1)).toBe(false);
    expect(rendered).toContain("Where should the project be created?");
    expect(rendered).toContain("Choose a recipe");
    expect(rendered).toContain("Create the ");
    expect(rendered).toContain("project?");
  });

  it("renders review notes through the provided output stream", () => {
    const input = new TtyPassThrough();
    const output = new TtyPassThrough();
    let rendered = "";
    output.on("data", (chunk: Buffer) => {
      rendered += chunk.toString("utf-8");
    });
    const terminal = createClackTerminal({ input, output });

    terminal.note("Destination  /work/project", "Review your project");

    expect(rendered).toContain("Review your project");
    expect(rendered).toContain("Destination");
    expect(rendered).toContain("/work/project");
  });

  it("renders and cleans up a real cancelled prompt", async () => {
    const input = new TtyPassThrough();
    const output = new TtyPassThrough();
    let rendered = "";
    output.on("data", (chunk: Buffer) => {
      rendered += chunk.toString("utf-8");
    });
    const terminal = createClackTerminal({ input, output });

    const answer = terminal.text("destination", {
      message: "Where should the project be created?",
    });
    await waitForImmediate();
    input.write("\u0003");

    await expect(answer).rejects.toBeInstanceOf(CliPromptCancelledError);
    expect(input.rawModeChanges.at(-1)).toBe(false);
    expect(rendered).toContain("Project creation cancelled.");
  });

  it("reports intentional cancellation once without an error label", async () => {
    const { stderr, stdout } = await executeFile(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/clack-cancellation-child.mjs"],
      {
        cwd: root,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      }
    );

    expect(stderr).toBe("");
    expect(stdout.match(/Project creation cancelled\./gu)).toHaveLength(1);
    expect(stdout).not.toContain("Error:");
  });

  it("honors NO_COLOR when Clack loads in a fresh process", async () => {
    const baseEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => name !== "FORCE_COLOR" && name !== "NO_COLOR"
      )
    );
    const childArguments = [
      "--import",
      "tsx",
      "tests/fixtures/clack-custom-stream-child.mjs",
    ];
    const { stdout: coloredOutput } = await executeFile(
      process.execPath,
      childArguments,
      {
        cwd: root,
        env: {
          ...baseEnvironment,
          FORCE_COLOR: "1",
        },
      }
    );
    const { stdout: uncoloredOutput } = await executeFile(
      process.execPath,
      childArguments,
      {
        cwd: root,
        env: {
          ...baseEnvironment,
          NO_COLOR: "1",
        },
      }
    );

    expect(coloredOutput).toContain("\u001B[");
    expect(uncoloredOutput).toContain("Astilba Create");
    expect(uncoloredOutput).not.toContain("\u001B[");
  });
});
