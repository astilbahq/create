import { rm } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

await rm(path.join(repositoryRoot, "dist"), {
  force: true,
  recursive: true,
});
