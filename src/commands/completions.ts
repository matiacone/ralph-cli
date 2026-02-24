import { homedir } from "os";
import { join } from "path";

const EVAL_LINE = 'eval "$(ralph completions --print)"';

const COMPLETION_SCRIPT = `
# Ralph CLI completions
# Added by: ralph completions

if [ -n "$ZSH_VERSION" ]; then
  autoload -U compinit && compinit 2>/dev/null
fi

_ralph_completions() {
  local cur prev commands run_flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="run setup help version completions"
  run_flags="--once --debug --force --issue --assignee"

  # Complete subcommands
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  local cmd="\${COMP_WORDS[1]}"

  case "$cmd" in
    run)
      case "$prev" in
        --assignee)
          local users
          users=$(gh api repos/:owner/:repo/collaborators --jq '.[].login' 2>/dev/null)
          COMPREPLY=($(compgen -W "$users" -- "$cur"))
          return
          ;;
        --issue)
          local issues
          issues=$(gh issue list --state open --json number --jq '.[].number' 2>/dev/null)
          COMPREPLY=($(compgen -W "$issues" -- "$cur"))
          return
          ;;
      esac
      COMPREPLY=($(compgen -W "$run_flags" -- "$cur"))
      ;;
    setup)
      COMPREPLY=($(compgen -W "--max-iterations" -- "$cur"))
      ;;
  esac
}

if [ -n "$ZSH_VERSION" ]; then
  compdef _ralph_completions ralph
elif [ -n "$BASH_VERSION" ]; then
  complete -F _ralph_completions ralph
fi
`.trim();

function detectShellRc(): string {
  const shell = process.env.SHELL ?? "";
  const home = homedir();
  if (shell.endsWith("/zsh")) return join(home, ".zshrc");
  return join(home, ".bashrc");
}

async function install() {
  const rcPath = detectShellRc();
  const rcFile = Bun.file(rcPath);
  const contents = (await rcFile.exists()) ? await rcFile.text() : "";

  if (contents.includes(EVAL_LINE)) {
    console.log(`✓ Ralph completions already installed in ${rcPath}`);
    return;
  }

  const addition = `\n# Ralph CLI completions\n${EVAL_LINE}\n`;
  await Bun.write(rcPath, contents + addition);
  console.log(`✓ Added Ralph completions to ${rcPath}`);
  console.log(`  Restart your shell or run: source ${rcPath}`);
}

export async function completions(args: string[]) {
  if (args.includes("--print")) {
    console.log(COMPLETION_SCRIPT);
    return;
  }

  await install();
}
