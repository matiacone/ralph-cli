import { StreamFormatter } from "./formatter";
import { c } from "./colors";
import {
  notify,
  readState,
  writeState,
  hasOpenTasks,
  popQueue,
  readQueue,
  readConfig,
  getFeatureDir,
  getFeaturePrompt,
  setQueueDebugger,
  type TaskFile,
} from "../lib";
import type { Executor } from "./executor";
import { LocalExecutor } from "./executors/local";
import { debug, setDebug } from "./debug";

const CODE_SIMPLIFIER_PROMPT = `Use the Task tool to spawn the code-simplifier agent to analyze recently modified code. After it completes, review its recommendations and add any worthwhile improvements to .ralph/backlog.json as new tasks. Mark new tasks with "passes": false.`;

async function runCodeSimplifier(): Promise<void> {
  console.log(`\n${c.cyan}Running code simplifier...${c.reset}\n`);

  const proc = Bun.spawn(["claude", "--permission-mode", "acceptEdits", CODE_SIMPLIFIER_PROMPT], {
    stdio: ["inherit", "inherit", "inherit"],
  });

  await proc.exited;
}

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
  debug?: boolean;
}

async function runNextFromQueue(debugMode: boolean = false): Promise<boolean> {
  debug("runNextFromQueue", "Starting queue check");

  // Log queue state before popping
  const queueBefore = await readQueue();
  debug("runNextFromQueue", "Queue state before pop", { items: queueBefore });

  const next = await popQueue();
  debug("runNextFromQueue", `popQueue returned: ${next ?? "null"}`);

  if (!next) {
    debug("runNextFromQueue", "No items in queue, returning false");
    return false;
  }

  console.log(`\n${c.cyan}Starting next queued feature:${c.reset} ${next}\n`);

  const config = await readConfig();
  const dir = getFeatureDir(next);
  const tasksFilePath = `${dir}/tasks.json`;
  debug("runNextFromQueue", `Feature dir: ${dir}, tasks: ${tasksFilePath}`);

  const tasksFile = Bun.file(tasksFilePath);
  const exists = await tasksFile.exists();
  debug("runNextFromQueue", `Tasks file exists: ${exists}`);

  if (!exists) {
    console.error(`${c.yellow}Queued feature '${next}' not found, skipping${c.reset}`);
    debug("runNextFromQueue", "Feature not found, recursing to next");
    return runNextFromQueue(debugMode);
  }

  const progressFile = Bun.file(`${dir}/progress.txt`);
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  const prompt = getFeaturePrompt(next, config.vcs);
  debug("runNextFromQueue", `Starting runLoop for "${next}"`);

  await runLoop({
    prompt,
    featureName: next,
    tasksFilePath,
    label: `Feature: ${next}`,
    debug: debugMode,
  });

  debug("runNextFromQueue", `runLoop completed for "${next}"`);
  return true;
}

export async function runLoop(config: LoopConfig): Promise<void> {
  const { prompt, featureName, tasksFilePath, label, maxIterations, startIteration } = config;

  // Initialize debug mode
  if (config.debug) {
    setDebug(true);
    setQueueDebugger(debug);
    debug("runLoop", "Debug mode enabled");
  }

  debug("runLoop", `Starting loop for "${featureName}"`, { tasksFilePath, label });
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
      debug("runLoop", `Read tasks file, content length: ${taskFileContent?.length ?? 0}`);

      let taskFile: TaskFile | null = null;
      if (taskFileContent) {
        try {
          taskFile = JSON.parse(taskFileContent) as TaskFile;
          debug("runLoop", "Parsed tasks file", {
            taskCount: taskFile.tasks.length,
            openTasks: taskFile.tasks.filter((t) => !t.passes).length,
          });
        } catch (err) {
          debug("runLoop", `Failed to parse tasks file: ${err}`);
          taskFile = null;
        }
      }

      const allComplete = taskFile && !hasOpenTasks(taskFile);
      debug("runLoop", `All tasks complete: ${allComplete}`);

      if (allComplete) {
        console.log("\n✅ All tasks complete!");
        debug("runLoop", "Writing completed state");
        await writeState({ ...state, iteration: i, status: "completed", feature: featureName });

        debug("runLoop", "Sending notification");
        await notify("Ralph Complete", `${label} complete after ${i} iterations`);

        debug("runLoop", "Running code simplifier");
        await runCodeSimplifier();

        debug("runLoop", "Running executor cleanup");
        await executor.cleanup();

        // Check queue for next feature
        debug("runLoop", "About to check queue for next feature");
        const ranNext = await runNextFromQueue(config.debug);
        debug("runLoop", `runNextFromQueue returned: ${ranNext}`);

        if (ranNext) {
          debug("runLoop", "Next feature started, returning from runLoop");
          return;
        }

        debug("runLoop", "No queued features, exiting with code 0");
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
