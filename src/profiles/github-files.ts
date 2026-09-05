import type { TextFileDeclaration } from "../generator/types.js";
import { file, seededFile } from "./shared.js";
import { toolchainVersions } from "./toolchain-versions.js";

const CHECKOUT_ACTION =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";
const PNPM_ACTION =
  "pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9";
const SETUP_NODE_ACTION =
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0";

export const githubFiles: readonly TextFileDeclaration[] = [
  file(
    ".github/ISSUE_TEMPLATE/bug.yml",
    `
name: Bug report
description: Report reproducible incorrect behaviour
title: "bug: "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: Thanks for taking the time to report a problem.
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: Describe the behaviour, what you expected, and why it matters.
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Minimal reproduction
      description: Include the smallest repository, test, or steps that reproduce the problem.
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version or revision
      description: Provide the package version or commit SHA you tested.
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: Include relevant Node.js, package-manager, operating-system, framework, and runtime versions.
    validations:
      required: true
`
  ),
  file(
    ".github/ISSUE_TEMPLATE/config.yml",
    `
blank_issues_enabled: false
contact_links:
  - name: Report a security vulnerability
    url: https://github.com/{{foundation:githubOwner}}/{{foundation:githubRepo}}/security/advisories/new
    about: Report security issues privately rather than opening a public issue.
`
  ),
  file(
    ".github/ISSUE_TEMPLATE/feature.yml",
    `
name: Feature request
description: Propose a focused improvement
title: "feat: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem or limitation should this solve?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed direction
      description: Describe the desired behaviour and any alternatives you considered.
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Add examples, prior art, or constraints that would help evaluate the proposal.
`
  ),
  file(
    ".github/PULL_REQUEST_TEMPLATE.md",
    `
## What changed

<!-- Describe the change and the problem it solves. -->

## Verification

<!-- List focused checks beyond the required \`pnpm verify\` gate, if any. -->

## Related issue

<!-- Link an issue or write "None". -->
`
  ),
  file(
    ".github/workflows/actionlint.yml",
    `
name: Actionlint

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: actionlint-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  actionlint:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Lint workflows
        uses: docker://docker.io/rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
        with:
          args: -color
`
  ),
  file(
    ".github/workflows/codeql.yml",
    `
name: CodeQL

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: "43 5 * * 3"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: codeql-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    if: github.event.repository.visibility == 'public'
    name: CodeQL (\${{ matrix.language }})
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [actions, javascript-typescript]
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Initialize CodeQL
        uses: github/codeql-action/init@99df26d4f13ea111d4ec1a7dddef6063f76b97e9 # v4.37.0
        with:
          build-mode: none
          languages: \${{ matrix.language }}

      - name: Analyze
        uses: github/codeql-action/analyze@99df26d4f13ea111d4ec1a7dddef6063f76b97e9 # v4.37.0
        with:
          category: /language:\${{ matrix.language }}
`
  ),
  file(
    ".github/workflows/dependency-review.yml",
    `
name: Dependency review

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  dependency-review:
    if: github.event.repository.visibility == 'public'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Review dependency changes
        uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
        with:
          comment-summary-in-pr: always
          fail-on-severity: high
`
  ),
  file(
    ".github/workflows/osv-scanner.yml",
    `
name: OSV-Scanner

on:
  pull_request:
  schedule:
    - cron: "14 5 * * 1"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: osv-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  osv-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Scan repository lockfiles
        uses: docker://ghcr.io/google/osv-scanner:v2.4.0@sha256:5116601dedc01c1c580eb92371883ec052fc4c13c3fbc109d621a63ac416d475
        with:
          args: scan source --recursive .
`
  ),
  file(
    ".github/workflows/pr-title.yml",
    `
name: PR title

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

permissions:
  pull-requests: read

jobs:
  validate:
    name: PR title
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Validate Conventional Commit title
        uses: amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50 # v6.1.1
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
  ),
  file(
    ".github/workflows/verification.yml",
    `
name: Verification

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: verification-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Verify (Node \${{ matrix.node.label }})
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        node:
          - label: minimum
            version: "${toolchainVersions.nodeMinimum}"
          - label: current
            version: "${toolchainVersions.node}"
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Install pnpm
        uses: ${PNPM_ACTION}

      - name: Set up Node.js
        uses: ${SETUP_NODE_ACTION}
        with:
          cache: pnpm
          node-version: \${{ matrix.node.version }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify
        run: pnpm verify
`
  ),
  file(
    ".github/workflows/zizmor.yml",
    `
name: Zizmor

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: zizmor-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  zizmor:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check out repository
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false

      - name: Audit workflows
        uses: zizmorcore/zizmor-action@6fc4b006235f201fdab3722e17240ab420d580e5 # v0.6.1
        with:
          advanced-security: false
          min-severity: medium
          online-audits: false
          token: offline
          version: "1.30.0"
`
  ),
  seededFile(
    "CONTRIBUTING.md",
    `
# Contributing

Thanks for considering a contribution to {{foundation:projectName}}.

Open an issue before investing in a substantial change. Keep pull requests focused and use a [Conventional Commit](https://www.conventionalcommits.org/) title.

## Local setup

\`\`\`sh
pnpm install
pnpm verify
\`\`\`

The repository pins Node.js and pnpm versions. Run \`pnpm install\` again after dependency changes and commit the resulting \`pnpm-lock.yaml\`.

## Pull requests

- Add or update tests for observable behaviour.
- Keep generated files and lockfiles in sync with their sources.
- Run \`pnpm verify\` before opening the pull request.
- Explain any security, compatibility, or migration impact in the description.
`
  ),
  file(
    "SECURITY.md",
    `
# Security policy

## Supported version

Security fixes apply to the current \`main\` branch. This project does not promise support for unreleased branches unless its release policy says otherwise.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/{{foundation:githubOwner}}/{{foundation:githubRepo}}/security/advisories/new). Include the affected version or revision, impact, and a minimal reproduction when possible.

Do not disclose a suspected vulnerability in a public issue before it has been reviewed.
`
  ),
  file(
    "docs/repository-settings.md",
    `
# Repository settings

The generated files provide repository-side policy, but GitHub settings still need an administrator to enable them after the first push.

Recommended baseline:

1. Keep the repository as an ordinary repository rather than a GitHub template.
2. Allow squash merging only, enable auto-merge, and delete head branches after merge.
3. Protect \`main\` with pull-request-only changes, required conversation resolution, and the checks that have completed successfully at least once.
4. Enable private vulnerability reporting, Dependabot alerts, and automated security fixes.
5. Install and enable Renovate for \`{{foundation:githubOwner}}/{{foundation:githubRepo}}\`; the checked-in configuration does nothing until the GitHub App can access the repository.
6. Keep the default workflow token read-only unless an individual workflow declares a narrower write permission.

CodeQL and dependency review run only when the repository is public, avoiding an accidental GitHub Advanced Security dependency for private repositories.
`
  ),
  file(
    "renovate.json",
    `
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":dependencyDashboard",
    ":semanticCommits",
    ":pinDevDependencies",
    "group:monorepos",
    "schedule:weekly"
  ],
  "timezone": "Europe/London",
  "rangeStrategy": "pin",
  "minimumReleaseAge": "3 days",
  "platformAutomerge": false,
  "prConcurrentLimit": 5,
  "prHourlyLimit": 2,
  "lockFileMaintenance": {
    "enabled": true,
    "schedule": ["before 5am on monday"],
    "automerge": true
  },
  "customManagers": [
    {
      "customType": "regex",
      "description": "Keep the current Node.js CI pin current.",
      "managerFilePatterns": ["/^\\\\.github\\\\/workflows\\\\/verification\\\\.yml$/"],
      "matchStrings": [
        "- label:\\\\s*current\\\\s+version:\\\\s*\\"(?<currentValue>\\\\d+\\\\.\\\\d+\\\\.\\\\d+)\\""
      ],
      "depNameTemplate": "node",
      "datasourceTemplate": "node-version"
    },
    {
      "customType": "regex",
      "description": "Keep the Zizmor CLI pin current.",
      "managerFilePatterns": ["/^\\\\.github\\\\/workflows\\\\/zizmor\\\\.yml$/"],
      "matchStrings": ["version: \\"(?<currentValue>\\\\d+\\\\.\\\\d+\\\\.\\\\d+)\\""],
      "depNameTemplate": "zizmorcore/zizmor",
      "datasourceTemplate": "github-releases",
      "extractVersionTemplate": "^v?(?<version>.*)$",
      "versioningTemplate": "semver"
    }
  ],
  "packageRules": [
    {
      "description": "Manage the Node and pnpm engine floors by hand.",
      "matchDepTypes": ["engines"],
      "enabled": false
    },
    {
      "description": "Auto-merge mature non-major development tools after verification.",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true
    },
    {
      "description": "Require maintainer review for zero-major packages.",
      "matchManagers": ["npm"],
      "matchCurrentVersion": "/^0\\\\./",
      "automerge": false
    },
    {
      "description": "Never auto-merge major updates.",
      "matchUpdateTypes": ["major"],
      "automerge": false
    },
    {
      "description": "Require maintainer review for GitHub Actions updates.",
      "matchManagers": ["github-actions"],
      "automerge": false
    }
  ]
}
`
  ),
];
