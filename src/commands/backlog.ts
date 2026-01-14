import {
  checkRepoRoot,
  readConfig,
  readBacklog,
  readState,
  getBacklogPrompt,
  getGitRemoteUrl,
  getCurrentBranch,
} from "../../lib";
import { runSingleIteration, runLoop } from "../runner";
import { createExecutor } from "../executors";

export async function backlog(args: string[]) {
  let maxIterations: number | undefined;
  let resume = false;
  let once = false;
  let sandbox = false;

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--once") {
      once = true;
    } else if (args[i] === "--sandbox") {
      sandbox = true;
    }
  }

  if (sandbox) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("❌ ANTHROPIC_API_KEY environment variable is required for --sandbox mode");
      process.exit(1);
    }
    if (!process.env.GH_TOKEN) {
      console.error("❌ GH_TOKEN environment variable is required for --sandbox mode");
      process.exit(1);
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

  let executor;
  if (sandbox) {
    const repoUrl = await getGitRemoteUrl();
    const branch = await getCurrentBranch();
    executor = await createExecutor({ sandbox: true, repoUrl, branch });
  }

  await runLoop({
    ...runnerConfig,
    maxIterations,
    startIteration,
    executor,
  });
}
