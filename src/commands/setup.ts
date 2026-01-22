import { $ } from "bun";
import { checkRepoRoot, writeState, writeConfig } from "../../lib";

const DEFAULT_BACKLOG_PROMPT = `1. Find the highest-priority task to work on and work only on that task.
   This should be the one YOU decide has the highest priority - not necessarily the first in the array.
2. Check that the code is linted via bun run lint:fix, types check via bun run check-types, and tests pass via bun run test.
3. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the /chrome slash command to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

4. Update the backlog.json with the work that was done (set passes: true when complete).
   Include in your progress entry WHAT verification you performed (e.g., "Verified: /chrome screenshot" or "Verified: unit test added" or "Verified: ran test:myFunction").
5. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Branch: <branch> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
6. Make a git commit and submit PR:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the task's branch:
     * Use 'git checkout -b <branch-name> && git add -A && git commit -m "<message>"' to create a new branch
     * Then use 'git push -u origin HEAD && gh pr create --fill' to push and create a PR
   - If you are already on the task's branch:
     * Use 'git add -A && git commit -m "<message>"' to add a new commit
     * Then use 'git push' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>I AM STUCK</promise> with a brief summary of what you tried and what is blocking progress.`;

const DEFAULT_FEATURE_PROMPT = `1. FIRST: Read the Branch field at the top of plan.md. You MUST use this branch for all commits.
2. Review plan.md for context, then find the highest-priority incomplete task in tasks.json.
   This should be the one YOU decide has the highest priority - not necessarily the first in the array.
3. Implement the task, ensuring code is linted (bun run lint:fix), types check (bun run check-types), and tests pass (bun run test).
4. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the /chrome slash command to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

5. Mark the task complete in tasks.json by setting "passes": true.
   Include in your progress entry WHAT verification you performed (e.g., "Verified: /chrome screenshot" or "Verified: unit test added" or "Verified: ran test:myFunction").
6. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
7. Make a git commit using the branch from plan.md:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the branch specified in plan.md:
     * Use 'git checkout -b <branch-name> && git add -A && git commit -m "<message>"' to create the branch with the exact name from plan.md
     * Then use 'git push -u origin HEAD && gh pr create --fill' to push and create a PR
   - If you are already on the correct branch:
     * Use 'git add -A && git commit -m "<message>"' to add a new commit
     * Then use 'git push' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>I AM STUCK</promise> with a brief summary of what you tried and what is blocking progress.`;

const DEFAULT_REPORT_PROMPT = `You are reviewing the progress of a feature.

Provide a critical analysis:
- What has been accomplished so far
- What tasks remain and their priority
- Code smells, anti-patterns, or questionable design decisions you notice
- Overly complex solutions where simpler alternatives exist
- Missing error handling, edge cases, or potential bugs
- Inconsistencies with project conventions or best practices
- Concrete recommendations for improvement

Be direct and honest. Don't sugarcoat issues - the goal is to catch problems early. Point out specific files and line numbers when identifying issues. The user may ask follow-up questions about the feature, code, or implementation approach.`;

const DEFAULT_ON_ITERATION_PROMPT = `Review the changes made in the last iteration:
1. Check if any issues were introduced (bugs, regressions, incomplete work)
2. Verify the task was actually completed, not just claimed as complete
3. If follow-up work is needed, add new tasks to the tasks file with "passes": false
4. If everything looks good, proceed without changes`;

const DEFAULT_ON_COMPLETE_PROMPT = `Use the Task tool to spawn the code-simplifier agent to analyze recently modified code. After it completes, review its recommendations and add any worthwhile improvements to .ralph/backlog.json as new tasks. Mark new tasks with "passes": false.`;

const DEFAULT_REVIEW_PROMPT = `You are reviewing the code changes for a feature.

Focus on the actual code diff and provide a critical code review:
- Code quality and clarity of the changes
- Potential bugs, edge cases, or regressions introduced
- Security concerns (injection vulnerabilities, auth issues, data exposure)
- Performance implications (N+1 queries, unnecessary re-renders, memory leaks)
- Adherence to project conventions and patterns
- Opportunities for simplification or better abstractions

Be specific - reference exact files, line numbers, and code snippets when identifying issues.
Prioritize actionable feedback over general observations.`;

const DEFAULT_ONESHOT_PROMPT = `You are completing a feature in a SINGLE session. Complete ALL tasks in tasks.json before ending.

IMPORTANT: This is a oneshot run - there are no follow-up iterations. You must finish everything now.

1. FIRST: Read the Branch field at the top of plan.md. Use this branch for all commits.
2. Review plan.md for full context on the feature.
3. Work through ALL incomplete tasks in tasks.json, one by one.
4. For each task:
   - Implement the changes
   - Run lint (bun run lint:fix), type check (bun run check-types), and tests (bun run test)
   - Mark it complete in tasks.json by setting "passes": true
5. After ALL tasks are complete:
   - Append a summary to progress.txt with what was accomplished
   - Commit all changes to the branch specified in plan.md
   - Push and create/update the PR

If you encounter blockers on a task, note them in progress.txt and continue to the next task.
Do NOT stop until all tasks are either completed or documented as blocked.`;

const DEFAULT_REFRESH_PROMPT = `Review the open/incomplete tasks and ensure they are still relevant and up to date with the current codebase state.

For each incomplete task:
1. Check if the task is still needed (hasn't been done elsewhere, isn't obsolete due to codebase changes)
2. Verify the description and acceptance criteria are still accurate
3. Check if dependencies or related code have changed in ways that affect the task

Actions to take:
- If a task has already been completed elsewhere, mark it as complete (set "passes": true)
- If a task is no longer relevant, remove it from the list
- If a task's description is outdated, update it to reflect current requirements
- If you notice gaps or new work needed, suggest adding new tasks

After reviewing, update the tasks file with your changes and summarize what was updated.`;

async function createPromptFiles() {
  await $`mkdir -p .ralph/prompts/hooks`.quiet();

  const prompts = [
    { path: ".ralph/prompts/backlog.md", content: DEFAULT_BACKLOG_PROMPT },
    { path: ".ralph/prompts/feature.md", content: DEFAULT_FEATURE_PROMPT },
    { path: ".ralph/prompts/oneshot.md", content: DEFAULT_ONESHOT_PROMPT },
    { path: ".ralph/prompts/report.md", content: DEFAULT_REPORT_PROMPT },
    { path: ".ralph/prompts/review.md", content: DEFAULT_REVIEW_PROMPT },
    { path: ".ralph/prompts/refresh.md", content: DEFAULT_REFRESH_PROMPT },
    { path: ".ralph/prompts/hooks/on-iteration.md", content: DEFAULT_ON_ITERATION_PROMPT },
    { path: ".ralph/prompts/hooks/on-complete.md", content: DEFAULT_ON_COMPLETE_PROMPT },
  ];

  let created = false;
  for (const { path, content } of prompts) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      await Bun.write(file, content);
      created = true;
    }
  }

  if (created) {
    console.log("📝 Created .ralph/prompts/ with default prompts");
  }
}

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

  await $`mkdir -p .ralph/features .ralph/logs`.quiet();
  await createPromptFiles();

  const configFile = Bun.file(".ralph/config.json");
  if (!(await configFile.exists())) {
    await writeConfig({
      models: {
        backlog: "opus",
        feature: "opus",
        onIteration: "haiku",
        onComplete: "haiku",
        report: "opus",
      },
    });
    console.log("📝 Created .ralph/config.json (models: opus)");
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
  const entriesToAdd = [".ralph/state.json", ".ralph/queue.json", ".ralph/logs/", ".ralph/mcp-config.json"];

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
  console.log("  ralph backlog --once  - Test single backlog iteration");
  console.log("  ralph backlog         - Run backlog loop");
  console.log("  ralph feature <name>  - Run a feature plan");
}
