export function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
  run                Work through GitHub issues autonomously
                     --once                Run single iteration only
                     --debug               Enable debug logging
                     --force               Skip clean working tree check
                     --hooks               Run iteration/completion hooks

  setup              Initialize Ralph in current project
                     --max-iterations <n>  Set max iterations (default: 50)

  feature <name>     Run a feature plan from .ralph/features/<name>/
                     --once                Run single iteration only

  oneshot <name>     Run a feature plan in a single session
                     Completes all tasks at once instead of iterating

  backlog            Run backlog tasks from .ralph/backlog.json
                     --once                Run single iteration only
                     --max-iterations <n>  Override max iterations
                     --resume              Resume from last iteration

  cancel             Stop running session

  status             Show current state

  list               List open backlog tasks, features, and status

  watch              Watch for new tasks and auto-run ralph
                     --stream              Stream Claude output in realtime

  refresh <backlog | feature> [name]
                     Review open tasks and update for relevance
                     Examples:
                       ralph refresh backlog
                       ralph refresh feature
                       ralph refresh feature my-feat

  prompt <name> <feature>
                     Run a prompt against a feature
                     --first               Use most recent feature
                     Example: ralph prompt report my-feature

  completions bash   Output bash completion script
                     Install: ralph completions bash >> ~/.bashrc

  help               Show this message`);
}
