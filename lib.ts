const NTFY_URL = process.env.NTFY_URL;

export type ModelAlias = "sonnet" | "opus" | "haiku" | "opusplan";

export interface ModelConfig {
  backlog?: ModelAlias;
  feature?: ModelAlias;
  onIteration?: ModelAlias;
  onComplete?: ModelAlias;
  report?: ModelAlias;
}

export interface ServiceConfig {
  name: string;
  command: string;
  args?: string[];
  readyPattern?: string;
  readyTimeout?: number;
  openUrl?: string;
}

export interface McpConfig {
  playwriter?: {
    enabled: boolean;
  };
}

export interface RalphConfig {
  models?: ModelConfig;
  services?: ServiceConfig[];
  mcp?: McpConfig;
}

function getPromptsDir(): string {
  return ".ralph/prompts";
}

async function readPromptFile(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Prompts not found. Run \`ralph setup\` first.`);
  }
  return file.text();
}

export function getConfigFile() {
  return ".ralph/config.json";
}

export async function readConfig(): Promise<RalphConfig> {
  const file = Bun.file(getConfigFile());
  if (!(await file.exists())) {
    return {};
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

export async function getMostRecentFeature(): Promise<string | null> {
  const features = await listFeatures();
  if (features.length === 0) return null;

  let mostRecent: { name: string; mtimeMs: number } | null = null;
  for (const name of features) {
    const stat = await Bun.file(`${getFeatureDir(name)}/tasks.json`).stat();
    if (!mostRecent || stat.mtimeMs > mostRecent.mtimeMs) {
      mostRecent = { name, mtimeMs: stat.mtimeMs };
    }
  }
  return mostRecent?.name ?? null;
}

export async function getBacklogPrompt(): Promise<string> {
  const promptPath = `${getPromptsDir()}/backlog.md`;
  const instructions = await readPromptFile(promptPath);
  return `@.ralph/backlog.json @.ralph/progress.txt\n${instructions}`;
}

export async function getFeaturePrompt(name: string): Promise<string> {
  const dir = getFeatureDir(name);
  const promptPath = `${getPromptsDir()}/feature.md`;
  const instructions = await readPromptFile(promptPath);
  return `@${dir}/plan.md @${dir}/tasks.json @${dir}/progress.txt\n${instructions}`;
}

export async function getOneshotPrompt(name: string): Promise<string> {
  const dir = getFeatureDir(name);
  const promptPath = `${getPromptsDir()}/oneshot.md`;
  const instructions = await readPromptFile(promptPath);
  return `@${dir}/plan.md @${dir}/tasks.json @${dir}/progress.txt\n${instructions}`;
}

export async function getReportPrompt(name: string): Promise<string> {
  const dir = getFeatureDir(name);
  const promptPath = `${getPromptsDir()}/report.md`;
  const instructions = await readPromptFile(promptPath);

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
${instructions}`;
}

export async function getHookPrompt(hook: string, featureName?: string): Promise<string | null> {
  const hookPath = `${getPromptsDir()}/hooks/${hook}.md`;
  const file = Bun.file(hookPath);
  if (!(await file.exists())) {
    return null;
  }
  const instructions = await file.text();

  if (featureName) {
    const dir = getFeatureDir(featureName);
    return `@${dir}/plan.md @${dir}/tasks.json @${dir}/progress.txt\n${instructions}`;
  }

  return instructions;
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

export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const result = await Bun.$`git status --porcelain`.quiet();
    return result.text().trim().length > 0;
  } catch {
    return false;
  }
}

export async function checkCleanWorkingTree(): Promise<void> {
  if (await hasUncommittedChanges()) {
    console.error("❌ Error: You have uncommitted changes in your working directory.");
    console.error("   Ralph modifies files and creates commits, which can conflict with your work.");
    console.error("");
    console.error("   Options:");
    console.error("   1. Commit or stash your changes first");
    console.error("   2. Use --force to run anyway (not recommended)");
    process.exit(1);
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
