#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";

import { applyGenerationPlan } from "./generator/apply.js";
import { assertSafeDestinationPath } from "./generator/paths.js";
import { createGenerationPlan } from "./generator/plan.js";
import { validateProjectOptions } from "./options.js";
import type { ProjectOptions } from "./options.js";
import { profileRegistry, projectProfileNames } from "./profiles/index.js";
import type { ProjectProfileName } from "./profiles/index.js";

const foundationRoot = path.resolve(import.meta.dirname, "..");

const HELP = `
Create a project from the TypeScript Foundation.

Usage:
  pnpm scaffold <directory> --profile <profile> --description <text> --github-owner <owner>

Options:
  --description <text>    Short project description
  --github-owner <owner>  GitHub account that will own the repository
  --github-repo <name>    GitHub repository name (defaults to directory name)
  --package-name <name>   npm package name (defaults to directory name)
  --profile <profile>     library | astro | react | workers
  --project-name <name>   Project name (defaults to directory name)
  --help                  Show this help
`;

export interface ScaffoldRequest {
  readonly destination: string;
  readonly options: ProjectOptions;
  readonly profile: ProjectProfileName;
}

const readRequiredOption = (
  values: Readonly<Record<string, boolean | string | undefined>>,
  name: string
): string => {
  const value = values[name];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${name}.`);
  }

  return value;
};

const isProjectProfile = (value: string): value is ProjectProfileName =>
  projectProfileNames.some((name) => name === value);

export const parseScaffoldArguments = (
  arguments_: readonly string[],
  cwd = process.cwd()
): ScaffoldRequest | "help" => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: [...arguments_],
    options: {
      description: { type: "string" },
      "github-owner": { type: "string" },
      "github-repo": { type: "string" },
      help: { short: "h", type: "boolean" },
      "package-name": { type: "string" },
      profile: { short: "p", type: "string" },
      "project-name": { type: "string" },
    },
    strict: true,
  });

  if (values.help === true) {
    return "help";
  }

  if (positionals.length !== 1) {
    throw new Error("Provide exactly one destination directory.");
  }

  const destinationArgument = positionals[0] ?? "";
  assertSafeDestinationPath(destinationArgument);

  const destination = path.resolve(cwd, destinationArgument);
  const inferredName = path.basename(destination);
  const profile = readRequiredOption(values, "profile");

  if (!isProjectProfile(profile)) {
    throw new Error(
      `Unknown project profile "${profile}". Choose one of: ${projectProfileNames.join(", ")}.`
    );
  }

  const options = validateProjectOptions({
    description: readRequiredOption(values, "description"),
    githubOwner: readRequiredOption(values, "github-owner"),
    githubRepo:
      typeof values["github-repo"] === "string"
        ? values["github-repo"]
        : inferredName,
    packageName:
      typeof values["package-name"] === "string"
        ? values["package-name"]
        : inferredName,
    projectName:
      typeof values["project-name"] === "string"
        ? values["project-name"]
        : inferredName,
  });

  return {
    destination,
    options,
    profile,
  };
};

export const scaffoldProject = async (
  request: ScaffoldRequest,
  forbiddenRoots: readonly string[] = []
): Promise<void> => {
  const plan = createGenerationPlan(
    [request.profile],
    profileRegistry,
    request.options
  );
  await applyGenerationPlan(plan, request.destination, {
    forbiddenRoots: [foundationRoot, ...forbiddenRoots],
    initializeGit: true,
  });
};

export const runCli = async (
  arguments_: readonly string[] = process.argv.slice(2)
): Promise<void> => {
  const request = parseScaffoldArguments(arguments_);

  if (request === "help") {
    process.stdout.write(HELP);
    return;
  }

  await scaffoldProject(request, [foundationRoot]);
  process.stdout.write(
    `Created ${request.profile} project at ${request.destination}\n`
  );
};
