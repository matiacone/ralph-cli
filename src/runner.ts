import { StreamFormatter } from "./formatter";
import { c } from "./colors";
import {
  notify,
  readState,
  writeState,
  readConfig,
  type ModelAlias,
  type ModelConfig,
} from "../lib";
import type { Executor } from "./executor";
import { LocalExecutor } from "./executors/local";
import { debug, setDebug } from "./debug";

export interface RunnerConfig {
  prompt: string;
  label: string;
  executor?: Executor;
  model?: ModelAlias;
}

export interface IterationResult {
  code: number;
  isComplete: boolean;
  isStuck: boolean;
}

export async function runSingleIteration(config: RunnerConfig): Promise<IterationResult> {
  const { prompt, label } = config;

  console.log(`🔄 Ralph ${label} (single iteration)\n`);

  const args = ["claude", "--permission-mode", "acceptEdits", prompt];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY")
  );
  const proc = Bun.spawn(args, {
    stdio: ["inherit", "inherit", "inherit"],
    env,
  });

  const code = await proc.exited;

  return { code, isComplete: false, isStuck: false };
}

export interface LoopConfig extends RunnerConfig {
  maxIterations?: number;
  startIteration?: number;
  debug?: boolean;
  modelConfig?: ModelConfig;
}

export async function runLoop(config: LoopConfig): Promise<void> {
  const { prompt, label, maxIterations, startIteration } = config;

  if (config.debug) {
    setDebug(true);
    debug("runLoop", "Debug mode enabled");
  }

  debug("runLoop", `Starting loop`, { label });
  console.log(`🤖 Ralph ${label} - Autonomous Loop\n`);

  const state = await readState();
  if (!state) {
    console.error("❌ No state found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const ralphConfig = await readConfig();
  const modelConfig = config.modelConfig ?? ralphConfig.models;
  const iterationModel = config.model;

  const max = maxIterations ?? state.maxIterations;
  const current = startIteration ?? 0;

  if (startIteration && startIteration > 0) {
    console.log(`📍 Resuming from iteration ${current}\n`);
  }

  console.log(`Max iterations: ${max}`);
  if (iterationModel) {
    console.log(`Model: ${iterationModel}`);
  }
  console.log(`Starting from: ${current + 1}\n`);
  console.log("Press Ctrl+C to cancel\n");

  await writeState({ ...state, status: "running" });

  const executor = config.executor ?? new LocalExecutor();
  await executor.initialize();

  const cleanup = async () => {
    console.log(`\n${c.yellow}Cancelling...${c.reset}`);
    await writeState({ ...state, status: "cancelled" });
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
        },
        { model: iterationModel }
      );

      const remaining = formatter.flush();
      if (remaining) process.stdout.write(remaining);

      const assistantText = formatter.getAssistantText();
      await writeState({ ...state, iteration: i, status: "running" });

      if (result.exitCode !== 0) {
        console.error(`\n❌ Claude exited with code ${result.exitCode}`);
        await writeState({ ...state, iteration: i, status: "error" });
        await notify("Ralph Error", `Claude exited with code ${result.exitCode} after ${i} iterations`, "high");
        await executor.cleanup();
        process.exit(result.exitCode);
      }

      if (assistantText.includes("<promise>ALL TASKS COMPLETE</promise>")) {
        console.log("\n✅ All tasks complete!");
        await writeState({ ...state, iteration: i, status: "completed" });
        await notify("Ralph Complete", `${label} complete after ${i} iterations`);
        await executor.cleanup();
        process.exit(0);
      }

      if (assistantText.includes("<promise>I AM STUCK</promise>")) {
        console.log("\n🛑 Claude is stuck");
        await writeState({ ...state, iteration: i, status: "stuck" });
        await notify("Ralph Stuck", `Exhausted options after ${i} iterations`, "high");
        await executor.cleanup();
        process.exit(2);
      }

      console.log(`\n✓ Iteration ${i} complete\n`);
    }

    console.log(`\n⚠️  Max iterations (${max}) reached`);
    await writeState({ ...state, iteration: max, status: "max_iterations_reached" });
    await notify("Ralph Max Iterations", `Reached ${max} iterations`);
    await executor.cleanup();
    process.exit(1);
  } finally {
    process.off("SIGINT", cleanup);
    process.off("SIGTERM", cleanup);
    await executor.cleanup();
  }
}
