import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  getStateFile,
  getFeatureDir,
  getFeaturePrompt,
  getBacklogPrompt,
  readState,
  writeState,
  readBacklog,
  listFeatures,
  readTasksFile,
  getIncompleteTaskTitles,
  getQueuePath,
  readQueue,
  addToQueue,
  popQueue,
  isRalphRunning,
} from "./lib";

describe("getStateFile", () => {
  test("returns correct path", () => {
    expect(getStateFile()).toBe(".ralph/state.json");
  });
});

describe("getFeatureDir", () => {
  test("returns correct path for feature name", () => {
    expect(getFeatureDir("auth")).toBe(".ralph/features/auth");
  });

  test("handles feature names with special characters", () => {
    expect(getFeatureDir("my-feature")).toBe(".ralph/features/my-feature");
  });
});

describe("getFeaturePrompt", () => {
  test("returns prompt containing feature directory", () => {
    const prompt = getFeaturePrompt("auth");
    expect(prompt).toContain("@.ralph/features/auth/plan.md");
    expect(prompt).toContain("@.ralph/features/auth/tasks.json");
    expect(prompt).toContain("@.ralph/features/auth/progress.txt");
  });

  test("contains required instructions", () => {
    const prompt = getFeaturePrompt("test");
    expect(prompt).toContain("bun run lint:fix");
    expect(prompt).toContain("bun run check-types");
    expect(prompt).toContain("bun run test");
    expect(prompt).toContain("<promise>STUCK</promise>");
  });

  test("uses git commands by default", () => {
    const prompt = getFeaturePrompt("test");
    expect(prompt).toContain("git checkout -b");
    expect(prompt).toContain("git push");
    expect(prompt).toContain("gh pr create");
  });

  test("uses graphite commands when vcs is graphite", () => {
    const prompt = getFeaturePrompt("test", "graphite");
    expect(prompt).toContain("gt create");
    expect(prompt).toContain("gt modify");
    expect(prompt).toContain("gt submit");
  });
});

describe("getBacklogPrompt", () => {
  test("contains backlog file references", () => {
    const prompt = getBacklogPrompt();
    expect(prompt).toContain("@.ralph/backlog.json");
    expect(prompt).toContain("@.ralph/progress.txt");
  });

  test("contains required instructions", () => {
    const prompt = getBacklogPrompt();
    expect(prompt).toContain("bun run lint:fix");
    expect(prompt).toContain("bun run check-types");
    expect(prompt).toContain("bun run test");
    expect(prompt).toContain("<promise>STUCK</promise>");
  });

  test("uses git commands by default", () => {
    const prompt = getBacklogPrompt();
    expect(prompt).toContain("git checkout -b");
    expect(prompt).toContain("git push");
    expect(prompt).toContain("gh pr create");
  });

  test("uses graphite commands when vcs is graphite", () => {
    const prompt = getBacklogPrompt("graphite");
    expect(prompt).toContain("gt create");
    expect(prompt).toContain("gt modify");
    expect(prompt).toContain("gt submit");
  });
});

describe("file operations", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "ralph-test-"));
    process.chdir(tempDir);
    await Bun.$`mkdir -p .ralph/features`.quiet();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("readState", () => {
    test("returns null when state file does not exist", async () => {
      const result = await readState();
      expect(result).toBeNull();
    });

    test("returns parsed JSON when state file exists", async () => {
      const state = { iteration: 5, status: "running" };
      await Bun.write(".ralph/state.json", JSON.stringify(state));

      const result = await readState();
      expect(result).toEqual(state);
    });
  });

  describe("writeState", () => {
    test("writes state to correct file", async () => {
      const state = { iteration: 3, status: "completed" };
      await writeState(state);

      const content = await Bun.file(".ralph/state.json").text();
      expect(JSON.parse(content)).toEqual(state);
    });

    test("formats JSON with 2-space indentation", async () => {
      const state = { a: 1, b: 2 };
      await writeState(state);

      const content = await Bun.file(".ralph/state.json").text();
      expect(content).toBe(JSON.stringify(state, null, 2));
    });
  });

  describe("readBacklog", () => {
    test("returns null when backlog does not exist", async () => {
      const result = await readBacklog();
      expect(result).toBeNull();
    });

    test("returns path and file when backlog exists", async () => {
      await Bun.write(".ralph/backlog.json", JSON.stringify({ tasks: [] }));

      const result = await readBacklog();
      expect(result).not.toBeNull();
      expect(result?.path).toBe(".ralph/backlog.json");
      expect(result?.file).toBeDefined();
    });
  });

  describe("listFeatures", () => {
    test("returns empty array when no features exist", async () => {
      const result = await listFeatures();
      expect(result).toEqual([]);
    });

    test("returns feature names when features exist", async () => {
      await Bun.$`mkdir -p .ralph/features/auth`.quiet();
      await Bun.$`mkdir -p .ralph/features/payments`.quiet();
      await Bun.write(".ralph/features/auth/tasks.json", "{}");
      await Bun.write(".ralph/features/payments/tasks.json", "{}");

      const result = await listFeatures();
      expect(result.sort()).toEqual(["auth", "payments"]);
    });

    test("only returns features with tasks.json", async () => {
      await Bun.$`mkdir -p .ralph/features/complete`.quiet();
      await Bun.$`mkdir -p .ralph/features/incomplete`.quiet();
      await Bun.write(".ralph/features/complete/tasks.json", "{}");

      const result = await listFeatures();
      expect(result).toEqual(["complete"]);
    });
  });

  describe("readTasksFile", () => {
    test("returns null when file does not exist", async () => {
      const result = await readTasksFile(".ralph/nonexistent.json");
      expect(result).toBeNull();
    });

    test("returns parsed JSON when file exists", async () => {
      const tasks = {
        tasks: [
          { title: "Task 1", passes: false },
          { title: "Task 2", passes: true },
        ],
      };
      await Bun.write(".ralph/backlog.json", JSON.stringify(tasks));

      const result = await readTasksFile(".ralph/backlog.json");
      expect(result).toEqual(tasks);
    });

    test("returns null for invalid JSON", async () => {
      await Bun.write(".ralph/backlog.json", "not valid json");

      const result = await readTasksFile(".ralph/backlog.json");
      expect(result).toBeNull();
    });
  });

  describe("getIncompleteTaskTitles", () => {
    test("returns empty array when all tasks complete", () => {
      const taskFile = {
        tasks: [
          { title: "Task 1", passes: true },
          { title: "Task 2", passes: true },
        ],
      };

      const result = getIncompleteTaskTitles(taskFile);
      expect(result).toEqual([]);
    });

    test("returns incomplete task titles sorted", () => {
      const taskFile = {
        tasks: [
          { title: "Zebra task", passes: false },
          { title: "Alpha task", passes: true },
          { title: "Beta task", passes: false },
        ],
      };

      const result = getIncompleteTaskTitles(taskFile);
      expect(result).toEqual(["Beta task", "Zebra task"]);
    });

    test("returns all titles when none complete", () => {
      const taskFile = {
        tasks: [
          { title: "First", passes: false },
          { title: "Second", passes: false },
        ],
      };

      const result = getIncompleteTaskTitles(taskFile);
      expect(result).toEqual(["First", "Second"]);
    });
  });

  describe("getQueuePath", () => {
    test("returns correct path", () => {
      expect(getQueuePath()).toBe(".ralph/queue.json");
    });
  });

  describe("readQueue", () => {
    test("returns empty array when queue file does not exist", async () => {
      const result = await readQueue();
      expect(result).toEqual([]);
    });

    test("returns items when queue file exists", async () => {
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["foo", "bar"] }));
      const result = await readQueue();
      expect(result).toEqual(["foo", "bar"]);
    });

    test("returns empty array for invalid JSON", async () => {
      await Bun.write(".ralph/queue.json", "not valid json");
      const result = await readQueue();
      expect(result).toEqual([]);
    });

    test("returns empty array when items field is missing", async () => {
      await Bun.write(".ralph/queue.json", JSON.stringify({}));
      const result = await readQueue();
      expect(result).toEqual([]);
    });
  });

  describe("addToQueue", () => {
    test("creates queue file and adds item when file does not exist", async () => {
      await addToQueue("feature-a");
      const result = await readQueue();
      expect(result).toEqual(["feature-a"]);
    });

    test("appends to existing queue", async () => {
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["first"] }));
      await addToQueue("second");
      const result = await readQueue();
      expect(result).toEqual(["first", "second"]);
    });
  });

  describe("popQueue", () => {
    test("returns null when queue is empty", async () => {
      const result = await popQueue();
      expect(result).toBeNull();
    });

    test("returns null when queue file does not exist", async () => {
      const result = await popQueue();
      expect(result).toBeNull();
    });

    test("removes and returns first item", async () => {
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["a", "b", "c"] }));
      const result = await popQueue();
      expect(result).toBe("a");
      const remaining = await readQueue();
      expect(remaining).toEqual(["b", "c"]);
    });

    test("empties queue when last item is popped", async () => {
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["only"] }));
      const result = await popQueue();
      expect(result).toBe("only");
      const remaining = await readQueue();
      expect(remaining).toEqual([]);
    });
  });

  describe("isRalphRunning", () => {
    test("returns false when state file does not exist", async () => {
      const result = await isRalphRunning();
      expect(result).toBe(false);
    });

    test("returns true when status is 'running'", async () => {
      await Bun.write(".ralph/state.json", JSON.stringify({ status: "running" }));
      const result = await isRalphRunning();
      expect(result).toBe(true);
    });

    test("returns false when status is not 'running'", async () => {
      await Bun.write(".ralph/state.json", JSON.stringify({ status: "completed" }));
      const result = await isRalphRunning();
      expect(result).toBe(false);
    });

    test("returns false when status field is missing", async () => {
      await Bun.write(".ralph/state.json", JSON.stringify({ iteration: 5 }));
      const result = await isRalphRunning();
      expect(result).toBe(false);
    });
  });

  describe("queue-when-busy workflow", () => {
    test("simulates feature command queueing when Ralph is running", async () => {
      // Set up a feature
      await Bun.$`mkdir -p .ralph/features/test-feature`.quiet();
      await Bun.write(".ralph/features/test-feature/tasks.json", JSON.stringify({ tasks: [] }));

      // Set Ralph as running
      await Bun.write(".ralph/state.json", JSON.stringify({ status: "running", feature: "other-feature" }));

      // Verify Ralph is running
      const running = await isRalphRunning();
      expect(running).toBe(true);

      // Queue the feature (simulating what feature command does)
      await addToQueue("test-feature");

      // Verify it was queued
      const queue = await readQueue();
      expect(queue).toEqual(["test-feature"]);
    });

    test("simulates multiple features being queued in order", async () => {
      // Set Ralph as running
      await Bun.write(".ralph/state.json", JSON.stringify({ status: "running" }));

      // Queue multiple features
      await addToQueue("feature-a");
      await addToQueue("feature-b");
      await addToQueue("feature-c");

      // Verify queue order
      const queue = await readQueue();
      expect(queue).toEqual(["feature-a", "feature-b", "feature-c"]);
    });

    test("simulates feature not being queued when Ralph is not running", async () => {
      // Ralph is not running (no state file)
      const running = await isRalphRunning();
      expect(running).toBe(false);

      // Queue should be empty (feature would proceed to run instead of queueing)
      const queue = await readQueue();
      expect(queue).toEqual([]);
    });
  });

  describe("queue processing after completion", () => {
    test("popQueue removes item from queue when called", async () => {
      // Set up queue with multiple features
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["next-feature", "after-that"] }));

      // Pop the first item (this simulates what runNextFromQueue does)
      const next = await popQueue();
      expect(next).toBe("next-feature");

      // Verify queue was updated
      const remaining = await readQueue();
      expect(remaining).toEqual(["after-that"]);
    });

    test("popQueue returns null when queue is empty after completion", async () => {
      // Empty queue
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: [] }));

      const next = await popQueue();
      expect(next).toBeNull();
    });

    test("simulates full queue processing cycle", async () => {
      // Queue starts with two features
      await Bun.write(".ralph/queue.json", JSON.stringify({ items: ["feature-1", "feature-2"] }));

      // First feature completes, pop next
      const first = await popQueue();
      expect(first).toBe("feature-1");
      expect(await readQueue()).toEqual(["feature-2"]);

      // Second feature completes, pop next
      const second = await popQueue();
      expect(second).toBe("feature-2");
      expect(await readQueue()).toEqual([]);

      // No more in queue
      const third = await popQueue();
      expect(third).toBeNull();
    });
  });
});
