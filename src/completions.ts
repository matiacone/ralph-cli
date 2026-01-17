import { listOpenFeatures, listFeatures } from "../lib";

export async function completions(args: string[]) {
  const listFeaturesIdx = args.indexOf("--list-features");
  if (listFeaturesIdx !== -1) {
    const type = args[listFeaturesIdx + 1];
    const features = type === "all" ? await listFeatures() : await listOpenFeatures();
    for (const f of features) console.log(f);
    return;
  }

  console.error("Source the completion script directly in your bashrc:");
  console.error("  source ~/creations/ralph/completions.bash");
  process.exit(1);
}
