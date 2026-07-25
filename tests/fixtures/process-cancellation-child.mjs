import { writeFileSync } from "node:fs";

const [marker] = process.argv.slice(2);

if (marker === undefined) {
  throw new Error("A marker path is required.");
}

setTimeout(() => writeFileSync(marker, "completed"), 1500);
