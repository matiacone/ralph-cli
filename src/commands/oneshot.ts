import {
  checkRepoRoot,
  getFeatureDir,
  listFeatures,
  getMostRecentFeature,
  getOneshotPrompt,
} from "../../lib";
import { c } from "../colors";
import { runSingleIteration } from "../runner";

export async function oneshot(args: string[]) {
  const first = args.includes("--first");
  const debugMode = args.includes("--debug");

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
      console.error("Usage: ralph oneshot <name>");
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error("Usage: ralph oneshot <name>");
      console.error("\nNo features found. Create one with: /create-ralph-plan <name>");
    }
    process.exit(1);
  }

  checkRepoRoot();

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

  const prompt = await getOneshotPrompt(name);
  await runSingleIteration({
    prompt,
    featureName: name,
    tasksFilePath: `${dir}/tasks.json`,
    label: `Oneshot: ${name}`,
  });
}
