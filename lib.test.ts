import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  getStateFile,
  getFeatureDir,
  getFeaturePrompt,
  readState,
  writeState,
  readBacklog,
  listFeatures,
  BACKLOG_PROMPT,
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
    expect(prompt).toContain("<promise>COMPLETE</promise>");
    expect(prompt).toContain("<promise>STUCK</promise>");
  });
});

describe("BACKLOG_PROMPT", () => {
  test("contains backlog file references", () => {
    expect(BACKLOG_PROMPT).toContain("@.ralph/backlog.json");
    expect(BACKLOG_PROMPT).toContain("@.ralph/progress.txt");
  });

  test("contains required instructions", () => {
    expect(BACKLOG_PROMPT).toContain("bun run lint:fix");
    expect(BACKLOG_PROMPT).toContain("bun run check-types");
    expect(BACKLOG_PROMPT).toContain("bun run test");
    expect(BACKLOG_PROMPT).toContain("<promise>COMPLETE</promise>");
    expect(BACKLOG_PROMPT).toContain("<promise>STUCK</promise>");
  });

  test("mentions git workflow", () => {
    expect(BACKLOG_PROMPT).toContain("gt create");
    expect(BACKLOG_PROMPT).toContain("gt modify");
    expect(BACKLOG_PROMPT).toContain("gt submit");
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
});
