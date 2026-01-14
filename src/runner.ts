import { StreamFormatter } from "./formatter";
import { c } from "./colors";
import {
  notify,
  readState,
  writeState,
  hasOpenTasks,
  type TaskFile,
} from "../lib";
import type { Executor } from "./executor";
import { LocalExecutor } from "./executors/local";

export interface RunnerConfig {
  prompt: string;
  featureName?: string;
  tasksFilePath: string;
  label: string;
  executor?: Executor;
}

export interface IterationResult {
  code: number;
  isComplete: boolean;
  isStuck: boolean;
}

export async function runSingleIteration(config: RunnerConfig): Promise<IterationResult> {
  const { prompt, featureName, label } = config;

  console.log(`🔄 Ralph ${label} (single iteration)\n`);

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

  const executor = config.executor ?? new LocalExecutor();
  await executor.initialize();

  const cleanup = async () => {
    await executor.cleanup();
    process.exit(130);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    for (let i = current + 1; i <= max; i++) {
      console.log(`${c.dim}════════════════════════════════════════${c.reset}`);
      console.log(`${c.bold}Iteration ${i}${c.reset}`);
      console.log(`${c.dim}════════════════════════════════════════${c.reset}\n`);

      const formatter = new StreamFormatter();

      const result = await executor.execute(
        prompt,
        (chunk) => {
          const { output } = formatter.parse(chunk);
          if (output) process.stdout.write(output);
        },
        (chunk) => {
          process.stderr.write(chunk);
        }
      );

      const remaining = formatter.flush();
      if (remaining) process.stdout.write(remaining);

      const assistantText = formatter.getAssistantText();
      await writeState({ ...state, iteration: i, status: "running", feature: featureName });

      if (result.exitCode !== 0) {
        console.error(`\n❌ Claude exited with code ${result.exitCode}`);
        await writeState({ ...state, iteration: i, status: "error", feature: featureName });
        await notify("Ralph Error", `Claude exited with code ${result.exitCode} after ${i} iterations`, "high");
        await executor.cleanup();
        process.exit(result.exitCode);
      }

      const taskFileContent = await executor.readFile(tasksFilePath);
      let taskFile: TaskFile | null = null;
      if (taskFileContent) {
        try {
          taskFile = JSON.parse(taskFileContent) as TaskFile;
        } catch {
          taskFile = null;
        }
      }
      if (taskFile && !hasOpenTasks(taskFile)) {
        console.log("\n✅ All tasks complete!");
        await writeState({ ...state, iteration: i, status: "completed", feature: featureName });
        await notify("Ralph Complete", `${label} complete after ${i} iterations`);
        await executor.cleanup();
        process.exit(0);
      }

      if (assistantText.includes("<promise>STUCK</promise>")) {
        console.log("\n🛑 Claude is stuck");
        await writeState({ ...state, iteration: i, status: "stuck", feature: featureName });
        await notify("Ralph Stuck", `Exhausted options after ${i} iterations`, "high");
        await executor.cleanup();
        process.exit(2);
      }

      console.log(`\n✓ Iteration ${i} complete\n`);
    }

    console.log(`\n⚠️  Max iterations (${max}) reached`);
    await writeState({ ...state, iteration: max, status: "max_iterations_reached", feature: featureName });
    await notify("Ralph Max Iterations", `Reached ${max} iterations`);
    await executor.cleanup();
    process.exit(1);
  } finally {
    process.off("SIGINT", cleanup);
    process.off("SIGTERM", cleanup);
    await executor.cleanup();
  }
}
