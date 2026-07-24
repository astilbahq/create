const GITHUB_OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu;
const GITHUB_REPOSITORY_PATTERN = /^[a-z\d](?:[a-z\d._-]{0,98}[a-z\d])?$/iu;
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z\d](?:[a-z\d._-]*[a-z\d])?\/)?[a-z\d](?:[a-z\d._-]*[a-z\d])?$/u;
const PROJECT_NAME_PATTERN = /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/u;

const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

export interface ProjectOptions {
  readonly description: string;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly packageName: string;
  readonly projectName: string;
}

const assertUnmodifiedTrim = (label: string, value: string): void => {
  if (value !== value.trim()) {
    throw new Error(`${label} must not start or end with whitespace.`);
  }
};

const assertPlainText = (
  label: string,
  value: string,
  maximumLength: number
): void => {
  assertUnmodifiedTrim(label, value);

  if (value.length === 0 || value.length > maximumLength) {
    throw new Error(
      `${label} must contain between 1 and ${maximumLength} characters.`
    );
  }

  if (containsControlCharacter(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
};

export const validateProjectOptions = (
  options: ProjectOptions
): ProjectOptions => {
  assertPlainText("Project name", options.projectName, 100);
  assertPlainText("Package name", options.packageName, 214);
  assertPlainText("Description", options.description, 280);
  assertPlainText("GitHub owner", options.githubOwner, 39);
  assertPlainText("GitHub repository", options.githubRepo, 100);

  if (!PROJECT_NAME_PATTERN.test(options.projectName)) {
    throw new Error(
      "Project name must use lowercase letters, digits, dots, underscores, or hyphens."
    );
  }

  if (!PACKAGE_NAME_PATTERN.test(options.packageName)) {
    throw new Error("Package name is not a supported npm package name.");
  }

  if (!GITHUB_OWNER_PATTERN.test(options.githubOwner)) {
    throw new Error("GitHub owner is not a supported account name.");
  }

  if (!GITHUB_REPOSITORY_PATTERN.test(options.githubRepo)) {
    throw new Error("GitHub repository is not a supported repository name.");
  }

  return Object.freeze({ ...options });
};
