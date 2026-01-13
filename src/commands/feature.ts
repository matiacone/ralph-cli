import { checkRepoRoot, readConfig, getFeatureDir, listFeatures, getFeaturePrompt } from "../../lib";
import { runSingleIteration, runLoop } from "../runner";

export async function feature(name: string, once: boolean) {
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

  await runLoop(runnerConfig);
}
