#!/usr/bin/env node

import { configureColorEnvironment } from "./color.js";

configureColorEnvironment(process.env);

const [
  { CLI_OUTPUT_SCHEMA_VERSION, isJsonOutputRequested, runCli },
  { CreateAstilbaError, normalizeCreateAstilbaError },
] = await Promise.all([import("./cli.js"), import("./errors.js")]);

const abortController = new AbortController();
const interrupt = (): void => {
  abortController.abort(
    new CreateAstilbaError("Project creation was interrupted.", {
      code: "CANCELLED",
      exitCode: 130,
      phase: "unknown",
      projectCreated: false,
    })
  );
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  await runCli(process.argv.slice(2), { signal: abortController.signal });
} catch (error: unknown) {
  const failure = normalizeCreateAstilbaError(error, {
    phase: "unknown",
    projectCreated: false,
  });

  if (isJsonOutputRequested(process.argv.slice(2))) {
    process.stdout.write(
      `${JSON.stringify({
        ...(failure.destination === undefined
          ? {}
          : { destination: failure.destination }),
        error: {
          code: failure.code,
          message: failure.message,
          phase: failure.phase,
        },
        ok: false,
        projectCreated: failure.projectCreated,
        schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      })}\n`
    );
  } else {
    process.stderr.write(`Error: ${failure.message}\n`);

    if (failure.diagnostics) {
      process.stderr.write(`\n${failure.diagnostics}\n`);
    }
  }
  process.exitCode = failure.exitCode;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
