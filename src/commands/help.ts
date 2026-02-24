export function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
  run                Work through GitHub issues autonomously
                     --once                Run single iteration only
                     --debug               Enable debug logging
                     --force               Skip clean working tree check
                     --issue <number>      Only work on a specific issue
                     --assignee <user>     Only work on issues assigned to a user

  setup              Initialize Ralph in current project
                     --max-iterations <n>  Set max iterations (default: 50)

  completions        Output shell completions (eval "$(ralph completions)")

  help               Show this message`);
}
