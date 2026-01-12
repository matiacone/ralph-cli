# Plan: Add Logging Feature to Ralph-CLI

Branch: feature/logging

## Summary
Add a `ralph.log` file that saves all streamed JSON events with timestamps, appending to the log as ralph runs.

## Log File Locations
- **Feature mode**: `.ralph/features/<feature-name>/ralph.log`
- **Backlog mode**: `.ralph/ralph.log`

## Implementation

### 1. Add helper function in `lib.ts`

Add a `getLogFilePath()` function:
```typescript
export function getLogFilePath(featureName?: string): string {
  if (featureName) {
    return path.join(getFeatureDir(featureName), 'ralph.log');
  }
  return path.join('.ralph', 'ralph.log');
}
```

### 2. Add logging function in `lib.ts`

Add an `appendToLog()` function that writes timestamped JSON events:
```typescript
export async function appendToLog(featureName: string | undefined, chunk: string): Promise<void> {
  const logPath = getLogFilePath(featureName);
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${chunk}`;
  await Bun.write(logPath, entry, { append: true });
}
```

### 3. Modify `feature()` function in `cli.ts`

Add log writing in both streaming loops (single iteration and autonomous loop).

### 4. Modify `backlog()` function in `cli.ts`

Same pattern - add log writing in both streaming loops.

### 5. Add session markers

Add a session start marker when ralph begins each iteration for easier log navigation.

## Files to Modify
- `lib.ts` - Add `getLogFilePath()` and `appendToLog()` functions
- `cli.ts` - Add log writes in all 4 streaming locations (feature once, feature loop, backlog once, backlog loop)

## Verification
1. Run `bun test` to ensure existing tests pass
2. Run `bun cli.ts feature <name> --once` and verify `.ralph/features/<name>/ralph.log` is created with JSON events
3. Run `bun cli.ts backlog --once` and verify `.ralph/ralph.log` is created
4. Run multiple iterations and verify logs append (not overwrite)
5. Check timestamps are present and in ISO format
