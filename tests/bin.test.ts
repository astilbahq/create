import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

describe("CLI process contract", () => {
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
});
