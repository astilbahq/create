#!/usr/bin/env node

import { runCli } from "./cli.js";

try {
  await runCli();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
