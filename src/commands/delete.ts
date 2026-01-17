import { checkRepoRoot, getFeatureDir, listFeatures } from "../../lib";
import { c } from "../colors";
import { rm } from "fs/promises";

export async function deleteFeature(args: string[]) {
  const force = args.includes("--force") || args.includes("-f");
  const name = args.find((a) => !a.startsWith("-"));

  if (!name) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error("Usage: ralph delete <name> [--force]");
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error("Usage: ralph delete <name>");
      console.error("\nNo features found.");
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
    }
    process.exit(1);
  }

  if (!force) {
    process.stdout.write(`Delete feature '${name}'? [y/N] `);
    for await (const line of console) {
      const answer = line.trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        console.log("Cancelled.");
        process.exit(0);
      }
      break;
    }
  }

  await rm(dir, { recursive: true });
  console.log(`${c.green}Deleted feature:${c.reset} ${name}`);
}
