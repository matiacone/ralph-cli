import { listOpenFeatures } from "../lib";

export const BASH_COMPLETION_SCRIPT = `# Ralph CLI bash completion
# Install: ralph completions bash >> ~/.bashrc

_ralph_completions() {
  local cur prev words cword
  _init_completion || return

  local commands="setup feature backlog cancel status list watch report help completions"

  case "\${words[1]}" in
    setup)
      [[ \${cur} == -* ]] && COMPREPLY=( \$(compgen -W "--max-iterations" -- "\${cur}") )
      return ;;
    feature)
      if [[ \${cur} == -* ]]; then
        COMPREPLY=( \$(compgen -W "--once" -- "\${cur}") )
      elif [[ \${cword} -eq 2 ]]; then
        local features=\$(ralph completions --list-features 2>/dev/null)
        COMPREPLY=( \$(compgen -W "\${features}" -- "\${cur}") )
      fi
      return ;;
    backlog)
      [[ \${cur} == -* ]] && COMPREPLY=( \$(compgen -W "--once --max-iterations --resume" -- "\${cur}") )
      return ;;
    watch)
      [[ \${cur} == -* ]] && COMPREPLY=( \$(compgen -W "--stream" -- "\${cur}") )
      return ;;
    report)
      if [[ \${cword} -eq 2 ]]; then
        local features=\$(ralph completions --list-features 2>/dev/null)
        COMPREPLY=( \$(compgen -W "\${features}" -- "\${cur}") )
      fi
      return ;;
    cancel|status|list|help) return ;;
    completions)
      [[ \${cword} -eq 2 ]] && COMPREPLY=( \$(compgen -W "bash" -- "\${cur}") )
      return ;;
  esac

  [[ \${cword} -eq 1 ]] && COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
}

complete -F _ralph_completions ralph
`;

export async function completions(args: string[]) {
  if (args.includes("--list-features")) {
    const features = await listOpenFeatures();
    for (const f of features) console.log(f);
    return;
  }

  if (args[0] === "bash") {
    console.log(BASH_COMPLETION_SCRIPT);
    return;
  }

  console.error("Usage: ralph completions bash");
  console.error("\nInstall: ralph completions bash >> ~/.bashrc");
  process.exit(1);
}
