const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export type ModelAlias = "sonnet" | "opus" | "haiku" | "opusplan";

export interface ModelConfig {
  feature?: ModelAlias;
  [promptName: string]: ModelAlias | undefined;
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
  chrome?: {
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
  if (!SLACK_WEBHOOK_URL) return;
  const emoji = priority === "high" ? ":rotating_light:" : ":white_check_mark:";
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${emoji} *${title}*\n${message}` }),
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

export const DEFAULT_RUN_PROMPT = `You are an autonomous agent working through GitHub issues for this repo.

1. Run \`gh issue list --state open --json number,title,body,labels\` to see all open issues.
2. If there are NO open issues, output <promise>ALL TASKS COMPLETE</promise> and stop immediately.
3. Determine the most important issue to work on:
   - Skip issues labeled "idea" — these are saved for later and not actionable
   - Check each issue's "Blocked by" section — only pick issues whose blockers are all closed
   - Prioritize unblocked issues by importance/dependency order
4. If the issue title is prefixed with "XYZ: " (e.g., "Search: Create search record"):
   - There should be an artifact issue titled "XYZ Artifact: ..." (e.g., "Search Artifact: ...")
   - Use \`gh issue view <artifact-number>\` to read the full feature plan for context
5. Use \`gh issue view <number>\` to read the full issue details
6. Implement the task:
   - If the change touches backend code, use the \`/tdd\` skill to drive the implementation
   - Lint: bun run lint:fix
   - Types: bun run check-types
   - Tests: bun run test
7. Verify your work:
   - Use tests and/or browser verification (via /chrome) to confirm the changes work
8. Append progress to .ralph/progress.txt:
    [TIMESTAMP] Issue #<number>: <title> | Verified: <method> | <summary> | Gotchas: <notes>
9. Commit using \`/ralph-commit\`:
   - **Artifact issues** (title prefixed "XYZ: "): Use ONE branch for the entire feature (e.g., \`ralph/search\`). All issues under the same artifact go on the same branch.
   - **Standalone issues**: Create one branch per issue (e.g., \`ralph/fix-login-bug\`)
10. Close the issue: \`gh issue close <number>\`

ONLY WORK ON A SINGLE ISSUE PER ITERATION.
If you have tried 3+ approaches and cannot make progress, output <promise>I AM STUCK</promise>`;

export async function getRunPrompt(): Promise<string> {
  const promptPath = `${getPromptsDir()}/run.md`;
  const file = Bun.file(promptPath);
  if (!(await file.exists())) {
    await Bun.write(promptPath, DEFAULT_RUN_PROMPT);
  }
  const instructions = await Bun.file(promptPath).text();
  return `@.ralph/progress.txt\n${instructions}`;
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
