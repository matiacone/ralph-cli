import { checkRepoRoot, readQueue } from "../../lib";
import { c } from "../colors";

export async function queue() {
  checkRepoRoot();
  const items = await readQueue();

  if (items.length === 0) {
    console.log(`${c.dim}Queue is empty${c.reset}`);
    return;
  }

  console.log(`${c.cyan}Queued features:${c.reset}`);
  for (let i = 0; i < items.length; i++) {
    console.log(`  ${i + 1}. ${items[i]}`);
  }
}
