import path from "node:path";

const WINDOWS_SEPARATOR_PATTERN = /\\/u;
const WINDOWS_DEVICE_NAME_PATTERN =
  /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_FORBIDDEN_CHARACTERS = '<>:"|?*';

export const INCOMPLETE_MARKER_PATH = ".typescript-foundation-incomplete";

const isPortableSegment = (segment: string): boolean => {
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.toLowerCase() === ".git" ||
    segment.endsWith(".") ||
    segment.endsWith(" ") ||
    WINDOWS_DEVICE_NAME_PATTERN.test(segment)
  ) {
    return false;
  }

  for (const character of segment) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === undefined ||
      codePoint < 32 ||
      codePoint > 126 ||
      WINDOWS_FORBIDDEN_CHARACTERS.includes(character)
    ) {
      return false;
    }
  }

  return true;
};

export const normalizeOutputPath = (candidate: string): string => {
  const portableCandidate = candidate.toLowerCase();

  if (
    candidate.length === 0 ||
    candidate.includes("\0") ||
    path.isAbsolute(candidate) ||
    path.win32.isAbsolute(candidate) ||
    WINDOWS_SEPARATOR_PATTERN.test(candidate)
  ) {
    throw new Error(`Unsafe output path: ${candidate || "<empty>"}.`);
  }

  const segments = candidate.split("/");

  if (
    portableCandidate === INCOMPLETE_MARKER_PATH ||
    portableCandidate.startsWith(`${INCOMPLETE_MARKER_PATH}/`) ||
    segments.some((segment) => !isPortableSegment(segment))
  ) {
    throw new Error(`Unsafe output path: ${candidate}.`);
  }

  const normalized = path.posix.normalize(candidate);

  if (normalized !== candidate) {
    throw new Error(`Output path must already be normalized: ${candidate}.`);
  }

  return normalized;
};

export const resolveOutputPath = (root: string, candidate: string): string => {
  const normalized = normalizeOutputPath(candidate);
  const resolvedRoot = path.resolve(root);
  const resolvedOutput = path.resolve(resolvedRoot, ...normalized.split("/"));
  const fromRoot = path.relative(resolvedRoot, resolvedOutput);

  if (
    fromRoot.length === 0 ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromRoot)
  ) {
    throw new Error(`Output path escapes its destination: ${candidate}.`);
  }

  return resolvedOutput;
};

export const isWithinPath = (candidate: string, parent: string): boolean => {
  const fromParent = path.relative(
    path.resolve(parent),
    path.resolve(candidate)
  );

  return (
    fromParent.length === 0 ||
    (fromParent !== ".." &&
      !fromParent.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(fromParent))
  );
};
