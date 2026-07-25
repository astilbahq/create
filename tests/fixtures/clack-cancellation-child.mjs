import { PassThrough } from "node:stream";
import { setImmediate as waitForImmediate } from "node:timers/promises";

class TtyPassThrough extends PassThrough {
  columns = 80;
  isTTY = true;

  setRawMode() {
    return this;
  }
}

const input = new TtyPassThrough();
const output = new TtyPassThrough();

let rendered = "";
output.on("data", (chunk) => {
  rendered += chunk.toString("utf-8");
});

const { configureColorEnvironment } = await import("../../src/color.ts");
configureColorEnvironment(process.env);
const { runCli } = await import("../../src/cli.ts");
const { writeHumanFailure } = await import("../../src/failure-output.ts");
const { createClackTerminal } = await import("../../src/terminal.ts");
const terminal = createClackTerminal({ input, output });
const result = runCli([], {
  input,
  interactive: true,
  output,
  terminal,
});

await waitForImmediate();
input.write("\u0003");

try {
  await result;
} catch (error) {
  writeHumanFailure(error, output);
}

process.stdout.write(rendered);
