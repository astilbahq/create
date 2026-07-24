# TypeScript Foundation

An opinionated, security-conscious foundation for new TypeScript projects.

This is an ordinary public repository, not a GitHub template. Its deterministic scaffolder creates independent repositories with fresh Git histories, so generated projects have no template provenance or shared commit ancestry.

## What it includes

Every profile receives:

- exact Node.js, pnpm, dependency, and GitHub Action pins;
- strict TypeScript, Ultracite with Oxfmt and Oxlint, Vitest, and Knip;
- a frozen-lockfile CI matrix across supported Node.js majors;
- Actionlint, Zizmor, OSV-Scanner, PR-title validation, and public-repository CodeQL and dependency review;
- Renovate with a three-day release-age gate and conservative automerge rules;
- issue forms, a pull-request template, security and contribution guidance, and concise agent instructions; and
- portable text settings, an MIT license, and a minimal project README.

Focused profiles add the tooling their project shape needs:

| Profile | Adds |
| --- | --- |
| `library` | ESM package output, declarations and source maps, Publint, and Are the Types Wrong |
| `astro` | Astro, Astro Check, a static page, and a production build |
| `react` | React, Vite, strict JSX types, and a production build |
| `workers` | Wrangler, generated binding types, `workerd`-backed Vitest, and a dry-run deployment build |

## Create a project

```sh
pnpm install
pnpm scaffold my-project \
  --profile library \
  --description "A useful TypeScript library." \
  --github-owner ReesMorris \
  --package-name @reesmorris/my-project
```

From the foundation checkout, run `pnpm test:consumers` to generate, install, verify, and build every profile as a standalone project. Pass one or more profile names to narrow the matrix.

The project is created beside the foundation checkout, and the destination must not already exist. The foundation and its generated projects keep `AGENTS.md` canonical with a `CLAUDE.md` symbolic link. On Windows, enable Developer Mode or use an elevated shell and configure Git to preserve symbolic links before cloning.

Install dependencies before the generated repository's first commit so its `pnpm-lock.yaml` becomes part of that new history:

```sh
cd ../my-project
pnpm install
pnpm verify
git add --all
git commit -m "chore: initialize project"
```

The profiles are whole-project recipes rather than freely composable capabilities. Compound project shapes should start with the nearest recipe and make an intentional follow-up change.

## Deliberate omissions

The foundation does not choose deployment credentials, hosting, release automation, package versioning, coverage thresholds, browser tests, product architecture, or organization-specific branch rules. Those decisions depend on the project and should become explicit follow-up commits rather than hidden defaults.

After the first push, complete the short [repository-settings checklist](docs/repository-settings.md).
