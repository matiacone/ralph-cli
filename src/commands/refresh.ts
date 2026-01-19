import {
  checkRepoRoot,
  listFeatures,
  getMostRecentFeature,
  getFeatureDir,
  readConfig,
} from "../../lib";
import { c } from "../colors";

export async function refresh(args: string[]) {
  checkRepoRoot();

  const type = args[0];

  if (!type || !["backlog", "feature"].includes(type)) {
    console.error("Usage: ralph refresh <backlog | feature> [feature-name]");
    console.error("\nExamples:");
    console.error("  ralph refresh backlog           - Review backlog tasks");
    console.error("  ralph refresh feature           - Review most recent feature");
    console.error("  ralph refresh feature my-feat   - Review specific feature");
    process.exit(1);
  }

  const promptPath = ".ralph/prompts/refresh.md";
  const promptFile = Bun.file(promptPath);
  if (!(await promptFile.exists())) {
    console.error(`Refresh prompt not found at ${promptPath}`);
    console.error("Run 'ralph setup' to create default prompts.");
    process.exit(1);
  }
  const instructions = await promptFile.text();

  let prompt: string;
  let targetName: string;

  if (type === "backlog") {
    targetName = "backlog";
    const backlogFile = Bun.file(".ralph/backlog.json");
    if (!(await backlogFile.exists())) {
      console.error("No backlog found at .ralph/backlog.json");
      console.error("Run 'ralph setup' first.");
      process.exit(1);
    }
    prompt = `@.ralph/backlog.json\n\n${instructions}`;
  } else {
    let featureName = args[1];

    if (!featureName) {
      const recentFeature = await getMostRecentFeature();
      if (!recentFeature) {
        const features = await listFeatures();
        if (features.length > 0) {
          console.error("No recent feature found.");
          console.error(`\nAvailable features: ${features.join(", ")}`);
        } else {
          console.error("No features found. Create one first.");
        }
        process.exit(1);
      }
      featureName = recentFeature;
      console.log(`${c.cyan}Using most recent feature:${c.reset} ${featureName}`);
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
      }
      process.exit(1);
    }

    targetName = featureName;
    prompt = `@${dir}/plan.md @${dir}/tasks.json\n\n${instructions}`;
  }

  console.log(`${c.cyan}Refreshing ${type}: ${targetName}${c.reset}\n`);

  const config = await readConfig();
  const model = config.models?.refresh;

  const cmdArgs = ["claude"];
  if (model) {
    cmdArgs.push("--model", model);
  }
  cmdArgs.push(prompt);

  const proc = Bun.spawn(cmdArgs, {
    stdio: ["inherit", "inherit", "inherit"],
  });

  await proc.exited;
}
