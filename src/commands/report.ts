import {
  checkRepoRoot,
  listFeatures,
  getFeatureDir,
  getReportPrompt,
} from "../../lib";
import { c } from "../colors";

export async function report(args: string[]) {
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error("Usage: ralph report <name>");
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error("Usage: ralph report <name>");
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
      console.error(`Feature '${name}' not found.`);
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error(`Feature '${name}' not found.`);
      console.error(`\nCreate it with: /create-ralph-plan ${name}`);
    }
    process.exit(1);
  }

  console.log(`${c.cyan}Starting interactive review of: ${name}${c.reset}\n`);

  const prompt = await getReportPrompt(name);

  const proc = Bun.spawn(["claude", prompt], {
    stdio: ["inherit", "inherit", "inherit"],
  });

  await proc.exited;
}
