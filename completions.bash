# Ralph CLI bash completion
# Source this file: source /path/to/ralph/completions.bash

_ralph_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local cmd="${COMP_WORDS[1]}"

  local commands="setup feature oneshot backlog cancel status list watch report delete help completions"

  case "${cmd}" in
    setup)
      [[ ${cur} == -* ]] && COMPREPLY=( $(compgen -W "--max-iterations" -- "${cur}") )
      return ;;
    feature)
      if [[ ${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "--once --sandbox --first --debug" -- "${cur}") )
      elif [[ ${COMP_CWORD} -eq 2 ]]; then
        local features=$(ralph completions --list-features open 2>/dev/null)
        COMPREPLY=( $(compgen -W "${features}" -- "${cur}") )
      fi
      return ;;
    oneshot)
      if [[ ${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "--first --debug" -- "${cur}") )
      elif [[ ${COMP_CWORD} -eq 2 ]]; then
        local features=$(ralph completions --list-features open 2>/dev/null)
        COMPREPLY=( $(compgen -W "${features}" -- "${cur}") )
      fi
      return ;;
    backlog)
      [[ ${cur} == -* ]] && COMPREPLY=( $(compgen -W "--once --max-iterations --resume --sandbox" -- "${cur}") )
      return ;;
    watch)
      [[ ${cur} == -* ]] && COMPREPLY=( $(compgen -W "--stream" -- "${cur}") )
      return ;;
    report)
      if [[ ${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "--first" -- "${cur}") )
      elif [[ ${COMP_CWORD} -eq 2 ]]; then
        local features=$(ralph completions --list-features all 2>/dev/null)
        COMPREPLY=( $(compgen -W "${features}" -- "${cur}") )
      fi
      return ;;
    delete)
      if [[ ${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "--force -f" -- "${cur}") )
      elif [[ ${COMP_CWORD} -eq 2 ]]; then
        local features=$(ralph completions --list-features open 2>/dev/null)
        COMPREPLY=( $(compgen -W "${features}" -- "${cur}") )
      fi
      return ;;
    cancel|status|list|help) return ;;
    completions)
      [[ ${COMP_CWORD} -eq 2 ]] && COMPREPLY=( $(compgen -W "bash" -- "${cur}") )
      return ;;
  esac

  [[ ${COMP_CWORD} -eq 1 ]] && COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
}

complete -F _ralph_completions ralph
