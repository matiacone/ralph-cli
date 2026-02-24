import { $ } from "bun";
import { checkRepoRoot, writeState, writeConfig, DEFAULT_RUN_PROMPT } from "../../lib";

export async function setup(args: string[]) {
  let maxIterations = 50;

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    }
  }

  checkRepoRoot();
  console.log("🔧 Ralph Setup\n");

  await $`mkdir -p .ralph/prompts`.quiet();

  const runPromptFile = Bun.file(".ralph/prompts/run.md");
  if (!(await runPromptFile.exists())) {
    await Bun.write(runPromptFile, DEFAULT_RUN_PROMPT);
    console.log("📝 Created .ralph/prompts/run.md");
  }

  const configFile = Bun.file(".ralph/config.json");
  if (!(await configFile.exists())) {
    await writeConfig({
      models: {
        feature: "opus",
      },
    });
    console.log("📝 Created .ralph/config.json");
  }

  const stateFile = Bun.file(".ralph/state.json");
  if (!(await stateFile.exists())) {
    await writeState({
      iteration: 0,
      maxIterations,
      status: "initialized",
      startedAt: new Date().toISOString(),
    });
    console.log(`✓ State initialized (max ${maxIterations} iterations)`);
  }

  // Add runtime files to .gitignore
  const gitignorePath = ".gitignore";
  const gitignoreFile = Bun.file(gitignorePath);
  const entriesToAdd = [".ralph/state.json", ".ralph/logs/"];

  let gitignoreContent = (await gitignoreFile.exists()) ? await gitignoreFile.text() : "";
  const lines = gitignoreContent.split("\n");
  const missingEntries = entriesToAdd.filter((entry) => !lines.some((line) => line.trim() === entry));

  if (missingEntries.length > 0) {
    const newContent = gitignoreContent.trimEnd() + "\n" + missingEntries.join("\n") + "\n";
    await Bun.write(gitignorePath, newContent);
    console.log(`✓ Added to .gitignore: ${missingEntries.join(", ")}`);
  }

  console.log("");
  console.log("✅ Ralph is ready!");
  console.log("\nNext steps:");
  console.log("  ralph run --once  - Test single iteration");
  console.log("  ralph run         - Run autonomous loop");
}
