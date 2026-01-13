import { $ } from "bun";
import { checkRepoRoot, writeState, writeConfig } from "../../lib";

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

  await $`mkdir -p .ralph/features`.quiet();

  const configFile = Bun.file(".ralph/config.json");
  if (!(await configFile.exists())) {
    await writeConfig({ vcs: "git" });
    console.log("📝 Created .ralph/config.json (vcs: git)");
  }

  const backlogFile = Bun.file(".ralph/backlog.json");
  if (!(await backlogFile.exists())) {
    await Bun.write(
      backlogFile,
      JSON.stringify(
        {
          tasks: [
            {
              title: "Example task - replace with your own",
              description: "Why we need this and enough context to start.",
              acceptance: ["Specific, testable criteria"],
              branch: "feature/example",
              passes: false,
            },
          ],
        },
        null,
        2
      )
    );
    console.log("📝 Created .ralph/backlog.json");
    console.log("⚠️  Edit it to add your tasks before running Ralph\n");
  }

  const backlog = await Bun.file(".ralph/backlog.json").json();
  const total = backlog.tasks?.length ?? 0;
  const incomplete = backlog.tasks?.filter((t: { passes: boolean }) => !t.passes).length ?? 0;

  console.log(`✓ Backlog: ${total} tasks, ${incomplete} incomplete`);

  const progressFile = Bun.file(".ralph/progress.txt");
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  await writeState({
    iteration: 0,
    maxIterations,
    status: "initialized",
    startedAt: new Date().toISOString(),
  });

  console.log(`✓ State initialized (max ${maxIterations} iterations)\n`);
  console.log("✅ Ralph is ready!");
  console.log("\nNext steps:");
  console.log("  ralph backlog --once  - Test single backlog iteration");
  console.log("  ralph backlog         - Run backlog loop");
  console.log("  ralph feature <name>  - Run a feature plan");
}
