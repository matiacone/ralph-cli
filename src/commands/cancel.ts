import { checkRepoRoot, readState, writeState } from "../../lib";

export async function cancel() {
  checkRepoRoot();
  console.log("🛑 Ralph Cancel\n");

  const state = await readState();
  if (!state) {
    console.log("⚠️  No Ralph state found");
    return;
  }

  console.log(`Current: ${state.status}, iteration ${state.iteration}/${state.maxIterations}\n`);

  if (state.status !== "running") {
    console.log("⚠️  Ralph is not running");
    return;
  }

  await writeState({ ...state, status: "cancelled" });
  console.log("✓ Ralph cancelled");
  console.log("\nTo resume: ralph backlog --resume");
}
