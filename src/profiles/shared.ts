import type { TextFileDeclaration } from "../generator/types.js";

export const file = (
  path: string,
  content: string,
  mode: 0o644 | 0o755 = 0o644
): TextFileDeclaration => ({
  content: content.replace(/^\n/u, ""),
  mode,
  path,
});

export const projectProfileNames = [
  "library",
  "astro",
  "react",
  "workers",
] as const;

export type ProjectProfileName = (typeof projectProfileNames)[number];

export const projectProfileConflicts = (
  current: ProjectProfileName
): readonly ProjectProfileName[] =>
  projectProfileNames.filter((name) => name !== current);
