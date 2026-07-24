import type { Profile } from "../generator/types.js";
import { dependencyVersions } from "./dependency-versions.js";
import { githubFiles } from "./github-files.js";
import { file, link, seededFile } from "./shared.js";
import { toolchainVersions } from "./toolchain-versions.js";

const MIT_LICENSE = `
MIT License

Copyright (c) {{foundation:githubOwner}}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export const baseProfile: Profile = {
  files: [
    ...githubFiles,
    file(
      ".editorconfig",
      `
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`
    ),
    file(
      ".gitattributes",
      `
* text=auto eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
`
    ),
    file(
      ".gitignore",
      `
.DS_Store
.env
.env.*
!.env.example
.pnpm-store/
coverage/
dist/
node_modules/
worker-configuration.d.ts
`
    ),
    file(".node-version", `${toolchainVersions.node}\n`),
    file(
      ".npmrc",
      `
save-exact=true
`
    ),
    file(
      "AGENTS.md",
      `
# {{foundation:projectName}}

{{foundation:description}}

## Ground rules

1. Run \`pnpm verify\` before proposing a commit.
2. Add or update tests for observable behaviour.
3. Keep dependencies and GitHub Actions exactly pinned. Update the lockfile with dependency changes.
4. Do not weaken type, lint, test, packaging, or security gates to make a change pass.
5. Never commit credentials, local environment files, deployment identifiers, or private URLs.
6. Keep changes focused and preserve unrelated work in a dirty worktree.
7. Prefer deterministic behaviour and explicit inputs over ambient time, randomness, or machine state.
`
    ),
    seededFile("LICENSE", MIT_LICENSE),
    seededFile(
      "README.md",
      `
# {{foundation:projectName}}

{{foundation:description}}

## Development

\`\`\`sh
pnpm install
pnpm verify
\`\`\`

Agent instructions are canonical in \`AGENTS.md\`; \`CLAUDE.md\` is a symbolic link. Checkouts require symbolic-link support. On Windows, enable Developer Mode or use an elevated shell and configure Git to preserve symbolic links before cloning.

After the first push, complete the [repository-settings checklist](docs/repository-settings.md).
`
    ),
    file(
      "oxfmt.config.ts",
      `
import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), "dist/**"],
});
`
    ),
    file(
      "oxlint.config.ts",
      `
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [...(core.ignorePatterns ?? []), "dist/**"],
});
`
    ),
    file(
      "pnpm-workspace.yaml",
      `
packages: []

allowBuilds:
  esbuild: true
  sharp: true
  workerd: true

minimumReleaseAge: 4320

# Exact security exception for GHSA-mh99-v99m-4gvg.
minimumReleaseAgeExclude:
  - brace-expansion@5.0.8

overrides:
  "brace-expansion@>=5.0.0 <5.0.8": 5.0.8
`
    ),
  ],
  name: "base",
  packageJson: {
    devDependencies: {
      knip: dependencyVersions.knip,
      oxfmt: dependencyVersions.oxfmt,
      oxlint: dependencyVersions.oxlint,
      typescript: dependencyVersions.typescript,
      ultracite: dependencyVersions.ultracite,
      vitest: dependencyVersions.vitest,
    },
    fields: {
      description: "{{foundation:description}}",
      engines: {
        node: toolchainVersions.nodeEngine,
        pnpm: `>=${toolchainVersions.pnpm}`,
      },
      license: "MIT",
      name: "{{foundation:packageName}}",
      packageManager: `pnpm@${toolchainVersions.pnpm}`,
      type: "module",
      version: "0.0.0",
    },
    scripts: {
      check: "ultracite check",
      fix: "ultracite fix",
    },
  },
  symlinks: [link("CLAUDE.md", "AGENTS.md")],
};
