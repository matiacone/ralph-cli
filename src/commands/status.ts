import { checkRepoRoot, readState, listFeatures } from "../../lib";

export async function status() {
  checkRepoRoot();
  const state = await readState();
  if (!state) {
    console.log("No Ralph state found. Run 'ralph setup' first.");
    return;
  }

  console.log("📊 Ralph Status\n");
  console.log(`Status: ${state.status}`);
  console.log(`Iteration: ${state.iteration} / ${state.maxIterations}`);
  if (state.feature) console.log(`Feature: ${state.feature}`);
  console.log(`Started: ${state.startedAt}`);

  const backlogFile = Bun.file(".ralph/backlog.json");
  if (await backlogFile.exists()) {
    const backlogData = await backlogFile.json();
    const total = backlogData.tasks?.length ?? 0;
    const done = backlogData.tasks?.filter((t: { passes: boolean }) => t.passes).length ?? 0;
    console.log(`\nBacklog: ${done}/${total} tasks complete`);
  }

  const features = await listFeatures();
  if (features.length > 0) {
    console.log(`\nFeatures: ${features.join(", ")}`);
  }
}
