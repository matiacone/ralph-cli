const NTFY_URL = process.env.NTFY_URL;

export type VcsType = "git" | "graphite";

export interface RalphConfig {
  vcs: VcsType;
}

const VCS_INSTRUCTIONS = {
  git: {
    createBranch: `git checkout -b <branch-name> && git add -A && git commit -m "<message>"`,
    submit: `git push -u origin HEAD && gh pr create --fill`,
    modifyCommit: `git add -A && git commit -m "<message>"`,
    updatePr: `git push`,
  },
  graphite: {
    createBranch: `gt create <branch-name> --all -m "<message>"`,
    submit: `gt submit --no-interactive`,
    modifyCommit: `gt modify --all -c -m "<message>"`,
    updatePr: `gt submit --no-interactive`,
  },
};

export function getConfigFile() {
  return ".ralph/config.json";
}

export async function readConfig(): Promise<RalphConfig> {
  const file = Bun.file(getConfigFile());
  if (!(await file.exists())) {
    return { vcs: "git" };
  }
  return file.json();
}

export async function writeConfig(config: RalphConfig) {
  await Bun.write(getConfigFile(), JSON.stringify(config, null, 2));
}

export async function notify(title: string, message: string, priority = "default") {
  if (!NTFY_URL) return;
  await fetch(NTFY_URL, {
    method: "POST",
    headers: { Title: title, Priority: priority },
    body: message,
  }).catch(() => {});
}

export function checkRepoRoot() {
  if (!Bun.file("package.json").size) {
    console.error("❌ Error: Must run from repository root");
    process.exit(1);
  }
}

export function getStateFile() {
  return ".ralph/state.json";
}

export async function readState() {
  const file = Bun.file(getStateFile());
  if (!(await file.exists())) return null;
  return file.json();
}

export async function writeState(state: object) {
  await Bun.write(getStateFile(), JSON.stringify(state, null, 2));
}

export async function readBacklog() {
  const file = Bun.file(".ralph/backlog.json");
  if (await file.exists()) return { path: ".ralph/backlog.json", file };
  return null;
}

export function getFeatureDir(name: string) {
  return `.ralph/features/${name}`;
}

export async function listFeatures(): Promise<string[]> {
  const dir = ".ralph/features";
  try {
    const entries = await Array.fromAsync(new Bun.Glob("*/tasks.json").scan({ cwd: dir }));
    return entries.map((e) => e.replace("/tasks.json", ""));
  } catch {
    return [];
  }
}

export function getBacklogPrompt(vcs: VcsType = "git") {
  const i = VCS_INSTRUCTIONS[vcs];
  return `@.ralph/backlog.json @.ralph/progress.txt
1. Find the highest-priority task to work on and work only on that task.
This should be the one YOU decide has the highest priority - not necessarily the first in the array.
2. Check that the code is linted via bun run lint:fix, types check via bun run check-types, and tests pass via bun run test.
3. VERIFICATION: Confirm your changes actually work:
   - If you made UI changes: Use the Playwriter MCP to visually verify the changes render correctly.
   - If you added backend routes or logic more complex than basic CRUD: Either write 1-2 unit tests to verify correctness, OR create a test query/mutation in convex/test.ts that logs results and run it via 'npx convex run test:<functionName>' against the live DB.
4. Update the backlog.json with the work that was done (set passes: true when complete).
5. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Branch: <branch> | <1-2 sentence summary of what was done> | Gotchas: <any important learnings/gotchas, or "none">
6. Make a git commit and submit PR:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the task's branch:
     * Use '${i.createBranch}' to create a new branch
     * Then use '${i.submit}' to push and create a PR
   - If you are already on the task's branch:
     * Use '${i.modifyCommit}' to add a new commit
     * Then use '${i.updatePr}' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>STUCK</promise> with a brief summary of what you tried and what is blocking progress.`;
}

export function getFeaturePrompt(name: string, vcs: VcsType = "git") {
  const dir = getFeatureDir(name);
  const i = VCS_INSTRUCTIONS[vcs];
  return `@${dir}/plan.md @${dir}/tasks.json @${dir}/progress.txt
1. FIRST: Read the Branch field at the top of plan.md. You MUST use this branch for all commits.
2. Review plan.md for context, then find the highest-priority incomplete task in tasks.json.
   This should be the one YOU decide has the highest priority - not necessarily the first in the array.
3. Implement the task, ensuring code is linted (bun run lint:fix), types check (bun run check-types), and tests pass (bun run test).
4. VERIFICATION: Confirm your changes actually work:
   - If you made UI changes: Use the Playwriter MCP to visually verify the changes render correctly.
   - If you added backend routes or logic more complex than basic CRUD: Either write 1-2 unit tests to verify correctness, OR create a test query/mutation in convex/test.ts that logs results and run it via 'npx convex run test:<functionName>' against the live DB.
5. Mark the task complete in tasks.json by setting "passes": true.
6. Append a concise progress entry to ${dir}/progress.txt:
   Format: [TIMESTAMP] Task: <title> | <1-2 sentence summary of what was done> | Gotchas: <any important learnings/gotchas, or "none">
7. Make a git commit using the branch from plan.md:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the branch specified in plan.md:
     * Use '${i.createBranch}' to create the branch with the exact name from plan.md
     * Then use '${i.submit}' to push and create a PR
   - If you are already on the correct branch:
     * Use '${i.modifyCommit}' to add a new commit
     * Then use '${i.updatePr}' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>STUCK</promise> with a brief summary of what you tried and what is blocking progress.`;
}

export async function getReportPrompt(name: string): Promise<string> {
  const dir = getFeatureDir(name);

  let gitLog = "";
  let gitDiff = "";

  try {
    const planContent = await Bun.file(`${dir}/plan.md`).text();
    const branchMatch = planContent.match(/^Branch:\s*(.+)$/m);
    const branch = branchMatch?.[1]?.trim();

    if (branch) {
      const logResult = await Bun.$`git log --oneline -10 ${branch} 2>/dev/null`.quiet();
      gitLog = logResult.text().trim();

      const diffResult =
        await Bun.$`git diff main...${branch} --stat 2>/dev/null || git diff master...${branch} --stat 2>/dev/null`.quiet();
      gitDiff = diffResult.text().trim();
    }
  } catch {
    // Git commands may fail, that's ok
  }

  const tasksFile = await readTasksFile(`${dir}/tasks.json`);
  let taskSummary = "";
  if (tasksFile) {
    const total = tasksFile.tasks.length;
    const completed = tasksFile.tasks.filter((t) => t.passes).length;
    const remaining = total - completed;
    taskSummary = `
## Task Summary
- Total tasks: ${total}
- Completed: ${completed}
- Remaining: ${remaining}
`;
  }

  const gitSection = gitLog
    ? `
## Recent Git Activity
\`\`\`
${gitLog}
\`\`\`
`
    : "";

  const diffSection = gitDiff
    ? `
## Changes in Branch
\`\`\`
${gitDiff}
\`\`\`
`
    : "";

  return `@${dir}/plan.md @${dir}/tasks.json @${dir}/progress.txt

You are reviewing the progress of the "${name}" feature.
${taskSummary}${gitSection}${diffSection}
Help the user understand:
- What has been accomplished so far
- What tasks remain and their priority
- Any patterns or issues visible in the progress log
- Recommendations for next steps

Be conversational. The user may ask follow-up questions about the feature, code, or implementation approach.`;
}

export interface TaskFile {
  tasks: Array<{
    title: string;
    description?: string;
    acceptance?: string[];
    branch?: string;
    passes: boolean;
  }>;
}

export async function readTasksFile(path: string): Promise<TaskFile | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return await file.json();
  } catch {
    return null;
  }
}

export function getIncompleteTaskTitles(taskFile: TaskFile): string[] {
  return taskFile.tasks
    .filter((t) => !t.passes)
    .map((t) => t.title)
    .sort();
}

export function hasOpenTasks(taskFile: TaskFile): boolean {
  return taskFile.tasks.some((t) => !t.passes);
}

export async function listOpenFeatures(): Promise<string[]> {
  const features = await listFeatures();
  const open: string[] = [];
  for (const name of features) {
    const taskFile = await readTasksFile(`.ralph/features/${name}/tasks.json`);
    if (taskFile && hasOpenTasks(taskFile)) {
      open.push(name);
    }
  }
  return open;
}

export async function getGitRemoteUrl(): Promise<string> {
  try {
    const result = await Bun.$`git remote get-url origin`.quiet();
    const url = result.text().trim();
    if (!url) {
      throw new Error("No remote URL found for 'origin'");
    }
    return url;
  } catch (error) {
    if (error instanceof Error && error.message.includes("No remote URL")) {
      throw error;
    }
    throw new Error(
      `Failed to get git remote URL: ${error instanceof Error ? error.message : "Unknown error"}. Make sure you're in a git repository with an 'origin' remote configured.`
    );
  }
}

export async function getCurrentBranch(): Promise<string> {
  try {
    const result = await Bun.$`git branch --show-current`.quiet();
    const branch = result.text().trim();
    if (!branch) {
      throw new Error("Not on a branch (possibly in detached HEAD state)");
    }
    return branch;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not on a branch")) {
      throw error;
    }
    throw new Error(
      `Failed to get current git branch: ${error instanceof Error ? error.message : "Unknown error"}. Make sure you're in a git repository.`
    );
  }
}
