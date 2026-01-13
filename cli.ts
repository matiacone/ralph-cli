#!/usr/bin/env bun

import { autoUpdate } from "./src/auto-update";

await autoUpdate();

import { listFeatures } from "./lib";
import { setup } from "./src/commands/setup";
import { feature } from "./src/commands/feature";
import { backlog } from "./src/commands/backlog";
import { watchMode } from "./src/commands/watch";
import { status } from "./src/commands/status";
import { list } from "./src/commands/list";
import { cancel } from "./src/commands/cancel";
import { help } from "./src/commands/help";
import { completions } from "./src/completions";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    await setup(args);
    break;
  case "feature": {
    const name = args.find((a) => !a.startsWith("-"));
    if (!name) {
      const features = await listFeatures();
      if (features.length > 0) {
        console.error("Usage: ralph feature <name>");
        console.error(`\nAvailable features: ${features.join(", ")}`);
      } else {
        console.error("Usage: ralph feature <name>");
        console.error("\nNo features found. Create one with: /create-ralph-plan <name>");
      }
      process.exit(1);
    }
    const once = args.includes("--once");
    await feature(name, once);
    break;
  }
  case "backlog":
    await backlog(args);
    break;
  case "cancel":
    await cancel();
    break;
  case "status":
    await status();
    break;
  case "list":
    await list();
    break;
  case "watch": {
    const stream = args.includes("--stream");
    await watchMode(stream);
    break;
  }
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
