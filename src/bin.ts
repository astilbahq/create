#!/usr/bin/env node

import {
  CLI_OUTPUT_SCHEMA_VERSION,
  CliCancelledError,
  isJsonOutputRequested,
  runCli,
} from "./cli.js";

try {
  await runCli();
} catch (error: unknown) {
  if (error instanceof CliCancelledError) {
    process.exitCode = 130;
  } else if (isJsonOutputRequested(process.argv.slice(2))) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({
        error: { message },
        ok: false,
        schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      })}\n`
    );
    process.exitCode = 1;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
