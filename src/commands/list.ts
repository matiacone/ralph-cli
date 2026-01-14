import { $ } from "bun";
import { checkRepoRoot, readState, listFeatures } from "../../lib";
import { c } from "../colors";

interface Task {
  title: string;
  description?: string;
  acceptance?: string[];
  branch?: string;
  passes: boolean;
}

export async function list() {
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
      const stat = await $`stat -c %W ${tasksPath}`.text();
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
