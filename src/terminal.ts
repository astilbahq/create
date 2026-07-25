import type { Readable, Writable } from "node:stream";

import * as prompts from "@clack/prompts";

export type CliPromptId =
  | "customize-metadata"
  | "description"
  | "destination"
  | "edit-field"
  | "github-repo"
  | "github-owner"
  | "initialize-git"
  | "install-dependencies"
  | "package-name"
  | "project-name"
  | "recipe"
  | "review-action";

interface CliPromptOptions {
  readonly message: string;
}

interface CliTextPromptOptions extends CliPromptOptions {
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly validate?: (value: string | undefined) => string | undefined;
}

interface CliSelectOption {
  readonly hint?: string;
  readonly label: string;
  readonly value: string;
}

interface CliSelectPromptOptions extends CliPromptOptions {
  readonly options: readonly CliSelectOption[];
}

interface CliConfirmPromptOptions extends CliPromptOptions {
  readonly initialValue: boolean;
}

interface CliSpinner {
  readonly message: (message: string) => void;
  readonly start: (message: string) => void;
  readonly stop: (message: string) => void;
}

export interface CliTerminal {
  readonly cancel: (message: string, signal?: AbortSignal) => void;
  readonly confirm: (
    id: CliPromptId,
    options: CliConfirmPromptOptions,
    signal?: AbortSignal
  ) => Promise<boolean>;
  readonly intro: (message: string, signal?: AbortSignal) => void;
  readonly note: (
    message: string,
    title?: string,
    signal?: AbortSignal
  ) => void;
  readonly outro: (message: string, signal?: AbortSignal) => void;
  readonly select: (
    id: CliPromptId,
    options: CliSelectPromptOptions,
    signal?: AbortSignal
  ) => Promise<string>;
  readonly spinner: (signal?: AbortSignal) => CliSpinner;
  readonly text: (
    id: CliPromptId,
    options: CliTextPromptOptions,
    signal?: AbortSignal
  ) => Promise<string>;
}

export class CliPromptCancelledError extends Error {
  public readonly messageReported: boolean;

  public constructor(messageReported = false) {
    super("Project creation was cancelled.");
    this.name = "CliPromptCancelledError";
    this.messageReported = messageReported;
  }
}

interface ClackTerminalOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly signal?: AbortSignal;
}

export const createClackTerminal = ({
  input,
  output,
  signal,
}: ClackTerminalOptions): CliTerminal => {
  const createCommonOptions = (overrideSignal?: AbortSignal) => {
    const resolvedSignal = overrideSignal ?? signal;
    return {
      input,
      output,
      ...(resolvedSignal === undefined ? {} : { signal: resolvedSignal }),
    };
  };
  const requirePromptValue = <Value>(
    value: Value | symbol,
    commonOptions: ReturnType<typeof createCommonOptions>
  ): Value => {
    if (prompts.isCancel(value)) {
      let messageReported = false;

      try {
        prompts.cancel("Project creation cancelled.", commonOptions);
        messageReported = true;
      } catch {
        // Cancellation remains authoritative if its best-effort renderer fails.
      }

      throw new CliPromptCancelledError(messageReported);
    }

    return value;
  };
  const requirePromptString = (
    value: string | symbol,
    commonOptions: ReturnType<typeof createCommonOptions>
  ): string => {
    const resolved = requirePromptValue(value, commonOptions);

    if (typeof resolved !== "string") {
      throw new TypeError("The prompt did not return a text value.");
    }

    return resolved;
  };

  return {
    cancel: (message, overrideSignal) => {
      prompts.cancel(message, createCommonOptions(overrideSignal));
    },
    confirm: async (_id, options, overrideSignal) => {
      const commonOptions = createCommonOptions(overrideSignal);
      return requirePromptValue(
        await prompts.confirm({
          ...options,
          ...commonOptions,
        }),
        commonOptions
      );
    },
    intro: (message, overrideSignal) => {
      prompts.intro(message, createCommonOptions(overrideSignal));
    },
    note: (message, title, overrideSignal) => {
      prompts.note(message, title, createCommonOptions(overrideSignal));
    },
    outro: (message, overrideSignal) => {
      prompts.outro(message, createCommonOptions(overrideSignal));
    },
    select: async (_id, options, overrideSignal) => {
      const commonOptions = createCommonOptions(overrideSignal);
      return requirePromptValue(
        await prompts.select<string>({
          ...options,
          options: options.options.map(({ hint, label, value }) => ({
            label,
            value,
            ...(hint === undefined ? {} : { hint }),
          })),
          ...commonOptions,
        }),
        commonOptions
      );
    },
    spinner: (overrideSignal) => {
      const commonOptions = createCommonOptions(overrideSignal);
      const spinner = prompts.spinner(commonOptions);
      return {
        message: (message) => {
          spinner.message(message);
        },
        start: (message) => {
          spinner.start(message);
        },
        stop: (message) => {
          spinner.stop(message);
        },
      };
    },
    text: async (_id, options, overrideSignal) => {
      const commonOptions = createCommonOptions(overrideSignal);
      const validate =
        options.validate === undefined
          ? undefined
          : (value: string | undefined) =>
              options.validate?.(
                (value ?? "").length === 0 ? options.defaultValue : value
              );
      return requirePromptString(
        await prompts.text({
          ...options,
          ...(validate === undefined ? {} : { validate }),
          ...commonOptions,
        }),
        commonOptions
      );
    },
  };
};
