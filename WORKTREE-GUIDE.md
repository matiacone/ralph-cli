# Running Ralph in a Worktree

Run Ralph asynchronously without conflicts by using a dedicated worktree.

## Quick Start

### 1. Create a Ralph worktree

```bash
# From your main repo
wt create ~/ralph-workspace --branch develop
```

This creates an isolated workspace at `~/ralph-workspace` based on the `develop` branch.

### 2. Set up Ralph in the worktree

```bash
cd ~/ralph-workspace

# Initialize Ralph (creates .ralph/ directory)
~/.ralph/ralph-setup.sh --max-iterations 20

# Edit the PRD with your tasks
nano .ralph/prd.json
```

### 3. Run Ralph

```bash
# Start Ralph in the background
~/.ralph/ralph-run.sh &

# Or use tmux/screen for persistent sessions
tmux new -s ralph
~/.ralph/ralph-run.sh
# Ctrl+B, D to detach
```

### 4. Monitor progress

```bash
# Watch the logs in real-time
tail -f ~/ralph-workspace/.ralph/ralph.log

# Check progress summaries
cat ~/ralph-workspace/.ralph/progress.txt

# Check remaining tasks
jq '.tasks[] | select(.passes == false)' ~/ralph-workspace/.ralph/prd.json
```

### 5. Work on your own stuff

```bash
# Switch back to your main workspace
cd /home/mathew/creations/deal-deploy

# Work on whatever you want - no conflicts!
# Ralph is working in ~/ralph-workspace
```

## How It Works

- **Isolated workspace**: Ralph works in `~/ralph-workspace`, you work in your main repo
- **No git conflicts**: Each worktree has its own working directory
- **Graphite stacks**: Ralph creates stacked branches that sync to both worktrees
- **Shared git history**: Both worktrees share the same `.git` - branches and commits are immediately available

## Reviewing Ralph's Work

```bash
# From your main repo
git log --oneline --graph --all

# Check out Ralph's branches
gt log

# Review a PR Ralph created
gh pr list
gh pr view <PR-NUMBER>
```

## Cleanup

```bash
# When done, delete the worktree
wt delete ~/ralph-workspace

# Or keep it around for next time
```

## Tips

**Use tmux for persistence:**
```bash
tmux new -s ralph
cd ~/ralph-workspace
~/.ralph/ralph-run.sh
# Ctrl+B, D to detach
# Ralph keeps running even if you close your terminal

# Reattach later
tmux attach -t ralph
```

**Multiple PRDs:**
You can run multiple Ralph instances for different projects:
```bash
wt create ~/ralph-workspace-1 --branch develop
wt create ~/ralph-workspace-2 --branch some-feature

cd ~/ralph-workspace-1
~/.ralph/ralph-setup.sh
# Edit .ralph/prd.json for project 1

cd ~/ralph-workspace-2
~/.ralph/ralph-setup.sh
# Edit .ralph/prd.json for project 2
```

**Pause and resume:**
```bash
# From the worktree
~/.ralph/ralph-cancel.sh

# Later...
~/.ralph/ralph-run.sh --resume
```
