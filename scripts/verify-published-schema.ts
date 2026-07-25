import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const arguments_ = process.argv.slice(2);
const [publishedSchemaPath] = arguments_;

if (publishedSchemaPath === undefined) {
  throw new Error(
    "Usage: tsx scripts/verify-published-schema.ts <published-schema-path>"
  );
}

const [canonicalSource, publishedSource] = await Promise.all([
  readFile(path.join(root, "schemas/create-project-v1.json"), "utf-8"),
  readFile(path.resolve(publishedSchemaPath), "utf-8"),
]);

const canonical: unknown = JSON.parse(canonicalSource);
const published: unknown = JSON.parse(publishedSource);

assert.deepStrictEqual(
  published,
  canonical,
  "The published manifest schema does not match the package schema."
);
