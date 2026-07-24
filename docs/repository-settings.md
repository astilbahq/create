# Repository settings

The checked-in files provide repository-side policy, but GitHub settings still need an administrator to enable them.

Recommended baseline:

1. Keep this as an ordinary public repository rather than a GitHub template.
2. Allow squash merging only, enable auto-merge, and delete head branches after merge.
3. Protect `main` with pull-request-only changes, required conversation resolution, and the checks that have completed successfully at least once.
4. Enable private vulnerability reporting, Dependabot alerts, and automated security fixes.
5. Install and enable Renovate for `astilbahq/create`; the configuration does nothing until the GitHub App can access the repository.
6. Set the default workflow token to read-only. Individual workflows declare the narrower write permissions they require.
7. Create a protected `npm` environment and configure npm trusted publishing for `astilbahq/create`, `.github/workflows/release.yml`, and that environment. Do not add a long-lived npm token.

CodeQL and dependency review run only while the repository is public, avoiding an accidental GitHub Advanced Security dependency if visibility changes later.
