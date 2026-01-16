import { checkRepoRoot, readQueue, popQueue, addToQueue, setQueueDebugger, getFeatureDir } from "../../lib";
import { c } from "../colors";
import { debug, setDebug } from "../debug";

export async function testQueue(args: string[]) {
  checkRepoRoot();

  // Always enable debug for this command
  setDebug(true);
  setQueueDebugger(debug);

  const subcommand = args[0];

  console.log(`${c.cyan}Queue Test Utility${c.reset}\n`);

  if (!subcommand || subcommand === "status") {
    // Show current queue state
    console.log("Current queue state:\n");
    const items = await readQueue();

    if (items.length === 0) {
      console.log(`${c.dim}Queue is empty${c.reset}`);
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const dir = getFeatureDir(item);
        const exists = await Bun.file(`${dir}/tasks.json`).exists();
        const status = exists ? c.green + "✓" + c.reset : c.yellow + "missing" + c.reset;
        console.log(`  ${i + 1}. ${item} ${status}`);
      }
    }
    return;
  }

  if (subcommand === "add") {
    const name = args[1];
    if (!name) {
      console.error("Usage: ralph test-queue add <feature-name>");
      process.exit(1);
    }
    console.log(`Adding "${name}" to queue...\n`);
    await addToQueue(name);
    console.log(`\n${c.green}Added${c.reset}`);
    return;
  }

  if (subcommand === "pop") {
    console.log("Popping from queue...\n");
    const next = await popQueue();
    if (next) {
      console.log(`\n${c.green}Popped:${c.reset} ${next}`);
    } else {
      console.log(`\n${c.yellow}Queue was empty${c.reset}`);
    }
    return;
  }

  if (subcommand === "simulate") {
    // Simulate the completion flow
    console.log("Simulating completion flow...\n");
    console.log("1. Reading queue before pop:");
    const before = await readQueue();
    console.log(`   Items: ${JSON.stringify(before)}\n`);

    console.log("2. Calling popQueue():");
    const next = await popQueue();
    console.log(`   Result: ${next ?? "null"}\n`);

    console.log("3. Reading queue after pop:");
    const after = await readQueue();
    console.log(`   Items: ${JSON.stringify(after)}\n`);

    if (next) {
      const dir = getFeatureDir(next);
      const exists = await Bun.file(`${dir}/tasks.json`).exists();
      console.log(`4. Feature "${next}" tasks.json exists: ${exists}`);
    }
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}`);
  console.error("\nUsage:");
  console.error("  ralph test-queue          - Show queue status");
  console.error("  ralph test-queue add <n>  - Add feature to queue");
  console.error("  ralph test-queue pop      - Pop from queue");
  console.error("  ralph test-queue simulate - Simulate completion flow");
  process.exit(1);
}
