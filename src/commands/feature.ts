import {
  checkRepoRoot,
  readConfig,
  getFeatureDir,
  listFeatures,
  getFeaturePrompt,
  getGitRemoteUrl,
  getCurrentBranch,
} from "../../lib";
import { runSingleIteration, runLoop } from "../runner";
import { createExecutor } from "../executors";

export async function feature(args: string[]) {
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
  const sandbox = args.includes("--sandbox");

  if (sandbox && once) {
    console.error("❌ --sandbox and --once cannot be used together");
    process.exit(1);
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
  const dir = getFeatureDir(name);
  const tasksFile = Bun.file(`${dir}/tasks.json`);

  if (!(await tasksFile.exists())) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error(`❌ Feature '${name}' not found.`);
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error(`❌ Feature '${name}' not found.`);
      console.error(`\nCreate it with: /create-ralph-plan ${name}`);
    }
    process.exit(1);
  }

  const progressFile = Bun.file(`${dir}/progress.txt`);
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  const prompt = getFeaturePrompt(name, config.vcs);
  const runnerConfig = {
    prompt,
    featureName: name,
    tasksFilePath: `${dir}/tasks.json`,
    label: `Feature: ${name}`,
  };

  if (once) {
    await runSingleIteration(runnerConfig);
    return;
  }

  let executor;
  if (sandbox) {
    const repoUrl = await getGitRemoteUrl();
    const branch = await getCurrentBranch();
    executor = await createExecutor({ sandbox: true, repoUrl, branch });
  }

  await runLoop({ ...runnerConfig, executor });
}
