export type CreateAstilbaErrorCode =
  | "CANCELLED"
  | "GENERATION_FAILED"
  | "INSTALLATION_FAILED"
  | "INVALID_INPUT"
  | "PACKAGE_MANAGER_UNAVAILABLE"
  | "UNEXPECTED_ERROR";

export type CreateAstilbaErrorPhase =
  | "generation"
  | "input"
  | "installation"
  | "unknown";

export type DestinationState = "complete" | "incomplete" | "unchanged";

export interface CreateAstilbaErrorOptions {
  readonly cause?: unknown;
  readonly code: CreateAstilbaErrorCode;
  readonly destination?: string;
  readonly destinationState?: DestinationState;
  readonly diagnostics?: string;
  readonly exitCode?: number;
  readonly messageReported?: boolean;
  readonly phase: CreateAstilbaErrorPhase;
  readonly projectCreated?: boolean;
}

export class CreateAstilbaError extends Error {
  public readonly code: CreateAstilbaErrorCode;
  public readonly destination: string | undefined;
  public readonly destinationState: DestinationState;
  public readonly diagnostics: string | undefined;
  public readonly exitCode: number;
  public readonly messageReported: boolean;
  public readonly phase: CreateAstilbaErrorPhase;
  public readonly projectCreated: boolean;

  public constructor(message: string, options: CreateAstilbaErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "CreateAstilbaError";
    this.code = options.code;
    this.destination = options.destination;
    this.destinationState =
      options.destinationState ??
      (options.projectCreated === true ? "complete" : "unchanged");
    this.diagnostics = options.diagnostics;
    this.exitCode = options.exitCode ?? 1;
    this.messageReported = options.messageReported ?? false;
    this.phase = options.phase;
    this.projectCreated = this.destinationState === "complete";
  }
}

export const normalizeCreateAstilbaError = (
  error: unknown,
  fallback: Omit<CreateAstilbaErrorOptions, "cause" | "code"> & {
    readonly code?: CreateAstilbaErrorCode;
  }
): CreateAstilbaError => {
  if (error instanceof CreateAstilbaError) {
    return error;
  }

  return new CreateAstilbaError(
    error instanceof Error ? error.message : String(error),
    {
      ...fallback,
      cause: error,
      code: fallback.code ?? "UNEXPECTED_ERROR",
    }
  );
};
