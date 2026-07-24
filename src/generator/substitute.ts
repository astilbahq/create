import type { ProjectOptions } from "../options.js";

const PLACEHOLDER_PATTERN = /\{\{foundation:(?<name>[A-Za-z][A-Za-z\d]*)\}\}/gu;
const PLACEHOLDER_SENTINEL = "{{foundation:";

const VALUES_BY_PLACEHOLDER = {
  description: (options: ProjectOptions) => options.description,
  githubOwner: (options: ProjectOptions) => options.githubOwner,
  githubRepo: (options: ProjectOptions) => options.githubRepo,
  packageName: (options: ProjectOptions) => options.packageName,
  projectName: (options: ProjectOptions) => options.projectName,
} as const;

type PlaceholderName = keyof typeof VALUES_BY_PLACEHOLDER;

const isPlaceholderName = (value: string): value is PlaceholderName =>
  Object.hasOwn(VALUES_BY_PLACEHOLDER, value);

export const substitutePlaceholders = (
  source: string,
  options: ProjectOptions
): string => {
  const substituted = source.replaceAll(
    PLACEHOLDER_PATTERN,
    (_match: string, name: string) => {
      if (!isPlaceholderName(name)) {
        throw new Error(`Unknown placeholder: ${name}.`);
      }

      return VALUES_BY_PLACEHOLDER[name](options);
    }
  );

  if (substituted.includes(PLACEHOLDER_SENTINEL)) {
    throw new Error("Generated text contains an unresolved placeholder.");
  }

  return substituted.replaceAll("\r\n", "\n");
};
