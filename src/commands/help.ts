export function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
  run                Work through GitHub issues autonomously
                     --once                Run single iteration only
                     --debug               Enable debug logging
                     --force               Skip clean working tree check

  setup              Initialize Ralph in current project
                     --max-iterations <n>  Set max iterations (default: 50)

  help               Show this message`);
}
