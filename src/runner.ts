import { StreamFormatter } from "./formatter";
import { c } from "./colors";
import {
  notify,
  readState,
  writeState,
  readTasksFile,
  hasOpenTasks,
  appendToLog,
} from "../lib";

export interface RunnerConfig {
  prompt: string;
  featureName?: string;
  tasksFilePath: string;
  label: string;
}

export interface IterationResult {
  code: number;
  isComplete: boolean;
  isStuck: boolean;
}

export async function runSingleIteration(config: RunnerConfig): Promise<IterationResult> {
  const { prompt, featureName, label } = config;

  console.log(`🔄 Ralph ${label} (single iteration)\n`);
  await appendToLog(featureName, `\n${"=".repeat(60)}\nSession Start - Single Iteration\n${"=".repeat(60)}\n`);

  const args = ["claude", "--permission-mode", "acceptEdits", prompt];
  const proc = Bun.spawn(args, {
    stdio: ["inherit", "inherit", "inherit"],
  });

  const code = await proc.exited;

  return { code, isComplete: false, isStuck: false };
}

export interface LoopConfig extends RunnerConfig {
  maxIterations?: number;
  startIteration?: number;
}

export async function runLoop(config: LoopConfig): Promise<void> {
  const { prompt, featureName, tasksFilePath, label, maxIterations, startIteration } = config;

  console.log(`🤖 Ralph ${label} - Autonomous Loop\n`);

  const state = await readState();
  if (!state) {
    console.error("❌ No state found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const max = maxIterations ?? state.maxIterations;
  const current = startIteration ?? 0;

  if (startIteration && startIteration > 0) {
    console.log(`📍 Resuming from iteration ${current}\n`);
  }

  console.log(`Tasks: ${tasksFilePath}`);
  console.log(`Max iterations: ${max}`);
  console.log(`Starting from: ${current + 1}\n`);
  console.log("Press Ctrl+C to cancel\n");

  await writeState({ ...state, status: "running", feature: featureName });

  for (let i = current + 1; i <= max; i++) {
    console.log(`${c.dim}════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}Iteration ${i}${c.reset}`);
    console.log(`${c.dim}════════════════════════════════════════${c.reset}\n`);

    await appendToLog(featureName, `\n${"=".repeat(60)}\nSession Start - Iteration ${i}\n${"=".repeat(60)}\n`);

    const args = ["claude", "--dangerously-skip-permissions", "-p", "--output-format", "stream-json", "--verbose", prompt];

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const formatter = new StreamFormatter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      await appendToLog(featureName, text);

      const { output } = formatter.parse(text);
      if (output) process.stdout.write(output);
    }
    const remaining = formatter.flush();
    if (remaining) process.stdout.write(remaining);

    const code = await proc.exited;
    const assistantText = formatter.getAssistantText();
    await writeState({ ...state, iteration: i, status: "running", feature: featureName });

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      await writeState({ ...state, iteration: i, status: "error", feature: featureName });
      await notify("Ralph Error", `Claude exited with code ${code} after ${i} iterations`, "high");
      process.exit(code);
    }

    const taskFile = await readTasksFile(tasksFilePath);
    if (taskFile && !hasOpenTasks(taskFile)) {
      console.log("\n✅ All tasks complete!");
      await writeState({ ...state, iteration: i, status: "completed", feature: featureName });
      await notify("Ralph Complete", `${label} complete after ${i} iterations`);
      process.exit(0);
    }

    if (assistantText.includes("<promise>STUCK</promise>")) {
      console.log("\n🛑 Claude is stuck");
      await writeState({ ...state, iteration: i, status: "stuck", feature: featureName });
      await notify("Ralph Stuck", `Exhausted options after ${i} iterations`, "high");
      process.exit(2);
    }

    console.log(`\n✓ Iteration ${i} complete\n`);
  }

  console.log(`\n⚠️  Max iterations (${max}) reached`);
  await writeState({ ...state, iteration: max, status: "max_iterations_reached", feature: featureName });
  await notify("Ralph Max Iterations", `Reached ${max} iterations`);
  process.exit(1);
}
