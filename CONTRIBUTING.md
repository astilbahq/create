# Contributing

Thanks for considering a contribution to Astilba Create.

This repository is intentionally opinionated. Open an issue before investing in a new recipe, feature, or universal default, and explain why the change belongs in newly generated projects rather than a single consumer repository.

## Local setup

```sh
pnpm install
pnpm verify
pnpm test:consumers
pnpm test:package
```

The repository pins Node.js and pnpm versions. Run `pnpm install` again after dependency changes and commit the resulting `pnpm-lock.yaml`.

## Generated-output changes

- Preserve the `plan → validate → apply` pipeline and deterministic output.
- Add tests for validation boundaries and output composition.
- Run the affected clean-room consumer builds. Run the complete matrix before opening a pull request.
- Keep universal defaults small. Public project shapes belong in a versioned recipe; future optional features require recipe-specific adapters.
- Preserve output ownership metadata and fail closed when a generated path or structured field cannot be merged safely.
- Do not add organization-specific policy, credentials, deployment identifiers, or private URLs.

## Pull requests

Use a [Conventional Commit](https://www.conventionalcommits.org/) title. Keep the pull request focused, describe affected recipes, and include compatibility or migration impact.
