import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  getStateFile,
  getRunPrompt,
  readState,
  writeState,
  readConfig,
  writeConfig,
  checkRepoRoot,
} from "./lib";

describe("getStateFile", () => {
  test("returns correct path", () => {
    expect(getStateFile()).toBe(".ralph/state.json");
  });
});

describe("prompt functions", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "ralph-prompt-test-"));
    process.chdir(tempDir);
    await Bun.$`mkdir -p .ralph/prompts`.quiet();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("getRunPrompt", () => {
    test("returns prompt from run.md file", async () => {
      await Bun.write(".ralph/prompts/run.md", "Work through GitHub issues.");
      const prompt = await getRunPrompt();
      expect(prompt).toContain("Work through GitHub issues.");
    });

    test("creates default run.md when file does not exist", async () => {
      const prompt = await getRunPrompt();
      expect(prompt).toContain("gh issue list");
      // Verify the file was created
      const exists = await Bun.file(".ralph/prompts/run.md").exists();
      expect(exists).toBe(true);
    });
  });
});

describe("file operations", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "ralph-test-"));
    process.chdir(tempDir);
    await Bun.$`mkdir -p .ralph`.quiet();
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

  describe("readConfig", () => {
    test("returns empty object when config file does not exist", async () => {
      const result = await readConfig();
      expect(result).toEqual({});
    });

    test("returns parsed config when file exists", async () => {
      const config = { models: { feature: "opus" as const }, services: [] };
      await Bun.write(".ralph/config.json", JSON.stringify(config));

      const result = await readConfig();
      expect(result).toEqual(config);
    });
  });

  describe("writeConfig", () => {
    test("writes config with 2-space indentation", async () => {
      const config = { models: { feature: "sonnet" as const } };
      await writeConfig(config);

      const content = await Bun.file(".ralph/config.json").text();
      expect(content).toBe(JSON.stringify(config, null, 2));
    });

    test("roundtrips through readConfig", async () => {
      const config = {
        models: { feature: "haiku" as const },
        services: [{ name: "dev", command: "npm", args: ["run", "dev"] }],
      };
      await writeConfig(config);
      const result = await readConfig();
      expect(result).toEqual(config);
    });
  });
});
