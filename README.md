# TypeScript Foundation

An opinionated, security-conscious foundation for new TypeScript projects.

This repository provides a deterministic scaffolder with a small universal base and focused profiles for libraries, Astro, React, and Cloudflare Workers. Generated repositories receive fresh Git histories and have no GitHub template relationship.

## Create a project

```sh
pnpm install
pnpm scaffold ../my-project \
  --profile library \
  --description "A useful TypeScript library." \
  --github-owner ReesMorris \
  --package-name @reesmorris/my-project
```

Available profiles are `library`, `astro`, `react`, and `workers`. The destination must not already exist. These are whole-project recipes rather than freely composable capabilities.

Run `pnpm test:consumers` to generate, install, verify, and build every profile as a standalone project. Pass one or more profile names to narrow the matrix.
