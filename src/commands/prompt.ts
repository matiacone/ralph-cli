import {
  checkRepoRoot,
  listFeatures,
  getMostRecentFeature,
  getFeatureDir,
  getGenericPrompt,
  readConfig,
} from "../../lib";
import { c } from "../colors";

export async function prompt(args: string[]) {
  checkRepoRoot();

  const first = args.includes("--first");
  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));

  const promptName = nonFlagArgs[0];
  let featureName = nonFlagArgs[1];

  if (!promptName) {
    console.error("Usage: ralph prompt <prompt-name> <feature>");
    console.error("       ralph prompt <prompt-name> --first");
    console.error("\nExamples:");
    console.error("  ralph prompt report my-feature");
    console.error("  ralph prompt review my-feature");
    console.error("  ralph prompt report --first");
    process.exit(1);
  }

  if (first) {
    const recentFeature = await getMostRecentFeature();
    if (!recentFeature) {
      console.error("No features found. Create one with: /create-ralph-plan <name>");
      process.exit(1);
    }
    featureName = recentFeature;
    console.log(`${c.cyan}Using most recent feature:${c.reset} ${featureName}`);
  }

  if (!featureName) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error(`Usage: ralph prompt ${promptName} <feature>`);
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error(`Usage: ralph prompt ${promptName} <feature>`);
      console.error("\nNo features found. Create one with: /create-ralph-plan <name>");
    }
    process.exit(1);
  }

  const dir = getFeatureDir(featureName);
  const tasksFile = Bun.file(`${dir}/tasks.json`);

  if (!(await tasksFile.exists())) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error(`Feature '${featureName}' not found.`);
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error(`Feature '${featureName}' not found.`);
      console.error(`\nCreate it with: /create-ralph-plan ${featureName}`);
    }
    process.exit(1);
  }

  let promptContent: string;
  try {
    promptContent = await getGenericPrompt(promptName, featureName);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      console.error(`Prompt '${promptName}' not found.`);
      console.error(`\nCreate it at: .ralph/prompts/${promptName}.md`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`${c.cyan}Running ${promptName} for: ${featureName}${c.reset}\n`);

  const config = await readConfig();
  const model = config.models?.[promptName];

  const cmdArgs = ["claude"];
  if (model) {
    cmdArgs.push("--model", model);
  }
  cmdArgs.push(promptContent);

  const proc = Bun.spawn(cmdArgs, {
    stdio: ["inherit", "inherit", "inherit"],
  });

  await proc.exited;
}
