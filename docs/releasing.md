# Releasing `create-astilba`

Releases are built and published by GitHub Actions through npm trusted publishing. Never run `npm publish` manually and never add a long-lived npm token.

## Prepare the release

1. Update `package.json` and `CREATE_ASTILBA_VERSION` to the same SemVer value.
2. If generated output changed, increment every affected recipe version, run `pnpm recipes:update`, and commit the resulting lockfiles and contract history.
3. Run `pnpm verify`, `pnpm test:consumers`, and `pnpm test:package`.
4. Merge the release pull request through the protected `main` branch.

## Publish

1. Create a GitHub Release named after an immutable `v<version>` tag targeting the verified merge commit on `main`.
2. Observe the `Release` workflow through both `Verify release package` and `Publish npm package`.
3. Confirm the npm version is public and includes a provenance attestation tied to `astilbahq/create` and `.github/workflows/release.yml`.
4. Download the registry tarball and run the packaged smoke test when a release changes generation, installation, or package contents.

Version `0.1.0` was a bootstrap publication made while npm trusted publishing was being configured. Its registry tarball was verified byte-for-byte against tagged source, but it did not pass through the checked-in release workflow and has no npm provenance attestation. It is the only permitted exception.
