import { watch, type FSWatcher } from "fs";
import {
  checkRepoRoot,
  listFeatures,
  readTasksFile,
  getIncompleteTaskTitles,
  hasOpenTasks,
} from "../../lib";

export async function watchMode(args: string[]) {
  const stream = args.includes("--stream");
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
