import type { ProjectOptions } from "../options.js";

type FileMode = 0o644 | 0o755;
type FileOwnership = "managed" | "metadata" | "seeded" | "structured";

export interface TextFileDeclaration {
  readonly content: string;
  readonly mode?: FileMode;
  readonly ownership?: Exclude<FileOwnership, "metadata" | "structured">;
  readonly path: string;
}

export interface SymlinkDeclaration {
  readonly path: string;
  readonly targetPath: string;
}

type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface PackageJsonFragment {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly fields?: Readonly<Record<string, JsonValue>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
}

export interface Profile {
  readonly conflicts?: readonly string[];
  readonly files?: readonly TextFileDeclaration[];
  readonly name: string;
  readonly packageJson?: PackageJsonFragment;
  readonly requires?: readonly string[];
  readonly symlinks?: readonly SymlinkDeclaration[];
  readonly validateOptions?: (options: ProjectOptions) => undefined;
}

export interface PlannedFile {
  readonly content: string;
  readonly mode: FileMode;
  readonly origin: string;
  readonly ownership: FileOwnership;
  readonly path: string;
}

export interface PlannedSymlink {
  readonly origin: string;
  readonly path: string;
  readonly targetPath: string;
}

export interface GenerationPlan {
  readonly files: readonly PlannedFile[];
  readonly profiles: readonly string[];
  readonly symlinks?: readonly PlannedSymlink[];
}
