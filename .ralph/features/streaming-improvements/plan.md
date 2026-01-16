# Improve Ralph Streaming Output

Branch: feature/streaming-improvements

## Current State

The `StreamFormatter` in `src/formatter.ts` only handles 3 event types:
1. `assistant` - Shows Claude's text responses
2. `content_block_start` (tool_use) - Shows tool name in dimmed separator
3. `result` (success) - Shows closing separator

**What's hidden:**
- Tool input parameters (file paths, commands, search patterns)
- Tool results/output
- Extended thinking blocks (if enabled)
- Streaming text deltas

## Event Structure

**Assistant events with tool_use:**
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {"type": "tool_use", "id": "toolu_...", "name": "Read", "input": {"file_path": "/path/to/file"}}
    ]
  }
}
```

**User events with tool_result:**
```json
{
  "type": "user",
  "message": {
    "content": [
      {"tool_use_id": "toolu_...", "type": "tool_result", "content": "file contents..."}
    ]
  },
  "tool_use_result": {"type": "text", "file": {...}}
}
```

## Goals

1. Show tool input parameters (file paths, commands, patterns)
2. Show abbreviated tool results (line counts, match counts, exit codes)
3. Truncate long text blocks to improve scannability

## Files to Modify
- `src/formatter.ts` - Add tool input/result formatting + text truncation
