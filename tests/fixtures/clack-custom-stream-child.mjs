import { PassThrough } from "node:stream";

Object.defineProperty(process.stdout, "isTTY", {
  configurable: true,
  value: true,
});

const input = new PassThrough();
const output = new PassThrough();
Object.defineProperty(input, "isTTY", { value: true });
Object.defineProperty(output, "isTTY", { value: true });

let rendered = "";
output.on("data", (chunk) => {
  rendered += chunk.toString("utf-8");
});

const { configureColorEnvironment } = await import("../../src/color.ts");
configureColorEnvironment(process.env);
const { createClackTerminal } = await import("../../src/terminal.ts");
const terminal = createClackTerminal({ input, output });
terminal.intro("Astilba Create");
terminal.outro("Done");
process.stdout.write(rendered);
