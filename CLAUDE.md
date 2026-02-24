# Ralph

Autonomous Claude Code runner that works through GitHub issues in iterations until completion.

## Runtime

Use Bun, not Node.js.

- `bun <file>` to run
- `bun test` to run tests
- `bun install` for dependencies
- Bun automatically loads `.env`

## Project Structure

```
cli.ts              # Main CLI entry point (setup, run, help)
lib.ts              # Core utilities (state, config, prompts)
lib.test.ts         # Tests
src/
  commands/
    run.ts          # ralph run command
    setup.ts        # ralph setup command
    help.ts         # Help text
  executors/        # Execution backends (local)
  runner.ts         # Iteration loop logic
  formatter.ts      # Stream JSON parsing from Claude output
  services.ts       # Service manager for background processes
  colors.ts         # ANSI color constants
  debug.ts          # Debug logging
.ralph/             # State directory
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

### State Files
All state lives in `.ralph/`:
- `state.json` - Iteration count, status
- `config.json` - Model configuration
- `prompts/run.md` - Customizable run prompt

## CLI Commands

| Command | Purpose |
|---------|---------|
| `ralph setup` | Initialize Ralph in a project |
| `ralph run` | Work through GitHub issues autonomously |
| `ralph run --once` | Run single iteration only |
| `ralph run --debug` | Enable debug logging |
| `ralph run --force` | Skip clean working tree check |

## How It Works

Each iteration:
1. Claude runs `gh issue list` to find open issues
2. Claude picks the most important unblocked issue
3. If the issue is part of a feature (prefixed "XYZ: "), reads the artifact PRD for context
4. Claude implements, verifies, commits, closes the issue
5. Runner runs Claude again → repeat
6. When no open issues remain → outputs `<promise>ALL TASKS COMPLETE</promise>` → runner exits

## Exit Codes

- `0` - Success/completed
- `1` - Error
- `2` - Stuck (Claude reported `<promise>I AM STUCK</promise>`)
- `130` - Cancelled (SIGINT)

## Environment Variables

- `NTFY_URL` - Optional notification URL
