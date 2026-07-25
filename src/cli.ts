import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { parseArgs } from "node:util";

import { CreateAstilbaError, normalizeCreateAstilbaError } from "./errors.js";
import { applyGenerationPlan } from "./generator/apply.js";
import { assertSafeDestinationArgument } from "./generator/paths.js";
import type { GenerationPlan } from "./generator/types.js";
import { installProjectDependencies } from "./install.js";
import {
  CREATE_ASTILBA_VERSION,
  createProjectGenerationPlan,
} from "./manifest.js";
import { validateProjectOptions } from "./options.js";
import type { ProjectOptions } from "./options.js";
import {
  getProjectRecipe,
  isProjectRecipeId,
  projectRecipeIds,
  recipeRegistry,
} from "./recipes.js";
import type { ProjectRecipeId } from "./recipes.js";
import { CliPromptCancelledError, createClackTerminal } from "./terminal.js";
import type { CliTerminal } from "./terminal.js";

const HELP = `
Create a project with Astilba's TypeScript foundations.

Usage:
  npm create astilba@latest
  npm create astilba@latest -- <directory> --recipe <recipe> [options]

Recipes:
  typescript-library          ESM TypeScript library
  react-vite-spa             Client-rendered React + Vite application
  astro-static-site          Statically rendered Astro site
  cloudflare-worker-service  Cloudflare Worker service

Options:
  --description <text>    Short project description
  --github-owner <owner>  GitHub account that will own the repository
  --github-repo <name>    GitHub repository name (defaults to directory name)
  --package-name <name>   npm package name (defaults to directory name)
  --project-name <name>   Project name (defaults to directory name)
  --recipe <recipe>       Stable recipe identifier
  --git / --no-git        Enable or disable Git initialization
  --install / --no-install
                          Enable or disable dependency installation
  --dry-run               Validate and show the plan without writing
  --json                  Emit versioned machine-readable output
  --yes                   Skip the final interactive confirmation
  --version               Show the installed version
  --help                  Show this help
`;

export const CLI_OUTPUT_SCHEMA_VERSION = 1;

interface PartialCreateInput {
  readonly description?: string;
  readonly destinationArgument?: string;
  readonly dryRun: boolean;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
  readonly initializeGit?: boolean;
  readonly installDependencies?: boolean;
  readonly json: boolean;
  readonly packageName?: string;
  readonly projectName?: string;
  readonly recipe?: ProjectRecipeId;
  readonly yes: boolean;
}

type ParsedCommand =
  | { readonly command: "create"; readonly input: PartialCreateInput }
  | { readonly command: "help"; readonly json: boolean }
  | { readonly command: "version"; readonly json: boolean };

export interface ScaffoldRequest {
  readonly destination: string;
  readonly dryRun: boolean;
  readonly initializeGit: boolean;
  readonly installDependencies: boolean;
  readonly json: boolean;
  readonly options: ProjectOptions;
  readonly recipe: ProjectRecipeId;
}

export interface ScaffoldResult {
  readonly destination: string;
  readonly installed: boolean;
  readonly plan: GenerationPlan;
  readonly recipe: ProjectRecipeId;
}

const readStringOption = (
  values: Readonly<Record<string, boolean | string | undefined>>,
  name: string
): string | undefined => {
  const value = values[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const CLI_OPTIONS = {
  description: { type: "string" },
  "dry-run": { type: "boolean" },
  git: { type: "boolean" },
  "github-owner": { type: "string" },
  "github-repo": { type: "string" },
  help: { short: "h", type: "boolean" },
  install: { type: "boolean" },
  json: { type: "boolean" },
  "package-name": { type: "string" },
  "project-name": { type: "string" },
  recipe: { short: "r", type: "string" },
  version: { short: "v", type: "boolean" },
  yes: { short: "y", type: "boolean" },
} as const;

export const isJsonOutputRequested = (
  arguments_: readonly string[]
): boolean => {
  const { values } = parseArgs({
    allowNegative: true,
    allowPositionals: true,
    args: [...arguments_],
    options: CLI_OPTIONS,
    strict: false,
  });

  return values.json === true;
};

export const parseCliArguments = (
  arguments_: readonly string[]
): ParsedCommand => {
  const { positionals, values } = parseArgs({
    allowNegative: true,
    allowPositionals: true,
    args: [...arguments_],
    options: CLI_OPTIONS,
    strict: true,
  });
  const json = values.json === true;

  if (values.help === true) {
    return { command: "help", json };
  }

  if (values.version === true) {
    return { command: "version", json };
  }

  if (positionals.length > 1) {
    throw new Error("Provide at most one destination directory.");
  }

  const recipeValue = readStringOption(values, "recipe");
  let recipe: ProjectRecipeId | undefined;

  if (recipeValue !== undefined) {
    if (!isProjectRecipeId(recipeValue)) {
      throw new Error(
        `Unknown project recipe "${recipeValue}". Choose one of: ${projectRecipeIds.join(", ")}.`
      );
    }

    recipe = recipeValue;
  }

  const description = readStringOption(values, "description");
  const [destinationArgument] = positionals;
  const githubOwner = readStringOption(values, "github-owner");
  const githubRepo = readStringOption(values, "github-repo");
  const packageName = readStringOption(values, "package-name");
  const projectName = readStringOption(values, "project-name");
  const initializeGit =
    typeof values.git === "boolean" ? values.git : undefined;
  const installDependencies =
    typeof values.install === "boolean" ? values.install : undefined;

  return {
    command: "create",
    input: {
      dryRun: values["dry-run"] === true,
      json: values.json === true,
      yes: values.yes === true,
      ...(description === undefined ? {} : { description }),
      ...(destinationArgument === undefined ? {} : { destinationArgument }),
      ...(githubOwner === undefined ? {} : { githubOwner }),
      ...(githubRepo === undefined ? {} : { githubRepo }),
      ...(initializeGit === undefined ? {} : { initializeGit }),
      ...(installDependencies === undefined ? {} : { installDependencies }),
      ...(packageName === undefined ? {} : { packageName }),
      ...(projectName === undefined ? {} : { projectName }),
      ...(recipe === undefined ? {} : { recipe }),
    },
  };
};

const inferProjectName = (destinationArgument: string): string => {
  const inferredName = path
    .basename(destinationArgument)
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 63)
    .replace(/-+$/u, "");

  if (inferredName.length === 0) {
    throw new Error(
      "The destination name must include at least one letter or digit so project metadata can be inferred."
    );
  }

  return inferredName;
};

const collectInteractiveInput = async (
  input: PartialCreateInput,
  terminal: CliTerminal,
  signal?: AbortSignal
): Promise<PartialCreateInput> => {
  terminal.intro("Astilba Create", signal);

  const destinationArgument =
    input.destinationArgument ??
    (await terminal.text(
      "destination",
      {
        defaultValue: "my-project",
        message: "Where should we create your project?",
        placeholder: "my-project",
        validate: (value) => {
          try {
            assertSafeDestinationArgument(value ?? "");
            inferProjectName(value ?? "");
          } catch (error: unknown) {
            return error instanceof Error ? error.message : String(error);
          }
        },
      },
      signal
    ));
  assertSafeDestinationArgument(destinationArgument);
  const inferredName = inferProjectName(destinationArgument);
  const recipeSelection =
    input.recipe ??
    (await terminal.select(
      "recipe",
      {
        message: "Choose a starting point",
        options: projectRecipeIds.map((recipeId) => {
          const candidate = getProjectRecipe(recipeId);
          return {
            hint: candidate.description,
            label: candidate.label,
            value: candidate.id,
          };
        }),
      },
      signal
    ));
  if (!isProjectRecipeId(recipeSelection)) {
    throw new TypeError("The prompt returned an unknown project recipe.");
  }
  const recipe = recipeSelection;
  const description =
    input.description ??
    (await terminal.text(
      "description",
      {
        message: "Project description",
        placeholder: "A useful TypeScript project.",
        validate: (value) =>
          (value ?? "").trim().length === 0
            ? "Enter a project description."
            : undefined,
      },
      signal
    ));
  const packageName =
    input.packageName ??
    (await terminal.text(
      "package-name",
      {
        defaultValue: inferredName,
        message: "npm package name",
        placeholder: inferredName,
      },
      signal
    ));
  const githubOwner =
    input.githubOwner ??
    (await terminal.text(
      "github-owner",
      {
        message: "GitHub owner",
        placeholder: "your-account",
        validate: (value) =>
          (value ?? "").trim().length === 0
            ? "Enter a GitHub account."
            : undefined,
      },
      signal
    ));
  const initializeGit =
    input.initializeGit ??
    (await terminal.confirm(
      "initialize-git",
      {
        initialValue: true,
        message: "Initialize a Git repository?",
      },
      signal
    ));
  const installDependencies =
    input.installDependencies ??
    (await terminal.confirm(
      "install-dependencies",
      {
        initialValue: true,
        message: "Install dependencies?",
      },
      signal
    ));

  if (!input.yes) {
    const confirmed = await terminal.confirm(
      "confirm-creation",
      {
        initialValue: true,
        message: `Create ${inferredName} from ${getProjectRecipe(recipe).label}?`,
      },
      signal
    );

    if (!confirmed) {
      terminal.cancel("Project creation cancelled.", signal);
      throw new CliPromptCancelledError();
    }
  }

  return {
    ...input,
    description,
    destinationArgument,
    githubOwner,
    initializeGit,
    installDependencies,
    packageName,
    recipe,
  };
};

const hasRequiredInput = (
  input: PartialCreateInput
): input is PartialCreateInput & {
  readonly description: string;
  readonly destinationArgument: string;
  readonly githubOwner: string;
  readonly recipe: ProjectRecipeId;
} =>
  input.description !== undefined &&
  input.destinationArgument !== undefined &&
  input.githubOwner !== undefined &&
  input.recipe !== undefined;

export const resolveScaffoldRequest = async (
  input: PartialCreateInput,
  {
    cwd = process.cwd(),
    interactive = process.stdin.isTTY === true && process.stdout.isTTY === true,
    signal,
    terminal,
  }: {
    readonly cwd?: string;
    readonly interactive?: boolean;
    readonly signal?: AbortSignal;
    readonly terminal?: CliTerminal;
  } = {}
): Promise<ScaffoldRequest> => {
  if (signal?.aborted) {
    throw signal.reason;
  }

  let resolvedInput: PartialCreateInput | undefined = input;

  if (!hasRequiredInput(input)) {
    resolvedInput =
      input.json || !interactive
        ? undefined
        : await collectInteractiveInput(
            input,
            terminal ??
              createClackTerminal({
                input: process.stdin,
                output: process.stdout,
                ...(signal === undefined ? {} : { signal }),
              }),
            signal
          );
  }

  if (!resolvedInput || !hasRequiredInput(resolvedInput)) {
    throw new Error(
      "Non-interactive creation requires a destination, --recipe, --description, and --github-owner."
    );
  }

  assertSafeDestinationArgument(resolvedInput.destinationArgument);
  const destination = path.resolve(cwd, resolvedInput.destinationArgument);
  const inferredName = inferProjectName(resolvedInput.destinationArgument);
  const options = validateProjectOptions({
    description: resolvedInput.description,
    githubOwner: resolvedInput.githubOwner,
    githubRepo: resolvedInput.githubRepo ?? inferredName,
    packageName: resolvedInput.packageName ?? inferredName,
    projectName: resolvedInput.projectName ?? inferredName,
  });

  return {
    destination,
    dryRun: resolvedInput.dryRun,
    initializeGit: resolvedInput.initializeGit ?? true,
    installDependencies: resolvedInput.installDependencies ?? false,
    json: resolvedInput.json,
    options,
    recipe: resolvedInput.recipe,
  };
};

export const scaffoldProject = async (
  request: ScaffoldRequest,
  forbiddenRoots: readonly string[] = [],
  signal?: AbortSignal
): Promise<ScaffoldResult> => {
  if (signal?.aborted) {
    throw new CreateAstilbaError("Project creation was interrupted.", {
      cause: signal.reason,
      code: "CANCELLED",
      destination: request.destination,
      exitCode: 130,
      phase: "input",
      projectCreated: false,
    });
  }
  let plan: GenerationPlan;

  try {
    plan = createProjectGenerationPlan(request.recipe, request.options);

    if (!request.dryRun) {
      await applyGenerationPlan(plan, request.destination, {
        forbiddenRoots,
        initializeGit: request.initializeGit,
        ...(signal === undefined ? {} : { signal }),
      });
    }
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw new CreateAstilbaError("Project creation was interrupted.", {
        cause: signal.reason,
        code: "CANCELLED",
        destination: request.destination,
        exitCode: 130,
        phase: "generation",
        projectCreated: false,
      });
    }

    throw normalizeCreateAstilbaError(error, {
      code: "GENERATION_FAILED",
      destination: request.destination,
      phase: "generation",
      projectCreated: false,
    });
  }

  if (!request.dryRun && signal?.aborted) {
    throw new CreateAstilbaError("Project creation was interrupted.", {
      cause: signal.reason,
      code: "CANCELLED",
      destination: request.destination,
      exitCode: 130,
      phase: "generation",
      projectCreated: true,
    });
  }

  if (request.installDependencies && !request.dryRun) {
    if (signal?.aborted) {
      throw new CreateAstilbaError("Project creation was interrupted.", {
        cause: signal.reason,
        code: "CANCELLED",
        destination: request.destination,
        exitCode: 130,
        phase: "installation",
        projectCreated: true,
      });
    }
    await installProjectDependencies(
      request.destination,
      signal === undefined ? {} : { signal }
    );
  }

  return {
    destination: request.destination,
    installed: request.installDependencies && !request.dryRun,
    plan,
    recipe: request.recipe,
  };
};

const writeJsonResult = (
  result: ScaffoldResult,
  dryRun: boolean,
  output: Writable
): void => {
  output.write(
    `${JSON.stringify({
      action: dryRun ? "plan" : "create",
      destination: result.destination,
      files: result.plan.files.map((file) => file.path),
      installed: result.installed,
      ok: true,
      recipe: result.recipe,
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      symlinks: (result.plan.symlinks ?? []).map((symlink) => symlink.path),
    })}\n`
  );
};

const parseCliCommand = (arguments_: readonly string[]): ParsedCommand => {
  try {
    return parseCliArguments(arguments_);
  } catch (error: unknown) {
    throw normalizeCreateAstilbaError(error, {
      code: "INVALID_INPUT",
      phase: "input",
      projectCreated: false,
    });
  }
};

const resolveCliRequest = async (
  input: PartialCreateInput,
  {
    cwd,
    interactive,
    signal,
    terminal,
  }: {
    readonly cwd: string;
    readonly interactive: boolean;
    readonly signal?: AbortSignal;
    readonly terminal: CliTerminal;
  }
): Promise<ScaffoldRequest> => {
  try {
    return await resolveScaffoldRequest(input, {
      cwd,
      interactive,
      terminal,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error: unknown) {
    if (signal?.aborted || error instanceof CliPromptCancelledError) {
      const cause = signal?.reason ?? error;
      throw new CreateAstilbaError(
        cause instanceof Error
          ? cause.message
          : "Project creation was interrupted.",
        {
          cause,
          code: "CANCELLED",
          exitCode: 130,
          phase: "input",
          projectCreated: false,
        }
      );
    }

    throw normalizeCreateAstilbaError(error, {
      code: "INVALID_INPUT",
      phase: "input",
      projectCreated: false,
    });
  }
};

interface RunCliOptions {
  readonly cwd?: string;
  readonly input?: Readable;
  readonly interactive?: boolean;
  readonly output?: Writable;
  readonly signal?: AbortSignal;
  readonly terminal?: CliTerminal;
}

interface CliRuntime {
  readonly canPrompt: boolean;
  readonly canRenderClack: boolean;
  readonly cwd: string;
  readonly output: Writable;
  readonly terminal: CliTerminal;
}

const streamIsInteractive = (stream: Readable | Writable): boolean =>
  Reflect.get(stream, "isTTY") === true;

const resolveCliRuntime = (options: RunCliOptions): CliRuntime => {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  return {
    canPrompt:
      options.interactive ??
      (streamIsInteractive(input) && streamIsInteractive(output)),
    canRenderClack: options.interactive ?? streamIsInteractive(output),
    cwd: options.cwd ?? process.cwd(),
    output,
    terminal:
      options.terminal ??
      createClackTerminal({
        input,
        output,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      }),
  };
};

const renderAfterScaffold = (
  request: ScaffoldRequest,
  render: () => void
): void => {
  try {
    render();
  } catch (error: unknown) {
    throw normalizeCreateAstilbaError(error, {
      code: "UNEXPECTED_ERROR",
      destination: request.destination,
      phase: "unknown",
      projectCreated: !request.dryRun,
    });
  }
};

const getProgressMessages = (
  request: ScaffoldRequest
): {
  readonly completion: string;
  readonly progress: string;
} => {
  if (request.dryRun) {
    return {
      completion: "Project plan ready",
      progress: "Planning project",
    };
  }

  if (request.installDependencies) {
    return {
      completion: "Project created and dependencies installed",
      progress: "Creating project and installing dependencies",
    };
  }

  return {
    completion: "Project created",
    progress: "Creating project",
  };
};

export const runCli = async (
  arguments_: readonly string[] = process.argv.slice(2),
  options: RunCliOptions = {}
): Promise<void> => {
  const { canPrompt, canRenderClack, cwd, output, terminal } =
    resolveCliRuntime(options);
  const parsed = parseCliCommand(arguments_);

  if (parsed.command === "help") {
    output.write(
      parsed.json
        ? `${JSON.stringify({
            command: "help",
            ok: true,
            schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
            usage: HELP.trim(),
          })}\n`
        : HELP
    );
    return;
  }

  if (parsed.command === "version") {
    output.write(
      parsed.json
        ? `${JSON.stringify({
            command: "version",
            ok: true,
            schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
            version: CREATE_ASTILBA_VERSION,
          })}\n`
        : `${CREATE_ASTILBA_VERSION}\n`
    );
    return;
  }

  const request = await resolveCliRequest(parsed.input, {
    cwd,
    interactive: canPrompt,
    terminal,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const spinner =
    request.json || !canRenderClack
      ? undefined
      : terminal.spinner(options.signal);
  const progressMessages = getProgressMessages(request);

  spinner?.start(progressMessages.progress);

  let result: ScaffoldResult;

  try {
    result = await scaffoldProject(request, [], options.signal);
  } catch (error: unknown) {
    try {
      spinner?.stop("Project creation needs attention");
    } catch {
      // Keep the operation failure authoritative if terminal rendering fails.
    }
    throw error;
  }

  renderAfterScaffold(request, () => {
    spinner?.stop(progressMessages.completion);
  });

  if (request.json) {
    renderAfterScaffold(request, () => {
      writeJsonResult(result, request.dryRun, output);
    });
    return;
  }

  const recipe = recipeRegistry.get(result.recipe);
  const verb = request.dryRun ? "Planned" : "Created";
  const summary = `${verb} ${recipe?.label ?? result.recipe} at ${result.destination}`;

  renderAfterScaffold(request, () => {
    if (canRenderClack) {
      terminal.outro(summary, options.signal);
    } else {
      output.write(`${summary}\n`);
    }
  });
};
