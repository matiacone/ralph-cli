# Ralph

Autonomous Claude Code runner that executes tasks from a backlog or feature plans in iterations until completion.

## Runtime

Use Bun, not Node.js.

- `bun <file>` to run
- `bun test` to run tests
- `bun install` for dependencies
- Bun automatically loads `.env`

## Project Structure

```
cli.ts              # Main CLI entry point with command router
lib.ts              # Core utilities (state, config, prompts)
lib.test.ts         # Tests
src/
  commands/         # CLI commands (setup, backlog, feature, watch, list, etc.)
  executors/        # Execution backends (local, daytona)
  runner.ts         # Iteration loop logic
  formatter.ts      # Stream JSON parsing from Claude output
  colors.ts         # ANSI color constants
.ralph/             # State directory (JSON files)
```

## Key Patterns

### File I/O
```ts
// Reading JSON
const data = await Bun.file(path).json();

// Writing JSON (always 2-space indent)
await Bun.write(path, JSON.stringify(data, null, 2));

// Shell commands
await Bun.$`git status`;
```

### Commands
Commands are async functions in `src/commands/`. Route them in `cli.ts`:
```ts
export async function myCommand(args: string[]) {
  const dir = checkRepoRoot(); // Always check first
  // ...
}
```

### Executors
Implement the `Executor` interface for new execution backends:
```ts
interface Executor {
  run(prompt: string): Promise<string>;
}
```

Use `createExecutor(sandbox: boolean)` factory from `src/executors/index.ts`.

### State Files
All state lives in `.ralph/`:
- `state.json` - Iteration count, status, current feature
- `backlog.json` - Task list
- `config.json` - VCS type (git or graphite)
- `progress.txt` - Append-only log

### Output Formatting
Use colors from `src/colors.ts`:
```ts
import { colors } from "../colors";
console.log(`${colors.green}Success${colors.reset}`);
```

## Testing

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

describe("feature", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await mkdtemp(`${tmpdir()}/test-`);
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(testDir, { recursive: true });
  });

  test("does thing", () => {
    expect(true).toBe(true);
  });
});
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Claude execution
- `GH_TOKEN` - GitHub token for sandbox git operations
- `DAYTONA_API_KEY` - Daytona sandbox API key
- `NTFY_URL` - Optional notification URL

## CLI Commands

| Command | Purpose |
|---------|---------|
| `ralph setup` | Initialize Ralph in a project |
| `ralph backlog` | Run backlog tasks |
| `ralph feature <name>` | Run a feature plan |
| `ralph watch` | Auto-run on task changes |
| `ralph list` | Show tasks and status |
| `ralph report <name>` | Interactive feature review |
| `ralph status` | Show current state |
| `ralph cancel` | Stop running session |

## Exit Codes

- `0` - Success/completed
- `1` - Error
- `2` - Stuck (Claude reported `<promise>STUCK</promise>`)
- `130` - Cancelled (SIGINT)
