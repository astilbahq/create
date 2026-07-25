# Release acceptance

Astilba Create's automated tests prove deterministic generation, package contents, safety invariants, and every recipe's own verification. Release acceptance adds a smaller set of public journeys that begin at the same npm and documentation entry points a new user sees.

The acceptance process deliberately does not multiply every recipe by every operating system and option. Recipe output is already verified exhaustively on Linux at both supported Node.js versions. These journeys instead target registry publication, platform behavior, shell handoff, and human comprehension.

## Hard gates

Release acceptance combines the ordinary test suite, the public-package workflow, and the human journeys below. Together they must show that:

- the **public workflow** receives the exact published package's versioned catalog as one JSON object;
- the **public workflow** leaves no destination after a JSON dry run;
- a **human journey** can copy a complete configurator command that never prompts;
- the **public workflow** finds the requested generator and recipe versions in the generated manifest;
- the **public workflow** observes the requested Git and dependency-installation choices;
- the **public workflow** finds `CLAUDE.md` linked to canonical `AGENTS.md`;
- the **public workflow** passes the generated project's own `pnpm verify`; and
- the **ordinary suite** proves that a failure never leaves output that could be mistaken for a complete project.

## Automated public-package matrix

Run the **Published package acceptance** workflow manually with the exact released version after npm publication:

| Platform | Representative recipe | Git | CLI installation |
| --- | --- | --- | --- |
| Linux | Astro static site | Disabled | User completes the frozen install |
| macOS | TypeScript library | Enabled | Create installs dependencies |
| Windows | Cloudflare Worker service | Enabled | User completes the frozen install |

Each lane fetches the exact version from npm, checks the catalog and side-effect-free dry run, follows the public `npm create` path, inspects the manifest and agent-instruction link, and runs the generated project's verification.

The ordinary pull-request suite remains authoritative for the complete recipe matrix, both supported Node.js versions, deterministic output, cancellation, and failure atomicity.

## Human journeys

Automation cannot judge whether the choices, review screen, generated source, or recovery guidance make sense. Before broadening the product or after a material questionnaire change, observe:

1. **Configurator on macOS:** copy and run each recipe once without explaining its internals. Follow the completion guidance and start or use the generated project.
2. **Questionnaire on Linux:** run bare `npm create astilba@latest`, customize an inferred name, use **Change details**, choose not to install, then follow the handoff.
3. **Configurator on Windows PowerShell:** use realistic spaces and apostrophes, enable Git, and observe either successful symlink creation or the documented atomic Developer Mode failure.
4. **Recovery:** retry an existing destination and cancel one questionnaire. Confirm the wording is actionable and the filesystem is unsurprising.

Rotate the Linux and Windows recipes between releases. Do not turn prompt order, prose, or timing into brittle snapshots.

## Observation record

Record only what can lead to a decision:

| Field                                          | Value |
| ---------------------------------------------- | ----- |
| Platform and shell                             |       |
| Recipe and entry point                         |       |
| Expected action in the participant's words     |       |
| First hesitation                               |       |
| Outcome                                        |       |
| Severity (`blocked`, `confusing`, or `polish`) |       |
| Smallest proposed fix                          |       |

Do not include credentials, private repository names, machine paths, or other participant-specific data.
