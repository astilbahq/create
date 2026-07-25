import type { Writable } from "node:stream";

import type { CreateAstilbaError } from "./errors.js";

export const writeHumanFailure = (
  failure: CreateAstilbaError,
  output: Writable
): void => {
  if (failure.code === "CANCELLED") {
    if (!failure.messageReported) {
      output.write(`${failure.message}\n`);
    }
    return;
  }

  output.write(`Error: ${failure.message}\n`);

  if (failure.diagnostics) {
    output.write(`\n${failure.diagnostics}\n`);
  }
};
