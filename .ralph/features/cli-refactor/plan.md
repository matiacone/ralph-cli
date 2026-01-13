# Plan: Break Down cli.ts into Multiple Files

Branch: feature/cli-refactor

## Overview
Refactor cli.ts (~1085 lines) into a modular structure with clear separation of concerns.

## Proposed File Structure

```
ralph-cli/
  cli.ts              (~80 lines - thin entry point)
  lib.ts              (unchanged)
  lib.test.ts         (unchanged)

  src/
    colors.ts         (~15 lines - ANSI color constants)
    completions.ts    (~50 lines - bash completion script + handler)
    formatter.ts      (~130 lines - StreamFormatter class)
    runner.ts         (~150 lines - shared iteration/streaming logic)
    auto-update.ts    (~25 lines - auto-update functionality)

    commands/
      setup.ts        (~75 lines)
      feature.ts      (~90 lines)
      backlog.ts      (~100 lines)
      watch.ts        (~200 lines)
      status.ts       (~35 lines)
      list.ts         (~145 lines)
      cancel.ts       (~25 lines)
      help.ts         (~35 lines)
```

## Key Extractions

### 1. `src/colors.ts`
Move the `c` color constants object.

### 2. `src/auto-update.ts`
Move the `autoUpdate()` function.

### 3. `src/formatter.ts`
Move the entire `StreamFormatter` class.

### 4. `src/runner.ts` - Key Abstraction
Consolidate the ~100 lines of duplicated iteration/streaming logic shared between `feature()` and `backlog()`:
- Single iteration mode (`--once`)
- Loop mode with max iterations
- Streaming Claude output through StreamFormatter
- Logging to progress files
- Checking completion conditions
- Handling STUCK signals

### 5. `src/commands/*`
Each command gets its own file:
- `setup.ts` - Initialize Ralph
- `feature.ts` - Run feature plans (uses runner.ts)
- `backlog.ts` - Run backlog tasks (uses runner.ts)
- `watch.ts` - File watching mode
- `status.ts` - Show current state
- `list.ts` - Dashboard display
- `cancel.ts` - Cancel running session
- `help.ts` - Help text

### 6. `cli.ts` (entry point)
Thin router that imports commands and dispatches based on argv.

## Verification

1. Run `bun test` to ensure existing tests pass
2. Run `ralph help` to verify CLI works
3. Run `ralph setup` in a test directory
4. Run `ralph list` to verify output formatting
5. Run `ralph backlog --once` to verify iteration logic
