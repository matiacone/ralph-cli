import { checkRepoRoot, checkCleanWorkingTree, getRunPrompt, readConfig } from "../../lib";
import { runSingleIteration, runLoop } from "../runner";

export async function run(args: string[]) {
  const once = args.includes("--once");
  const debugMode = args.includes("--debug");
  const force = args.includes("--force");

  checkRepoRoot();
  if (!force) await checkCleanWorkingTree();

  const prompt = await getRunPrompt();

  if (once) {
    await runSingleIteration({ prompt, label: "Run" });
    return;
  }

  const config = await readConfig();
  await runLoop({
    prompt,
    label: "Run",
    debug: debugMode,
    model: config.models?.feature,
    modelConfig: config.models,
  });
}
