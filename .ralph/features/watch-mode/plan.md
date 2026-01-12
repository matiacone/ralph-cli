# Ralph Watch Mode

Branch: feature/watch-mode

## Summary
Add a file-watching mode that monitors ALL task files (backlog + all features) and automatically triggers ralph runs when new tasks are detected.

## Usage
```bash
ralph watch             # Watch backlog AND all features
ralph watch --stream    # Stream Claude output in realtime
```

## Architecture

The watcher monitors:
- `.ralph/backlog.json`
- `.ralph/features/*/tasks.json` (all features)

When new incomplete tasks are detected in any file, it spawns the appropriate ralph command (`ralph backlog` or `ralph feature <name>`) as a subprocess and awaits completion.

## Key Design Decisions

1. **Detection**: Compare incomplete task titles before/after file change to detect *new* tasks (not just any change)
2. **Blocking runs**: Watcher blocks during runs; changes during runs are ignored; baseline updated after
3. **Debouncing**: 1-second debounce on file changes to handle rapid saves
4. **Stream passthrough**: `--stream` flag is passed to subprocess if specified
5. **Full loop**: Triggered runs execute the full iteration loop (until COMPLETE/STUCK/max iterations)

## Files to Modify

| File | Changes |
|------|---------|
| `cli.ts` | Add `watch()` function, command case, update completions, update help |
| `lib.ts` | Add `getIncompleteTaskTitles()` and `readTasksFile()` utilities |

## Watch Flow

```
START
  │
  ├─► Check .ralph/ exists
  │
  ├─► Build list of watch targets:
  │     - .ralph/backlog.json (if exists)
  │     - .ralph/features/*/tasks.json (for each feature)
  │
  ├─► Initialize baseline Map<path, string[]> of incomplete task titles
  │
  ├─► Set up fs.watch on each target
  │
  └─► LOOP: On file change
        │
        ├─► If isRunning: ignore
        │
        ├─► Debounce (1 second)
        │
        └─► checkForNewTasks(changedPath)
              │
              ├─► Read file, get new incomplete titles
              ├─► Compare to baseline[path]
              │
              ├─► If new tasks found:
              │     ├─► Set isRunning = true
              │     ├─► If backlog → spawn "ralph backlog [--stream]"
              │     │   Else → spawn "ralph feature <name> [--stream]"
              │     ├─► Await completion (full loop runs)
              │     ├─► Set isRunning = false
              │     └─► Update baseline[path]
              │
              └─► Update baseline silently if no new tasks
```

## Edge Cases

- **No .ralph directory:** Exit with error pointing to `ralph setup`
- **No files to watch:** Exit with message (no backlog, no features)
- **New feature added:** Periodically rescan `.ralph/features/` (every 10s)
- **Feature deleted:** Watcher errors → remove from map, continue
- **Changes during run:** Ignored; baseline updated after run completes
- **Rapid saves:** 1-second debounce
- **Ctrl+C:** Close all watchers gracefully
