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
    createBranch: `gt create --all -m "<message>"`,
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
3. Update the backlog.json with the work that was done (set passes: true when complete).
4. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Branch: <branch> | <1-2 sentence summary of what was done> | Gotchas: <any important learnings/gotchas, or "none">
5. Make a git commit and submit PR:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the task's branch:
     * Use '${i.createBranch}' to create a new branch
     * Then use '${i.submit}' to push and create a PR
   - If you are already on the task's branch:
     * Use '${i.modifyCommit}' to add a new commit
     * Then use '${i.updatePr}' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If, while implementing the task, you notice all tasks are complete, output <promise>COMPLETE</promise>
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
4. Mark the task complete in tasks.json by setting "passes": true.
5. Append a concise progress entry to ${dir}/progress.txt:
   Format: [TIMESTAMP] Task: <title> | <1-2 sentence summary of what was done> | Gotchas: <any important learnings/gotchas, or "none">
6. Make a git commit using the branch from plan.md:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the branch specified in plan.md:
     * Use '${i.createBranch}' to create the branch with the exact name from plan.md
     * Then use '${i.submit}' to push and create a PR
   - If you are already on the correct branch:
     * Use '${i.modifyCommit}' to add a new commit
     * Then use '${i.updatePr}' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If all tasks in tasks.json have "passes": true, output <promise>COMPLETE</promise>
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>STUCK</promise> with a brief summary of what you tried and what is blocking progress.`;
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
