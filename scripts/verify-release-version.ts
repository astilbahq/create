import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf-8")
) as { readonly version?: string };
const releaseTag = process.env.RELEASE_TAG;
const expectedVersion = releaseTag?.replace(/^v/u, "");

if (
  releaseTag === undefined ||
  expectedVersion === undefined ||
  packageJson.version !== expectedVersion
) {
  throw new Error(
    `Package version ${packageJson.version ?? "(missing)"} does not match release tag ${releaseTag ?? "(missing)"}.`
  );
}
