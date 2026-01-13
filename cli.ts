#!/usr/bin/env bun

import { autoUpdate } from "./src/auto-update";

await autoUpdate();
import { $ } from "bun";
import {
  notify,
  checkRepoRoot,
  readState,
  writeState,
  readBacklog,
  getFeatureDir,
  listFeatures,
  listOpenFeatures,
  getBacklogPrompt,
  getFeaturePrompt,
  readConfig,
  writeConfig,
  readTasksFile,
  getIncompleteTaskTitles,
  hasOpenTasks,
  appendToLog,
} from "./lib";
import { watch, type FSWatcher } from "fs";
import { c } from "./src/colors";
import { StreamFormatter } from "./src/formatter";

const BASH_COMPLETION_SCRIPT = `# Ralph CLI bash completion
# Install: ralph completions bash >> ~/.bashrc

_ralph_completions() {
  local cur prev words cword
  _init_completion || return

  local commands="setup feature backlog cancel status list watch help completions"

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
    cancel|status|list|help) return ;;
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

  const configFile = Bun.file(".ralph/config.json");
  if (!(await configFile.exists())) {
    await writeConfig({ vcs: "git" });
    console.log("📝 Created .ralph/config.json (vcs: git)");
  }

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

async function feature(name: string, once: boolean) {
  checkRepoRoot();

  const config = await readConfig();
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

  const prompt = getFeaturePrompt(name, config.vcs);

  if (once) {
    console.log(`🔄 Ralph Feature: ${name} (single iteration)\n`);
    await appendToLog(name, `\n${"=".repeat(60)}\nSession Start - Single Iteration\n${"=".repeat(60)}\n`);
    const args = ["claude", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose", prompt];
    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const formatter = new StreamFormatter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      await appendToLog(name, text);
      const { output } = formatter.parse(text);
      if (output) process.stdout.write(output);
    }
    const remaining = formatter.flush();
    if (remaining) process.stdout.write(remaining);

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
    console.log(`${c.dim}════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}Iteration ${i}${c.reset}`);
    console.log(`${c.dim}════════════════════════════════════════${c.reset}\n`);

    await appendToLog(name, `\n${"=".repeat(60)}\nSession Start - Iteration ${i}\n${"=".repeat(60)}\n`);

    const args = ["claude", "--dangerously-skip-permissions", "-p", "--output-format", "stream-json", "--verbose", prompt];

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const rawOutput: string[] = [];
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const formatter = new StreamFormatter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      rawOutput.push(text);
      await appendToLog(name, text);

      const { output } = formatter.parse(text);
      if (output) process.stdout.write(output);
    }
    const remaining = formatter.flush();
    if (remaining) process.stdout.write(remaining);

    const code = await proc.exited;
    const assistantText = formatter.getAssistantText();
    await writeState({ ...state, iteration: i, status: "running", feature: name });

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      await writeState({ ...state, iteration: i, status: "error", feature: name });
      await notify("Ralph Error", `Claude exited with code ${code} after ${i} iterations`, "high");
      process.exit(code);
    }

    // Check if all tasks are complete by reading the JSON file
    const taskFile = await readTasksFile(`${dir}/tasks.json`);
    if (taskFile && !hasOpenTasks(taskFile)) {
      console.log("\n✅ Feature complete!");
      await writeState({ ...state, iteration: i, status: "completed", feature: name });
      await notify("Ralph Complete", `Feature '${name}' complete after ${i} iterations`);
      process.exit(0);
    }

    if (assistantText.includes("<promise>STUCK</promise>")) {
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

  for (let i = 0; i < args.length; i++) {
    const nextArg = args[i + 1];
    if (args[i] === "--max-iterations" && nextArg) {
      maxIterations = parseInt(nextArg, 10);
      i++;
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--once") {
      once = true;
    }
  }

  checkRepoRoot();

  const config = await readConfig();
  const backlogPrompt = getBacklogPrompt(config.vcs);

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
    await appendToLog(undefined, `\n${"=".repeat(60)}\nSession Start - Single Iteration\n${"=".repeat(60)}\n`);
    const args = ["claude", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose", backlogPrompt];
    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const formatter = new StreamFormatter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      await appendToLog(undefined, text);
      const { output } = formatter.parse(text);
      if (output) process.stdout.write(output);
    }
    const remaining = formatter.flush();
    if (remaining) process.stdout.write(remaining);

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
    console.log(`${c.dim}════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}Iteration ${i}${c.reset}`);
    console.log(`${c.dim}════════════════════════════════════════${c.reset}\n`);

    await appendToLog(undefined, `\n${"=".repeat(60)}\nSession Start - Iteration ${i}\n${"=".repeat(60)}\n`);

    const args = ["claude", "--dangerously-skip-permissions", "-p", "--output-format", "stream-json", "--verbose", backlogPrompt];

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const rawOutput: string[] = [];
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const formatter = new StreamFormatter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      rawOutput.push(text);
      await appendToLog(undefined, text);

      const { output } = formatter.parse(text);
      if (output) process.stdout.write(output);
    }
    const remaining = formatter.flush();
    if (remaining) process.stdout.write(remaining);

    const code = await proc.exited;
    const assistantText = formatter.getAssistantText();
    await writeState({ ...state, iteration: i, status: "running" });

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      await writeState({ ...state, iteration: i, status: "error" });
      await notify("Ralph Error", `Claude exited with code ${code} after ${i} iterations`, "high");
      process.exit(code);
    }

    // Check if all tasks are complete by reading the JSON file
    const backlogTaskFile = await readTasksFile(".ralph/backlog.json");
    if (backlogTaskFile && !hasOpenTasks(backlogTaskFile)) {
      console.log("\n✅ All tasks complete!");
      await writeState({ ...state, iteration: i, status: "completed" });
      await notify("Ralph Complete", `All tasks complete after ${i} iterations`);
      process.exit(0);
    }

    if (assistantText.includes("<promise>STUCK</promise>")) {
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

async function watchMode(stream: boolean) {
  checkRepoRoot();

  const stateFile = Bun.file(".ralph/state.json");
  if (!(await stateFile.exists())) {
    console.error("❌ No .ralph directory found. Run 'ralph setup' first.");
    process.exit(1);
  }

  // Discover all watch targets
  const watchTargets: Map<string, string[]> = new Map();
  const watchers: FSWatcher[] = [];
  let isRunning = false;

  const backlogPath = ".ralph/backlog.json";
  const backlogFile = Bun.file(backlogPath);
  if (await backlogFile.exists()) {
    const taskFile = await readTasksFile(backlogPath);
    if (taskFile) {
      watchTargets.set(backlogPath, getIncompleteTaskTitles(taskFile));
    }
  }

  const features = await listFeatures();
  for (const name of features) {
    const tasksPath = `.ralph/features/${name}/tasks.json`;
    const taskFile = await readTasksFile(tasksPath);
    if (taskFile && hasOpenTasks(taskFile)) {
      watchTargets.set(tasksPath, getIncompleteTaskTitles(taskFile));
    }
  }

  if (watchTargets.size === 0) {
    console.error("❌ No files to watch. Create a backlog or feature first.");
    process.exit(1);
  }

  console.log("👀 Ralph Watch Mode\n");
  console.log("Watching:");
  for (const path of watchTargets.keys()) {
    console.log(`  - ${path}`);
  }
  console.log("\nPress Ctrl+C to stop\n");

  // Debounce timers per file
  const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  async function checkForNewTasks(changedPath: string) {
    if (isRunning) return;

    const taskFile = await readTasksFile(changedPath);
    if (!taskFile) {
      // File was deleted or invalid - remove from watch targets
      watchTargets.delete(changedPath);
      return;
    }

    const newTitles = getIncompleteTaskTitles(taskFile);
    const oldTitles = watchTargets.get(changedPath) || [];

    // Find tasks that are in newTitles but not in oldTitles
    const addedTasks = newTitles.filter((t) => !oldTitles.includes(t));

    if (addedTasks.length > 0) {
      console.log(`\n📝 New tasks detected in ${changedPath}:`);
      for (const task of addedTasks) {
        console.log(`  + ${task}`);
      }

      isRunning = true;

      // Determine which command to run
      let command: string[];
      if (changedPath === backlogPath) {
        command = ["ralph", "backlog"];
      } else {
        // Extract feature name from path like .ralph/features/<name>/tasks.json
        const match = changedPath.match(/\.ralph\/features\/([^/]+)\/tasks\.json/);
        if (!match || !match[1]) {
          console.error(`❌ Could not parse feature name from ${changedPath}`);
          isRunning = false;
          watchTargets.set(changedPath, newTitles);
          return;
        }
        command = ["ralph", "feature", match[1]];
      }

      if (stream) {
        command.push("--stream");
      }

      console.log(`\n🚀 Running: ${command.join(" ")}\n`);

      const proc = Bun.spawn(command, {
        stdio: ["inherit", "inherit", "inherit"],
      });

      await proc.exited;

      // Update baseline after run completes
      const updatedTaskFile = await readTasksFile(changedPath);
      if (updatedTaskFile) {
        watchTargets.set(changedPath, getIncompleteTaskTitles(updatedTaskFile));
      }

      isRunning = false;
      console.log("\n👀 Watching for new tasks...\n");
    } else {
      // No new tasks, just update baseline silently
      watchTargets.set(changedPath, newTitles);
    }
  }

  function setupWatcher(filePath: string) {
    try {
      const watcher = watch(filePath, () => {
        // Clear existing debounce timer
        const existingTimer = debounceTimers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Set new debounce timer (1 second)
        const timer = setTimeout(() => {
          checkForNewTasks(filePath);
          debounceTimers.delete(filePath);
        }, 1000);

        debounceTimers.set(filePath, timer);
      });

      watchers.push(watcher);
      return watcher;
    } catch {
      console.error(`⚠️  Could not watch ${filePath}`);
      return null;
    }
  }

  // Set up watchers for all targets
  for (const path of watchTargets.keys()) {
    setupWatcher(path);
  }

  // Periodic rescan for new features (every 10 seconds)
  const rescanInterval = setInterval(async () => {
    if (isRunning) return;

    const currentFeatures = await listFeatures();
    for (const name of currentFeatures) {
      const tasksPath = `.ralph/features/${name}/tasks.json`;
      if (!watchTargets.has(tasksPath)) {
        const taskFile = await readTasksFile(tasksPath);
        if (taskFile && hasOpenTasks(taskFile)) {
          console.log(`📁 New feature discovered: ${name}`);
          watchTargets.set(tasksPath, getIncompleteTaskTitles(taskFile));
          setupWatcher(tasksPath);
        }
      }
    }

    // Check if backlog was created
    if (!watchTargets.has(backlogPath)) {
      const backlog = Bun.file(backlogPath);
      if (await backlog.exists()) {
        const taskFile = await readTasksFile(backlogPath);
        if (taskFile) {
          console.log("📁 Backlog discovered");
          watchTargets.set(backlogPath, getIncompleteTaskTitles(taskFile));
          setupWatcher(backlogPath);
        }
      }
    }
  }, 10000);

  // Handle graceful shutdown
  const cleanup = () => {
    console.log("\n🛑 Stopping watch mode...");
    clearInterval(rescanInterval);
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    for (const watcher of watchers) {
      watcher.close();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process running
  await new Promise(() => {});
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

interface Task {
  title: string;
  description?: string;
  acceptance?: string[];
  branch?: string;
  passes: boolean;
}

async function list() {
  checkRepoRoot();

  const BOX_WIDTH = 45;
  const header = (title: string) => {
    const padding = Math.max(0, BOX_WIDTH - 2 - title.length);
    const left = Math.floor(padding / 2);
    const right = padding - left;
    console.log(`${c.dim}┌${"─".repeat(BOX_WIDTH)}┐${c.reset}`);
    console.log(`${c.dim}│${c.reset}${" ".repeat(left)}${c.cyan}${c.bold}${title}${c.reset}${" ".repeat(right)}${c.dim}│${c.reset}`);
    console.log(`${c.dim}└${"─".repeat(BOX_WIDTH)}┘${c.reset}`);
  };

  // Status section
  const state = await readState();
  header("Ralph Status");

  if (state) {
    const statusIcon =
      state.status === "running" ? "🟢" :
      state.status === "completed" ? "✅" :
      state.status === "error" || state.status === "stuck" ? "🔴" :
      "⚪";
    console.log(`  ${statusIcon} ${state.status}`);
    if (state.status === "running" && state.feature) {
      console.log(`     ${c.dim}Working on:${c.reset} ${c.cyan}${state.feature}${c.reset}`);
    }
    console.log(`     ${c.dim}Iteration:${c.reset} ${state.iteration}/${state.maxIterations}`);
  } else {
    console.log(`  ⚪ ${c.dim}Not initialized (run 'ralph setup')${c.reset}`);
  }

  // Backlog section
  console.log();
  header("Backlog Tasks");

  const backlogFile = Bun.file(".ralph/backlog.json");
  if (await backlogFile.exists()) {
    const backlogData = await backlogFile.json();
    const tasks: Task[] = backlogData.tasks ?? [];
    const openTasks = tasks.filter((t) => !t.passes);
    const completedCount = tasks.length - openTasks.length;

    if (openTasks.length === 0) {
      console.log(`  ${c.green}✅ All tasks complete!${c.reset}`);
    } else {
      for (const task of openTasks) {
        console.log(`  ○ ${task.title}`);
        if (task.branch) {
          console.log(`    ${c.dim}└─ branch: ${task.branch}${c.reset}`);
        }
      }
    }
    console.log();
    console.log(`  ${c.dim}${completedCount}/${tasks.length} tasks completed${c.reset}`);
  } else {
    console.log(`  ${c.dim}No backlog found${c.reset}`);
  }

  // Collect feature metadata
  interface FeatureInfo {
    name: string;
    tasks: Task[];
    openTasks: Task[];
    isDone: boolean;
    isActive: boolean;
    birthtime: Date;
  }

  const featureNames = await listFeatures();
  const features: FeatureInfo[] = [];

  for (const name of featureNames) {
    const tasksPath = `.ralph/features/${name}/tasks.json`;
    const tasksFile = Bun.file(tasksPath);
    if (await tasksFile.exists()) {
      const data = await tasksFile.json();
      const tasks: Task[] = data.tasks ?? [];
      const openTasks = tasks.filter((t) => !t.passes);
      const isActive = state?.feature === name && state?.status === "running";

      // Get file birthtime for sorting
      const stat = await Bun.$`stat -c %W ${tasksPath}`.text();
      const birthtime = new Date(parseInt(stat.trim()) * 1000);

      features.push({
        name,
        tasks,
        openTasks,
        isDone: openTasks.length === 0,
        isActive,
        birthtime,
      });
    }
  }

  // Sort by birthtime descending (most recent first)
  features.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());

  const activeFeatures = features.filter((f) => !f.isDone);
  const doneFeatures = features.filter((f) => f.isDone);

  // Active features section
  console.log();
  header("Features (Active)");

  if (activeFeatures.length === 0) {
    console.log(`  ${c.dim}No active features${c.reset}`);
  } else {
    for (const feature of activeFeatures) {
      const icon = feature.isActive ? "🔄" : "📋";
      const done = feature.tasks.length - feature.openTasks.length;
      const total = feature.tasks.length;
      const progress = `${c.dim}${done}/${total} done${c.reset}`;

      console.log(`  ${icon} ${c.bold}${feature.name}${c.reset}  ${progress}`);
      for (const task of feature.tasks) {
        if (task.passes) {
          console.log(`     ${c.green}✓${c.reset} ${c.dim}${task.title}${c.reset}`);
        } else {
          console.log(`     ○ ${task.title}`);
        }
      }
    }
  }

  // Done features section
  console.log();
  header("Features (Done)");

  if (doneFeatures.length === 0) {
    console.log(`  ${c.dim}No completed features${c.reset}`);
  } else {
    for (const feature of doneFeatures) {
      console.log(`  ${c.green}✅ ${feature.name}${c.reset}`);
    }
  }
}

async function completions(args: string[]) {
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

function help() {
  console.log(`Ralph - Autonomous Claude Code Runner

Usage: ralph <command> [options]

Commands:
  setup              Initialize Ralph in current project
                     --max-iterations <n>  Set max iterations (default: 50)

  feature <name>     Run a feature plan from .ralph/features/<name>/
                     --once                Run single iteration only

  backlog            Run backlog tasks from .ralph/backlog.json
                     --once                Run single iteration only
                     --max-iterations <n>  Override max iterations
                     --resume              Resume from last iteration

  cancel             Stop running session

  status             Show current state

  list               List open backlog tasks, features, and status

  watch              Watch for new tasks and auto-run ralph
                     --stream              Stream Claude output in realtime

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
    await feature(name, once);
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
  case "list":
    await list();
    break;
  case "watch": {
    const stream = args.includes("--stream");
    await watchMode(stream);
    break;
  }
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
