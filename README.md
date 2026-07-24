# Astilba Create

Create production-ready TypeScript projects with Astilba's maintained engineering foundations.

Astilba Create is an ordinary public repository, not a GitHub template. Its deterministic CLI generates independent repositories with fresh Git histories and no shared commit ancestry.

## Create a project

```sh
npm create astilba@latest
```

The interactive CLI asks where to create the project, which supported recipe to use, and the small amount of project metadata that cannot be inferred safely.

For agents and automated environments, provide every input explicitly:

```sh
npm create astilba@latest -- my-project \
  --recipe react-vite-spa \
  --description "A useful application." \
  --github-owner example \
  --package-name @example/my-project \
  --no-install
```

Use `--dry-run` to validate and inspect a plan without writing files. Use `--json` for versioned machine-readable output; that mode never prompts.

## Maintained recipes

| Recipe | Starting point |
| --- | --- |
| `typescript-library` | ESM TypeScript package with declarations and packaging checks |
| `react-vite-spa` | Client-rendered React application built with Vite |
| `astro-static-site` | Statically rendered Astro site |
| `cloudflare-worker-service` | TypeScript service running on Cloudflare Workers |

The questionnaire can explain project kind, framework, build tool, and runtime, but it always resolves to one named recipe that Astilba verifies as a complete project. Arbitrary combinations are not advertised as supported.

## Generated foundations

Every recipe receives:

- exact Node.js, pnpm, dependency, and GitHub Action pins;
- a recipe-owned `pnpm-lock.yaml` that makes first-run CI reproducible even when dependency installation was skipped;
- strict TypeScript, Ultracite with Oxfmt and Oxlint, Vitest, and Knip;
- a frozen-lockfile CI matrix across supported Node.js majors;
- Actionlint, Zizmor, OSV-Scanner, PR-title validation, CodeQL, and dependency review;
- Renovate with a three-day release-age gate and conservative automerge rules;
- issue forms, security and contribution guidance, and concise agent instructions; and
- a deterministic `.astilba/project.json` manifest.

The manifest records the generator and recipe versions together with exact ownership information:

- **managed** configuration has a SHA-256 content digest;
- **metadata** identifies the manifest itself without a recursive self-hash;
- **seeded** application code becomes user-owned immediately;
- **structured** files identify individually owned fields; and
- generated symbolic links record their targets.

This provides a safe basis for future authored migrations without granting the generator permission to overwrite application code.

## Development

```sh
pnpm install
pnpm verify
pnpm test:consumers
pnpm test:package
```

From this checkout, run the development CLI with:

```sh
pnpm create
```

`pnpm test:consumers` generates, installs with each recipe's frozen lockfile, verifies, and builds every recipe as an independent project. `pnpm test:package` repeats that test through the actual npm tarball.

When a dependency or generated foundation changes, increment each affected recipe version and then run `pnpm recipes:update`. The command regenerates every canonical lockfile and records the new output fingerprint while preserving every published version. It refuses to rewrite an existing version's contract.

## Portability

Generated projects keep `AGENTS.md` canonical with a `CLAUDE.md` symbolic link. On Windows, symbolic-link creation requires Developer Mode or an elevated shell. Astilba Create fails atomically when the platform cannot create the link, so it never leaves a partial project.

Generation prepares the complete project in a sibling staging directory before publication. The final publication step refuses existing destinations and uses a visible incomplete marker while moving the staged top-level entries. A rare filesystem failure is rolled back when possible; if rollback itself fails, the marker remains so incomplete output cannot be mistaken for a successful project.

## Deliberate boundaries

Astilba Create initially offers a small catalogue of golden recipes. Panda CSS, Sentry, browser testing, deployment automation, authentication, databases, and other capabilities will be added only after their complete development, CI, deployment, and verification contracts have been proven in real Astilba projects.

Future `doctor` and update tooling will apply explicit, fail-closed migrations. It will not regenerate over existing repositories or mutate default branches silently.
