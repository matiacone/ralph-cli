# Add Daytona Sandbox Support to Ralph

Branch: feature/daytona-sandbox

## Summary

Add `--sandbox` flag to `ralph backlog` and `ralph feature` commands to run Claude Code iterations inside a Daytona sandbox instead of locally. The sandbox clones the repo, runs all iterations, and pushes PRs directly - avoiding local/remote conflicts.

## Architecture

```
ralph backlog --sandbox
       │
       ├─ Get repo URL + current branch from local git
       ├─ Create Daytona sandbox with ANTHROPIC_API_KEY + GH_TOKEN
       ├─ Clone repo → checkout branch → install Claude Code
       ├─ Run iteration loop (all iterations in same sandbox)
       │    └─ Stream output back to local terminal
       └─ Cleanup sandbox when done
```

## New Files

### 1. `src/executor.ts` - Executor interface
```typescript
export interface ExecutionResult {
  exitCode: number;
  output: string;
}

export interface Executor {
  initialize(): Promise<void>;
  execute(prompt: string, onStdout: (chunk: string) => void, onStderr: (chunk: string) => void): Promise<ExecutionResult>;
  readFile(path: string): Promise<string | null>;  // For reading tasks.json from sandbox
  cleanup(): Promise<void>;
}
```

### 2. `src/executors/local.ts` - Current behavior wrapped as executor
- Wraps `Bun.spawn()` in the Executor interface
- `readFile()` uses `Bun.file()`

### 3. `src/executors/daytona.ts` - Daytona sandbox executor
- Creates sandbox with env vars (ANTHROPIC_API_KEY, GH_TOKEN)
- `initialize()`: Clone repo, checkout branch, install deps + Claude Code
- `execute()`: Run claude command with streaming via `getSessionCommandLogs()`
- `readFile()`: Read file from sandbox filesystem
- `cleanup()`: Delete sandbox

### 4. `src/executors/index.ts` - Factory function
```typescript
export async function createExecutor(opts: { sandbox?: boolean; repoUrl?: string; branch?: string }): Promise<Executor>
```

## Modified Files

### `src/runner.ts`
- Add `executor?: Executor` to `RunnerConfig` and `LoopConfig` interfaces
- Refactor `runLoop()` to use executor instead of direct `Bun.spawn()`
- Replace `readTasksFile(tasksFilePath)` with `executor.readFile(tasksFilePath)` then parse JSON
- Add `try/finally` block to ensure `executor.cleanup()` is called
- Add SIGINT/SIGTERM handlers for cleanup on interrupt

### `src/commands/backlog.ts`
- Parse `--sandbox` flag in args loop
- If sandbox: get repo URL + branch, create DaytonaExecutor
- Pass executor to `runLoop()`

### `src/commands/feature.ts`
- Same changes as backlog.ts

### `lib.ts`
Add git helper functions:
```typescript
export async function getGitRemoteUrl(): Promise<string>
export async function getCurrentBranch(): Promise<string>
```

### `package.json`
- Add dependency: `@daytonaio/sdk`

## Key Implementation Details

### Streaming
Daytona SDK uses callbacks for streaming:
```typescript
await sandbox.process.getSessionCommandLogs(
  sessionId,
  cmdId,
  (stdout) => onStdout(stdout),  // Stream to terminal + appendToLog
  (stderr) => onStderr(stderr),
)
```

### Task File Reading
In sandbox mode, tasks.json is updated inside the sandbox. The executor's `readFile()` method fetches it:
```typescript
// In DaytonaExecutor
async readFile(path: string): Promise<string | null> {
  const result = await this.sandbox.process.executeSessionCommand(this.sessionId, {
    command: `cat /workspace/${path}`,
  });
  return result.exitCode === 0 ? result.stdout : null;
}
```

### Prompt Passing
Prompts use `@file` references (e.g., `@.ralph/backlog.json`). These work in the sandbox because we clone the full repo to `/workspace`.

### Signal Handling
```typescript
const cleanup = async () => { await executor.cleanup(); process.exit(130); };
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
```

## Verification

1. **Local mode unchanged**: `ralph backlog` works exactly as before
2. **Sandbox mode**: `ralph backlog --sandbox` creates sandbox, runs iterations, cleans up
3. **Streaming**: Output appears in terminal in real-time
4. **Cleanup**: Sandbox is deleted on completion, error, or Ctrl+C
5. **PR creation**: PRs are created from sandbox (check GitHub)

Test commands:
```bash
# Verify local still works
ralph backlog --once

# Test sandbox mode
export ANTHROPIC_API_KEY="..."
export GH_TOKEN="..."
ralph backlog --sandbox --max-iterations 1

# Test feature mode
ralph feature my-feature --sandbox --once
```
