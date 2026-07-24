# Astilba Create

This repository publishes `create-astilba`, a deterministic, security-conscious generator for Astilba's maintained TypeScript project recipes.

## Ground rules

1. Generation follows a `plan → validate → apply` pipeline. Internal profiles contribute outputs; they never write to the destination directly.
2. Public recipe IDs and versions are permanent compatibility contracts. Do not rename or reinterpret a released recipe.
3. The same options and generator version must produce byte-identical files. Do not introduce dates, randomness, host paths, usernames, or ambient environment variables into generated output.
4. Duplicate output paths fail unless a named, typed reducer owns that artifact. Never add generic last-write-wins merging.
5. Reject absolute paths, traversal, unplanned symlinks, control characters, unresolved placeholders, and non-empty destinations.
6. Every generated output must have an ownership class. Managed files require content digests; seeded files become user-owned; structured ownership targets individual fields; reserved metadata identifies itself without a recursive digest.
7. Never copy `.git`, credentials, deployment identifiers, private URLs, or organization-specific policy into generated projects.
8. Keep the recipe catalogue small. Optional features require explicit recipe-specific adapters and clean-room verification.
9. Dependencies and GitHub Actions are pinned exactly. Re-verify versions before changing them.
10. Run `pnpm verify` and the affected clean-room consumer checks before proposing a commit. Run `pnpm test:package` before a release.

`AGENTS.md` is canonical; `CLAUDE.md` is its symbolic link.
