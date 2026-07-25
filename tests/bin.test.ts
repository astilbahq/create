import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createCatalogResult } from "../src/cli.js";

const executeFile = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

describe("CLI process contract", () => {
  it("emits the catalog as one machine-readable object", async () => {
    const { stderr, stdout } = await executeFile(
      process.execPath,
      ["--import", "tsx", "src/bin.ts", "--catalog", "--json"],
      {
        cwd: root,
        maxBuffer: 1024 * 1024,
      }
    );

    expect(stderr).toBe("");
    expect(stdout).toBe(`${JSON.stringify(createCatalogResult())}\n`);
  });

  it("emits stable machine-readable error details", async () => {
    let stdout = "";

    try {
      await executeFile(
        process.execPath,
        ["--import", "tsx", "src/bin.ts", "--json"],
        {
          cwd: root,
          maxBuffer: 1024 * 1024,
        }
      );
    } catch (error: unknown) {
      if (error instanceof Error && "stdout" in error) {
        stdout = String(error.stdout);
      } else {
        throw error;
      }
    }

    expect(JSON.parse(stdout)).toEqual({
      error: {
        code: "INVALID_INPUT",
        message:
          "Non-interactive creation requires a destination, --recipe, --description, and --github-owner.",
        phase: "input",
      },
      ok: false,
      projectCreated: false,
      schemaVersion: 1,
    });
  });

  it.each([
    {
      arguments_: ["--json", "--unknown"],
      message:
        "Unknown option '--unknown'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--unknown\"",
    },
    {
      arguments_: ["--unknown", "--json"],
      message:
        "Unknown option '--unknown'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--unknown\"",
    },
    {
      arguments_: ["--recipe", "mobile", "--json"],
      message:
        'Unknown project recipe "mobile". Choose one of: typescript-library, react-vite-spa, astro-static-site, cloudflare-worker-service.',
    },
    {
      arguments_: ["--json", "--recipe"],
      message: "Option '-r, --recipe <value>' argument missing",
    },
    {
      arguments_: ["--catalog", "--recipe", "typescript-library", "--json"],
      message: "--catalog can only be combined with --json.",
    },
    {
      arguments_: ["--json", "--catalog", "--description", "An example."],
      message: "--catalog can only be combined with --json.",
    },
    {
      arguments_: ["--catalog", "--help", "--json"],
      message: "--catalog can only be combined with --json.",
    },
    {
      arguments_: ["--json", "--version", "--catalog"],
      message: "--catalog can only be combined with --json.",
    },
  ])(
    "emits exactly one JSON object when parsing $arguments_ fails",
    async ({ arguments_, message }) => {
      let exitCode: number | undefined;
      let stderr = "";
      let stdout = "";

      try {
        await executeFile(
          process.execPath,
          ["--import", "tsx", "src/bin.ts", ...arguments_],
          {
            cwd: root,
            maxBuffer: 1024 * 1024,
          }
        );
      } catch (error: unknown) {
        if (error instanceof Error && "stderr" in error && "stdout" in error) {
          exitCode =
            "code" in error && typeof error.code === "number"
              ? error.code
              : undefined;
          stderr = String(error.stderr);
          stdout = String(error.stdout);
        } else {
          throw error;
        }
      }

      expect(exitCode).toBe(1);
      expect(stderr).toBe("");
      expect(stdout.endsWith("\n")).toBe(true);
      expect(stdout.slice(0, -1)).not.toContain("\n");
      expect(JSON.parse(stdout)).toEqual({
        error: {
          code: "INVALID_INPUT",
          message,
          phase: "input",
        },
        ok: false,
        projectCreated: false,
        schemaVersion: 1,
      });
    }
  );
});
