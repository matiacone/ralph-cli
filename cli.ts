#!/usr/bin/env bun

import { autoUpdate } from "./src/auto-update";

await autoUpdate();

import { setup } from "./src/commands/setup";
import { run } from "./src/commands/run";
import { help } from "./src/commands/help";
import { completions } from "./src/commands/completions";

async function version() {
  const pkg = await Bun.file(import.meta.dir + "/package.json").json();
  console.log(pkg.version);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    await setup(args);
    break;
  case "run":
    await run(args);
    break;
  case "version":
  case "--version":
  case "-v":
    await version();
    break;
  case "completions":
    await completions(args);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
}
