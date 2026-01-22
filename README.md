# Ralph

Autonomous Claude Code runner for hands-off task execution.

Ralph runs Claude Code in a loop, working through backlog tasks or feature plans until complete, stuck, or max iterations reached.

## Installation

```bash
npm install -g ralph-run
```

Ralph checks for updates on startup and notifies you when a new version is available.

## Setup

In any project where you want to use Ralph:

```bash
ralph setup
```

This creates:
- `.ralph/backlog.json` - Task backlog
- `.ralph/state.json` - Runner state
- `.ralph/progress.txt` - Progress log

### Notifications (optional)

Set `NTFY_URL` in your environment to receive notifications when Ralph completes, errors, or gets stuck:

```bash
export NTFY_URL=https://ntfy.sh/your-topic
```

## Usage

### Backlog Mode

Work through tasks in `.ralph/backlog.json`:

```bash
ralph backlog              # Run loop until complete or max iterations
ralph backlog --once       # Single iteration
ralph backlog --resume     # Resume from last iteration
ralph backlog --max-iterations 100
```

### Feature Mode

Run a specific feature plan from `.ralph/features/<name>/`:

```bash
ralph feature <name>
ralph feature <name> --once
```

Feature directories contain:
- `plan.md` - Feature plan and context
- `tasks.json` - Task breakdown
- `progress.txt` - Progress log

### Other Commands

```bash
ralph status    # Show current state
ralph cancel    # Stop running session
ralph help      # Show help
```

### Shell Completions

```bash
ralph completions bash >> ~/.bashrc
```

## Backlog Format

```json
{
  "tasks": [
    {
      "title": "Add user authentication",
      "description": "Implement JWT-based auth with refresh tokens",
      "acceptance": ["Login endpoint works", "Tokens refresh correctly"],
      "branch": "feature/auth",
      "passes": false
    }
  ]
}
```

## How It Works

1. Ralph spawns Claude Code with `--permission-mode acceptEdits`
2. Claude reads the backlog/feature plan and works on the highest priority task
3. Claude runs linting, type checking, and tests
4. Claude commits and creates/updates a PR
5. If Claude outputs `<promise>COMPLETE</promise>`, Ralph exits successfully
6. If Claude outputs `<promise>STUCK</promise>`, Ralph exits with an error
7. Otherwise, Ralph starts the next iteration

## Requirements

- [Bun](https://bun.sh)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Graphite CLI](https://graphite.dev) (for PR workflows)
