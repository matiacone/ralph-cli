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
3. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the Playwright MCP to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

4. Update the backlog.json with the work that was done (set passes: true when complete).
   Include in your progress entry WHAT verification you performed (e.g., "Verified: Playwright screenshot" or "Verified: unit test added" or "Verified: ran test:myFunction").
5. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Branch: <branch> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
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
4. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the Playwright MCP to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

5. Mark the task complete in tasks.json by setting "passes": true.
   Include in your progress entry WHAT verification you performed (e.g., "Verified: Playwright screenshot" or "Verified: unit test added" or "Verified: ran test:myFunction").
6. Append a concise progress entry to ${dir}/progress.txt:
   Format: [TIMESTAMP] Task: <title> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
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
Provide a critical analysis:
- What has been accomplished so far
- What tasks remain and their priority
- Code smells, anti-patterns, or questionable design decisions you notice
- Overly complex solutions where simpler alternatives exist
- Missing error handling, edge cases, or potential bugs
- Inconsistencies with project conventions or best practices
- Concrete recommendations for improvement

Be direct and honest. Don't sugarcoat issues - the goal is to catch problems early. Point out specific files and line numbers when identifying issues. The user may ask follow-up questions about the feature, code, or implementation approach.`;
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

export function getQueuePath(): string {
  return ".ralph/queue.json";
}

interface QueueFile {
  items: string[];
}

// Debug logging - imported dynamically to avoid circular deps
let debugFn: ((ctx: string, msg: string, data?: Record<string, unknown>) => void) | null = null;
export function setQueueDebugger(fn: (ctx: string, msg: string, data?: Record<string, unknown>) => void) {
  debugFn = fn;
}

export async function readQueue(): Promise<string[]> {
  const path = getQueuePath();
  debugFn?.("readQueue", `Reading queue from ${path}`);

  const file = Bun.file(path);
  const exists = await file.exists();
  debugFn?.("readQueue", `File exists: ${exists}`);

  if (!exists) {
    debugFn?.("readQueue", "Returning empty array (file doesn't exist)");
    return [];
  }

  try {
    const text = await file.text();
    debugFn?.("readQueue", `Raw file content: ${text}`);
    const data: QueueFile = JSON.parse(text);
    const items = data.items ?? [];
    debugFn?.("readQueue", `Parsed items`, { items });
    return items;
  } catch (err) {
    debugFn?.("readQueue", `Parse error: ${err}`);
    return [];
  }
}

export async function addToQueue(featureName: string): Promise<void> {
  debugFn?.("addToQueue", `Adding "${featureName}" to queue`);
  const items = await readQueue();
  items.push(featureName);
  const content = JSON.stringify({ items }, null, 2);
  debugFn?.("addToQueue", `Writing queue`, { items });
  await Bun.write(getQueuePath(), content);
  debugFn?.("addToQueue", "Write complete");
}

export async function popQueue(): Promise<string | null> {
  debugFn?.("popQueue", "Popping from queue");
  const items = await readQueue();
  debugFn?.("popQueue", `Current items`, { items, length: items.length });

  if (items.length === 0) {
    debugFn?.("popQueue", "Queue empty, returning null");
    return null;
  }

  const next = items.shift()!;
  debugFn?.("popQueue", `Popped "${next}", remaining`, { remaining: items });

  const content = JSON.stringify({ items }, null, 2);
  await Bun.write(getQueuePath(), content);
  debugFn?.("popQueue", `Wrote updated queue, returning "${next}"`);

  return next;
}

export async function isRalphRunning(): Promise<boolean> {
  const state = await readState();
  const running = state?.status === "running";
  debugFn?.("isRalphRunning", `Status: ${state?.status}, running: ${running}`);
  return running;
}
