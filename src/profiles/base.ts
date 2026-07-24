import type { Profile } from "../generator/types.js";
import { file } from "./shared.js";

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
    file(".node-version", "24.18.0\n"),
    file(
      ".npmrc",
      `
save-exact=true
`
    ),
    file("LICENSE", MIT_LICENSE),
    file(
      "README.md",
      `
# {{foundation:projectName}}

{{foundation:description}}

## Development

\`\`\`sh
pnpm install
pnpm verify
\`\`\`
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
`
    ),
  ],
  name: "base",
  packageJson: {
    devDependencies: {
      knip: "6.26.0",
      oxfmt: "0.59.0",
      oxlint: "1.74.0",
      typescript: "6.0.3",
      ultracite: "7.9.4",
      vitest: "4.1.10",
    },
    fields: {
      description: "{{foundation:description}}",
      engines: {
        node: ">=22.18.0",
        pnpm: ">=11.10.0",
      },
      license: "MIT",
      name: "{{foundation:packageName}}",
      packageManager: "pnpm@11.10.0",
      type: "module",
      version: "0.0.0",
    },
    scripts: {
      check: "ultracite check",
      fix: "ultracite fix",
    },
  },
};
