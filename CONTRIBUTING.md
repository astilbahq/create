# Contributing

Thanks for considering a contribution to TypeScript Foundation.

This repository is intentionally opinionated. Open an issue before investing in a substantial new profile or universal default, and explain why the change belongs in newly generated projects rather than a single consumer repository.

## Local setup

```sh
pnpm install
pnpm verify
pnpm test:consumers
```

The repository pins Node.js and pnpm versions. Run `pnpm install` again after dependency changes and commit the resulting `pnpm-lock.yaml`.

## Generated-output changes

- Preserve the `plan → validate → apply` pipeline and deterministic output.
- Add tests for validation boundaries and output composition.
- Run the affected clean-room consumer builds. Run the complete matrix before opening a pull request.
- Keep universal defaults small. Framework, runtime, publishing, and deployment behaviour belongs in a focused profile.
- Do not add organization-specific policy, credentials, deployment identifiers, or private URLs.

## Pull requests

Use a [Conventional Commit](https://www.conventionalcommits.org/) title. Keep the pull request focused, describe affected profiles, and include compatibility or migration impact.
