export function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
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

  report <name>      Interactive review of feature progress

  completions bash   Output bash completion script
                     Install: ralph completions bash >> ~/.bashrc

  help               Show this message`);
}
