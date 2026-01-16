# Feature Queue System

Branch: feature/feature-queue

## Overview

Add automatic queuing for features. When `ralph feature X` is called while another run is in progress, it queues the feature. When a run completes, it checks the queue and starts the next feature.

## Design

**Queue file**: `.ralph/queue.json`
```json
{
  "items": ["auth-system", "dashboard", "notifications"]
}
```

**Flow**:
1. `ralph feature X` → check if running → queue or run
2. On run completion → check queue → run next feature or exit

## Implementation

### 1. Add queue helpers to `lib.ts`

```ts
export function getQueuePath(dir: string): string
export async function readQueue(dir: string): Promise<string[]>
export async function addToQueue(dir: string, featureName: string): Promise<void>
export async function popQueue(dir: string): Promise<string | null>
```

### 2. Add `isRunning()` check to `lib.ts`

```ts
export async function isRalphRunning(dir: string): Promise<boolean> {
  const state = await readState(dir);
  return state.status === "running";
}
```

### 3. Modify `src/commands/feature.ts`

At the start of `featureCommand`:
- Check `isRalphRunning()`
- If running: `addToQueue(name)`, print message, exit 0
- If not running: proceed as normal

### 4. Modify `src/runner.ts` - `runLoop()`

At the end of `runLoop()`, after normal completion:
```ts
// Check queue for next feature
const next = await popQueue(dir);
if (next) {
  // Run next feature
}
```

### 5. Add `ralph queue` command (optional, for visibility)

Show current queue contents.

## Files to Modify

- `lib.ts` - Add queue helpers and isRunning check
- `src/commands/feature.ts` - Add queue-if-running logic
- `src/runner.ts` - Check queue after completion
- `cli.ts` - Add queue command route (optional)

## Verification

1. Run `ralph feature foo`
2. While running, in another terminal: `ralph feature bar`
3. Confirm "bar" is queued (check `.ralph/queue.json`)
4. When "foo" completes, confirm "bar" starts automatically
