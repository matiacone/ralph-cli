import { checkRepoRoot, readConfig, readBacklog, readState, getBacklogPrompt } from "../../lib";
import { runSingleIteration, runLoop } from "../runner";

export async function backlog(args: string[]) {
  let maxIterations: number | undefined;
  let resume = false;
  let once = false;

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--once") {
      once = true;
    }
  }

  checkRepoRoot();

  const config = await readConfig();
  const backlogPrompt = getBacklogPrompt(config.vcs);

  const backlogData = await readBacklog();
  if (!backlogData) {
    console.error("❌ No backlog found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const progressFile = Bun.file(".ralph/progress.txt");
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  const runnerConfig = {
    prompt: backlogPrompt,
    featureName: undefined,
    tasksFilePath: ".ralph/backlog.json",
    label: "Backlog",
  };

  if (once) {
    await runSingleIteration(runnerConfig);
    return;
  }

  const state = await readState();
  const startIteration = resume && state ? state.iteration : 0;

  await runLoop({
    ...runnerConfig,
    maxIterations,
    startIteration,
  });
}
