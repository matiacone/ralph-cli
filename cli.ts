#!/usr/bin/env bun

import { $ } from "bun";

async function autoUpdate() {
  const scriptDir = import.meta.dir;
  try {
    await $`git -C ${scriptDir} fetch --quiet`.quiet();
    const local = await $`git -C ${scriptDir} rev-parse HEAD`.quiet().text();
    const remote = await $`git -C ${scriptDir} rev-parse origin/master`.quiet().text();

    if (local.trim() !== remote.trim()) {
      console.log("🔄 Updating Ralph...");
      await $`git -C ${scriptDir} pull --quiet`.quiet();
      console.log("✅ Updated. Restarting...\n");
      const args = process.argv.slice(1);
      Bun.spawn(["bun", ...args], { stdio: ["inherit", "inherit", "inherit"] });
      process.exit(0);
    }
  } catch (err) {
    console.error("⚠️  Auto-update failed:", err instanceof Error ? err.message : err);
  }
}

await autoUpdate();
import {
  notify,
  checkRepoRoot,
  readState,
  writeState,
  readBacklog,
  getFeatureDir,
  listFeatures,
  BACKLOG_PROMPT,
  getFeaturePrompt,
} from "./lib";

const BASH_COMPLETION_SCRIPT = `# Ralph CLI bash completion
# Install: ralph completions bash >> ~/.bashrc

_ralph_completions() {
  local cur prev words cword
  _init_completion || return

  local commands="setup feature backlog cancel status help completions"

  case "\${words[1]}" in
    setup)
      [[ \${cur} == -* ]] && COMPREPLY=( \$(compgen -W "--max-iterations" -- "\${cur}") )
      return ;;
    feature)
      if [[ \${cur} == -* ]]; then
        COMPREPLY=( \$(compgen -W "--once --stream" -- "\${cur}") )
      elif [[ \${cword} -eq 2 ]]; then
        local features=\$(ralph completions --list-features 2>/dev/null)
        COMPREPLY=( \$(compgen -W "\${features}" -- "\${cur}") )
      fi
      return ;;
    backlog)
      [[ \${cur} == -* ]] && COMPREPLY=( \$(compgen -W "--once --stream --max-iterations --resume" -- "\${cur}") )
      return ;;
    cancel|status|help) return ;;
    completions)
      [[ \${cword} -eq 2 ]] && COMPREPLY=( \$(compgen -W "bash" -- "\${cur}") )
      return ;;
  esac

  [[ \${cword} -eq 1 ]] && COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
}

complete -F _ralph_completions ralph
`;

async function setup(args: string[]) {
  let maxIterations = 50;

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    }
  }

  checkRepoRoot();
  console.log("🔧 Ralph Setup\n");

  await $`mkdir -p .ralph/features`.quiet();

  const backlogFile = Bun.file(".ralph/backlog.json");
  if (!(await backlogFile.exists())) {
    await Bun.write(
      backlogFile,
      JSON.stringify(
        {
          tasks: [
            {
              title: "Example task - replace with your own",
              description: "Why we need this and enough context to start.",
              acceptance: ["Specific, testable criteria"],
              branch: "feature/example",
              passes: false,
            },
          ],
        },
        null,
        2
      )
    );
    console.log("📝 Created .ralph/backlog.json");
    console.log("⚠️  Edit it to add your tasks before running Ralph\n");
  }

  const backlog = await Bun.file(".ralph/backlog.json").json();
  const total = backlog.tasks?.length ?? 0;
  const incomplete = backlog.tasks?.filter((t: { passes: boolean }) => !t.passes).length ?? 0;

  console.log(`✓ Backlog: ${total} tasks, ${incomplete} incomplete`);

  const progressFile = Bun.file(".ralph/progress.txt");
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  await writeState({
    iteration: 0,
    maxIterations,
    status: "initialized",
    startedAt: new Date().toISOString(),
  });

  console.log(`✓ State initialized (max ${maxIterations} iterations)\n`);
  console.log("✅ Ralph is ready!");
  console.log("\nNext steps:");
  console.log("  ralph backlog --once  - Test single backlog iteration");
  console.log("  ralph backlog         - Run backlog loop");
  console.log("  ralph feature <name>  - Run a feature plan");
}

function parseStreamJson(text: string, buffer: string): { content: string; remaining: string } {
  const combined = buffer + text;
  const lines = combined.split('\n');
  const remaining = lines.pop() || ''; // Keep incomplete line for next chunk
  let content = '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text') {
            content += block.text;
          }
        }
      }
    } catch {}
  }

  return { content, remaining };
}

async function feature(name: string, once: boolean, stream: boolean) {
  checkRepoRoot();

  const dir = getFeatureDir(name);
  const tasksFile = Bun.file(`${dir}/tasks.json`);

  if (!(await tasksFile.exists())) {
    const features = await listFeatures();
    if (features.length > 0) {
      console.error(`❌ Feature '${name}' not found.`);
      console.error(`\nAvailable features: ${features.join(", ")}`);
    } else {
      console.error(`❌ Feature '${name}' not found.`);
      console.error(`\nCreate it with: /create-ralph-plan ${name}`);
    }
    process.exit(1);
  }

  const progressFile = Bun.file(`${dir}/progress.txt`);
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  const prompt = getFeaturePrompt(name);

  if (once) {
    console.log(`🔄 Ralph Feature: ${name} (single iteration)\n`);
    const args = ["claude", "--permission-mode", "acceptEdits"];
    if (stream) {
      args.push("--output-format", "stream-json", "--verbose");
    }
    args.push(prompt);
    const proc = Bun.spawn(args, {
      stdio: ["inherit", stream ? "pipe" : "inherit", "inherit"],
    });

    if (stream && proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const { content, remaining } = parseStreamJson(text, buffer);
        buffer = remaining;
        if (content) process.stdout.write(content);
      }
    }

    const code = await proc.exited;
    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      process.exit(code);
    }
    console.log("\n✅ Iteration complete");
    return;
  }

  console.log(`🤖 Ralph Feature: ${name} - Autonomous Loop\n`);

  const state = await readState();
  if (!state) {
    console.error("❌ No state found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const max = state.maxIterations;
  console.log(`Plan: ${dir}/plan.md`);
  console.log(`Max iterations: ${max}\n`);
  console.log("Press Ctrl+C to cancel\n");

  await writeState({ ...state, status: "running", feature: name });

  for (let i = 1; i <= max; i++) {
    console.log("========================================");
    console.log(`Iteration ${i}`);
    console.log("========================================\n");

    const args = ["claude", "--permission-mode", "acceptEdits", "-p"];
    if (stream) {
      args.push("--output-format", "stream-json", "--verbose");
    }
    args.push(prompt);

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    const output: string[] = [];
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      output.push(text);

      if (stream) {
        const { content, remaining } = parseStreamJson(text, buffer);
        buffer = remaining;
        if (content) process.stdout.write(content);
      } else {
        process.stdout.write(text);
      }
    }

    const fullOutput = output.join("");
    const code = await proc.exited;
    await writeState({ ...state, iteration: i, status: "running", feature: name });

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      await writeState({ ...state, iteration: i, status: "error", feature: name });
      await notify("Ralph Error", `Claude exited with code ${code} after ${i} iterations`, "high");
      process.exit(code);
    }

    if (fullOutput.includes("<promise>COMPLETE</promise>")) {
      console.log("\n✅ Feature complete!");
      await writeState({ ...state, iteration: i, status: "completed", feature: name });
      await notify("Ralph Complete", `Feature '${name}' complete after ${i} iterations`);
      process.exit(0);
    }

    if (fullOutput.includes("<promise>STUCK</promise>")) {
      console.log("\n🛑 Claude is stuck");
      await writeState({ ...state, iteration: i, status: "stuck", feature: name });
      await notify("Ralph Stuck", `Exhausted options after ${i} iterations`, "high");
      process.exit(2);
    }

    console.log(`\n✓ Iteration ${i} complete\n`);
  }

  console.log(`\n⚠️  Max iterations (${max}) reached`);
  await writeState({ ...state, iteration: max, status: "max_iterations_reached", feature: name });
  await notify("Ralph Max Iterations", `Reached ${max} iterations`);
  process.exit(1);
}

async function backlog(args: string[]) {
  let maxIterations: number | null = null;
  let resume = false;
  let once = false;
  let stream = false;

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--once") {
      once = true;
    } else if (args[i] === "--stream") {
      stream = true;
    }
  }

  checkRepoRoot();

  const backlogData = await readBacklog();
  if (!backlogData) {
    console.error("❌ No backlog found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const progressFile = Bun.file(".ralph/progress.txt");
  if (!(await progressFile.exists())) {
    await Bun.write(progressFile, "");
  }

  if (once) {
    console.log("🔄 Ralph Backlog (single iteration)\n");
    const args = ["claude", "--permission-mode", "acceptEdits"];
    if (stream) {
      args.push("--output-format", "stream-json", "--verbose");
    }
    args.push(BACKLOG_PROMPT);
    const proc = Bun.spawn(args, {
      stdio: ["inherit", stream ? "pipe" : "inherit", "inherit"],
    });

    if (stream && proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const { content, remaining } = parseStreamJson(text, buffer);
        buffer = remaining;
        if (content) process.stdout.write(content);
      }
    }

    const code = await proc.exited;
    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      process.exit(code);
    }
    console.log("\n✅ Iteration complete");
    return;
  }

  console.log("🤖 Ralph Backlog - Autonomous Loop\n");

  const state = await readState();
  if (!state) {
    console.error("❌ No state found. Run 'ralph setup' first.");
    process.exit(1);
  }

  const max = maxIterations ?? state.maxIterations;
  let current = resume ? state.iteration : 0;

  if (resume) console.log(`📍 Resuming from iteration ${current}\n`);

  console.log(`Backlog: ${backlogData.path}`);
  console.log(`Max iterations: ${max}`);
  console.log(`Starting from: ${current + 1}\n`);
  console.log("Press Ctrl+C to cancel\n");

  await writeState({ ...state, status: "running" });

  for (let i = current + 1; i <= max; i++) {
    console.log("========================================");
    console.log(`Iteration ${i}`);
    console.log("========================================\n");

    const args = ["claude", "--permission-mode", "acceptEdits", "-p"];
    if (stream) {
      args.push("--output-format", "stream-json", "--verbose");
    }
    args.push(BACKLOG_PROMPT);

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    const output: string[] = [];
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      output.push(text);

      if (stream) {
        const { content, remaining } = parseStreamJson(text, buffer);
        buffer = remaining;
        if (content) process.stdout.write(content);
      } else {
        process.stdout.write(text);
      }
    }

    const fullOutput = output.join("");
    const code = await proc.exited;
    await writeState({ ...state, iteration: i, status: "running" });

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      await writeState({ ...state, iteration: i, status: "error" });
      await notify("Ralph Error", `Claude exited with code ${code} after ${i} iterations`, "high");
      process.exit(code);
    }

    if (fullOutput.includes("<promise>COMPLETE</promise>")) {
      console.log("\n✅ All tasks complete!");
      await writeState({ ...state, iteration: i, status: "completed" });
      await notify("Ralph Complete", `All tasks complete after ${i} iterations`);
      process.exit(0);
    }

    if (fullOutput.includes("<promise>STUCK</promise>")) {
      console.log("\n🛑 Claude is stuck");
      await writeState({ ...state, iteration: i, status: "stuck" });
      await notify("Ralph Stuck", `Exhausted options after ${i} iterations`, "high");
      process.exit(2);
    }

    console.log(`\n✓ Iteration ${i} complete\n`);
  }

  console.log(`\n⚠️  Max iterations (${max}) reached`);
  await writeState({ ...state, iteration: max, status: "max_iterations_reached" });
  await notify("Ralph Max Iterations", `Reached ${max} iterations`);
  process.exit(1);
}

async function cancel() {
  checkRepoRoot();
  console.log("🛑 Ralph Cancel\n");

  const state = await readState();
  if (!state) {
    console.log("⚠️  No Ralph state found");
    return;
  }

  console.log(`Current: ${state.status}, iteration ${state.iteration}/${state.maxIterations}\n`);

  if (state.status !== "running") {
    console.log("⚠️  Ralph is not running");
    return;
  }

  await writeState({ ...state, status: "cancelled" });
  console.log("✓ Ralph cancelled");
  console.log("\nTo resume: ralph backlog --resume");
}

async function status() {
  checkRepoRoot();
  const state = await readState();
  if (!state) {
    console.log("No Ralph state found. Run 'ralph setup' first.");
    return;
  }

  console.log("📊 Ralph Status\n");
  console.log(`Status: ${state.status}`);
  console.log(`Iteration: ${state.iteration} / ${state.maxIterations}`);
  if (state.feature) console.log(`Feature: ${state.feature}`);
  console.log(`Started: ${state.startedAt}`);

  const backlogFile = Bun.file(".ralph/backlog.json");
  if (await backlogFile.exists()) {
    const backlogData = await backlogFile.json();
    const total = backlogData.tasks?.length ?? 0;
    const done = backlogData.tasks?.filter((t: { passes: boolean }) => t.passes).length ?? 0;
    console.log(`\nBacklog: ${done}/${total} tasks complete`);
  }

  const features = await listFeatures();
  if (features.length > 0) {
    console.log(`\nFeatures: ${features.join(", ")}`);
  }
}

async function completions(args: string[]) {
  if (args.includes("--list-features")) {
    const features = await listFeatures();
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

function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
  setup              Initialize Ralph in current project
                     --max-iterations <n>  Set max iterations (default: 50)

  feature <name>     Run a feature plan from .ralph/features/<name>/
                     --once                Run single iteration only
                     --stream              Stream tokens in realtime

  backlog            Run backlog tasks from .ralph/backlog.json
                     --once                Run single iteration only
                     --stream              Stream tokens in realtime
                     --max-iterations <n>  Override max iterations
                     --resume              Resume from last iteration

  cancel             Stop running session

  status             Show current state

  completions bash   Output bash completion script
                     Install: ralph completions bash >> ~/.bashrc

  help               Show this message`);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    await setup(args);
    break;
  case "feature": {
    const name = args.find((a) => !a.startsWith("-"));
    if (!name) {
      const features = await listFeatures();
      if (features.length > 0) {
        console.error("Usage: ralph feature <name>");
        console.error(`\nAvailable features: ${features.join(", ")}`);
      } else {
        console.error("Usage: ralph feature <name>");
        console.error("\nNo features found. Create one with: /create-ralph-plan <name>");
      }
      process.exit(1);
    }
    const once = args.includes("--once");
    const stream = args.includes("--stream");
    await feature(name, once, stream);
    break;
  }
  case "backlog":
    await backlog(args);
    break;
  case "cancel":
    await cancel();
    break;
  case "status":
    await status();
    break;
  case "completions":
    await completions(args);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
}
