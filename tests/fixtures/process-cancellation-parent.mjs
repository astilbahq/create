import { spawn } from "node:child_process";

const [child, marker] = process.argv.slice(2);

if (child === undefined || marker === undefined) {
  throw new Error("Child and marker paths are required.");
}

spawn(process.execPath, [child, marker], { stdio: "ignore" });
setInterval(() => process.uptime(), 1000);
