import { $ } from "bun";

export async function autoUpdate() {
  const scriptDir = import.meta.dir.replace(/\/src$/, "");
  try {
    await $`git -C ${scriptDir} fetch --quiet`.quiet();
    // Count commits on remote that we don't have locally (i.e., we're behind)
    const behind = await $`git -C ${scriptDir} rev-list HEAD..origin/master --count`.quiet().text();

    if (parseInt(behind.trim(), 10) > 0) {
      console.log("🔄 Updating Ralph...");
      await $`git -C ${scriptDir} pull --quiet`.quiet();
      console.log("✅ Updated. Restarting...\n");
      const args = process.argv.slice(1);
      Bun.spawn(["bun", ...args], { stdio: ["inherit", "inherit", "inherit"] });
      process.exit(0);
    }
  } catch (err) {
    console.error("⚠️  Auto-update failed:", err instanceof Error ? err.message : err);
  }
}
