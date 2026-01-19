#!/usr/bin/env bun

import { autoUpdate } from "./src/auto-update";

await autoUpdate();

import { setup } from "./src/commands/setup";
import { feature } from "./src/commands/feature";
import { oneshot } from "./src/commands/oneshot";
import { backlog } from "./src/commands/backlog";
import { watchMode } from "./src/commands/watch";
import { status } from "./src/commands/status";
import { list } from "./src/commands/list";
import { cancel } from "./src/commands/cancel";
import { prompt } from "./src/commands/prompt";
import { deleteFeature } from "./src/commands/delete";
import { queue } from "./src/commands/queue";
import { testQueue } from "./src/commands/test-queue";
import { help } from "./src/commands/help";
import { completions } from "./src/completions";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    await setup(args);
    break;
  case "feature":
    await feature(args);
    break;
  case "oneshot":
    await oneshot(args);
    break;
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
  case "watch":
    await watchMode(args);
    break;
  case "prompt":
    await prompt(args);
    break;
  case "delete":
    await deleteFeature(args);
    break;
  case "queue":
    await queue();
    break;
  case "test-queue":
    await testQueue(args);
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
