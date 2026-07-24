# TypeScript Foundation

This repository generates new TypeScript projects from a neutral, deterministic foundation. It is an ordinary public repository, not a GitHub template.

## Ground rules

1. Generation follows a `plan → validate → apply` pipeline. Profiles declare outputs; they never write to the destination directly.
2. The same options and foundation revision must produce byte-identical files. Do not introduce dates, randomness, host paths, usernames, or ambient environment variables into generated output.
3. Duplicate output paths fail unless a named, typed reducer owns that file. Never add generic last-write-wins merging.
4. Reject absolute paths, traversal, symlinks, control characters, unresolved placeholders, and non-empty destinations.
5. Never copy `.git`, credentials, deployment identifiers, private URLs, or organization-specific policy into generated projects.
6. Keep the base profile small. Frameworks, runtimes, publishing, and deployment belong in explicit profiles.
7. Dependencies and GitHub Actions are pinned exactly. Re-verify versions before changing them.
8. Run `pnpm verify` before proposing a commit.
