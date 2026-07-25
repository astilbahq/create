import path from "node:path";
import type { Writable } from "node:stream";

import type { CreateAstilbaError } from "./errors.js";
import { INCOMPLETE_MARKER_PATH } from "./generator/paths.js";

const recoveryGuidance = (failure: CreateAstilbaError): string | undefined => {
  if (failure.destination === undefined) {
    return undefined;
  }

  if (failure.destinationState === "incomplete") {
    const marker = path.join(failure.destination, INCOMPLETE_MARKER_PATH);
    return `Recovery: the destination may be incomplete. Inspect ${marker}, then remove or recover the destination before running Create again.`;
  }

  if (failure.destinationState === "complete") {
    if (failure.code === "CANCELLED") {
      if (failure.phase === "installation") {
        return `Recovery: the project was created at ${failure.destination}, but dependency installation did not finish. Run "pnpm install --frozen-lockfile" there when ready.`;
      }

      return `Recovery: the project was created at ${failure.destination}, but Create stopped before any optional dependency installation. Run "pnpm install --frozen-lockfile" there if dependencies are needed.`;
    }

    if (failure.phase === "installation") {
      return `Recovery: the project was created at ${failure.destination}, but dependency installation needs attention. Resolve the error, then run "pnpm install --frozen-lockfile" there.`;
    }

    if (failure.phase === "unknown") {
      return `Recovery: the project was created at ${failure.destination} despite this reporting error.`;
    }

    return `Recovery: the project was created at ${failure.destination}; inspect it before continuing.`;
  }

  if (failure.phase === "generation") {
    return `Recovery: Create did not commit generated files to ${failure.destination}.`;
  }

  return undefined;
};

export const writeHumanFailure = (
  failure: CreateAstilbaError,
  output: Writable
): void => {
  if (failure.code === "CANCELLED") {
    if (!failure.messageReported) {
      output.write(`${failure.message}\n`);
    }
  } else {
    output.write(`Error: ${failure.message}\n`);

    if (failure.diagnostics) {
      output.write(`\n${failure.diagnostics}\n`);
    }
  }

  const guidance = recoveryGuidance(failure);

  if (guidance !== undefined) {
    output.write(`\n${guidance}\n`);
  }
};
