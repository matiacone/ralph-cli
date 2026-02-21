import {
  checkRepoRoot,
  checkCleanWorkingTree,
  getFeatureDir,
  listFeatures,
  getMostRecentFeature,
  getFeaturePrompt,
  isRalphRunning,
  addToQueue,
  readConfig,
} from "../../lib";
import { c } from "../colors";
import { runSingleIteration, runLoop } from "../runner";

export async function feature(args: string[]) {
  const first = args.includes("--first");
  const once = args.includes("--once");
  const debugMode = args.includes("--debug");
  const force = args.includes("--force");
  const hooks = args.includes("--hooks");

  let name = args.find((a) => !a.startsWith("-"));

  if (first) {
    const recentFeature = await getMostRecentFeature();
    if (!recentFeature) {
      console.error("❌ No features found. Create one with: /create-ralph-plan <name>");
      process.exit(1);
    }
    name = recentFeature;
    console.log(`${c.cyan}Using most recent feature:${c.reset} ${name}`);
  }

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

  checkRepoRoot();

  if (!force) {
    await checkCleanWorkingTree();
  }

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

  // Check if Ralph is already running - if so, queue this feature instead
  if (await isRalphRunning()) {
    await addToQueue(name);
    console.log(`${c.cyan}Queued feature:${c.reset} ${name}`);
    console.log(`${c.dim}Will run automatically when current feature completes${c.reset}`);
    process.exit(0);
  }

  const progressFile = Bun.file(`${dir}/progress.txt`);
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  const prompt = await getFeaturePrompt(name);
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

  const config = await readConfig();
  const model = config.models?.feature;

  await runLoop({
    ...runnerConfig,
    debug: debugMode,
    model,
    modelConfig: config.models,
    hooks,
  });
}
