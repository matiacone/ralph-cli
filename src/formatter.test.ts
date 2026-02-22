import { describe, test, expect, beforeEach } from "bun:test";
import { StreamFormatter } from "./formatter";

function jsonLine(obj: object): string {
  return JSON.stringify(obj) + "\n";
}

function assistantEvent(content: Array<object>) {
  return jsonLine({ type: "assistant", message: { content } });
}

function textEvent(text: string) {
  return assistantEvent([{ type: "text", text }]);
}

function toolUseEvent(name: string, input: Record<string, unknown>, id?: string) {
  return assistantEvent([{ type: "tool_use", name, input, id: id ?? `tool_${name}` }]);
}

function toolResultEvent(toolUseId: string, content: string) {
  return jsonLine({
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    },
  });
}

function resultEvent() {
  return jsonLine({ type: "result", subtype: "success" });
}

describe("StreamFormatter", () => {
  let formatter: StreamFormatter;

  beforeEach(() => {
    formatter = new StreamFormatter();
  });

  describe("parse", () => {
    test("extracts assistant text from stream events", () => {
      const { output } = formatter.parse(textEvent("Hello world\n"));
      expect(output).toContain("Hello world");
    });

    test("accumulates assistant text across multiple events", () => {
      formatter.parse(textEvent("first "));
      formatter.parse(textEvent("second\n"));
      expect(formatter.getAssistantText()).toBe("first second\n");
    });

    test("skips non-JSON lines gracefully", () => {
      const { output } = formatter.parse("not json\n" + textEvent("valid\n"));
      expect(output).toContain("valid");
    });

    test("buffers incomplete lines across parse calls", () => {
      const full = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "buffered\n" }] } });
      const half1 = full.slice(0, 30);
      const half2 = full.slice(30) + "\n";

      formatter.parse(half1);
      const { output } = formatter.parse(half2);
      expect(output).toContain("buffered");
    });

    test("shows separator on result success", () => {
      const { output } = formatter.parse(resultEvent());
      expect(output).toContain("───");
    });
  });

  describe("tool use formatting", () => {
    test("displays tool name for Read with file path", () => {
      const { output } = formatter.parse(
        toolUseEvent("Read", { file_path: "/src/index.ts" })
      );
      expect(output).toContain("Read");
      expect(output).toContain("/src/index.ts");
    });

    test("displays tool name for Write with file path", () => {
      const { output } = formatter.parse(
        toolUseEvent("Write", { file_path: "/src/new.ts" })
      );
      expect(output).toContain("Write");
      expect(output).toContain("/src/new.ts");
    });

    test("displays tool name for Edit with file path", () => {
      const { output } = formatter.parse(
        toolUseEvent("Edit", { file_path: "/src/edit.ts" })
      );
      expect(output).toContain("Edit");
      expect(output).toContain("/src/edit.ts");
    });

    test("displays Bash with description when available", () => {
      const { output } = formatter.parse(
        toolUseEvent("Bash", { command: "npm test", description: "Run tests" })
      );
      expect(output).toContain("Bash");
      expect(output).toContain("Run tests");
    });

    test("displays Bash with truncated command when no description", () => {
      const longCmd = "a".repeat(100);
      const { output } = formatter.parse(
        toolUseEvent("Bash", { command: longCmd })
      );
      expect(output).toContain("Bash");
      expect(output).toContain("...");
    });

    test("displays Grep with pattern", () => {
      const { output } = formatter.parse(
        toolUseEvent("Grep", { pattern: "TODO", path: "src/" })
      );
      expect(output).toContain("Grep");
      expect(output).toContain("/TODO/");
      expect(output).toContain("src/");
    });

    test("displays Glob with pattern", () => {
      const { output } = formatter.parse(
        toolUseEvent("Glob", { pattern: "**/*.ts" })
      );
      expect(output).toContain("Glob");
      expect(output).toContain("**/*.ts");
    });

    test("displays Task with description", () => {
      const { output } = formatter.parse(
        toolUseEvent("Task", { description: "Research auth" })
      );
      expect(output).toContain("Task");
      expect(output).toContain("Research auth");
    });

    test("displays WebFetch with URL", () => {
      const { output } = formatter.parse(
        toolUseEvent("WebFetch", { url: "https://example.com" })
      );
      expect(output).toContain("WebFetch");
      expect(output).toContain("https://example.com");
    });

    test("displays WebSearch with query", () => {
      const { output } = formatter.parse(
        toolUseEvent("WebSearch", { query: "bun runtime" })
      );
      expect(output).toContain("WebSearch");
      expect(output).toContain("bun runtime");
    });
  });

  describe("tool result formatting", () => {
    test("Read result shows line count", () => {
      formatter.parse(toolUseEvent("Read", { file_path: "f.ts" }, "r1"));
      const { output } = formatter.parse(
        toolResultEvent("r1", "line1\nline2\nline3")
      );
      expect(output).toContain("3 lines");
    });

    test("Read result shows empty for no content", () => {
      formatter.parse(toolUseEvent("Read", { file_path: "f.ts" }, "r1"));
      const { output } = formatter.parse(toolResultEvent("r1", ""));
      expect(output).toContain("empty");
    });

    test("Grep result shows file count", () => {
      formatter.parse(toolUseEvent("Grep", { pattern: "x" }, "g1"));
      const { output } = formatter.parse(
        toolResultEvent("g1", "file1.ts\nfile2.ts")
      );
      expect(output).toContain("2 files");
    });

    test("Grep result shows singular for one file", () => {
      formatter.parse(toolUseEvent("Grep", { pattern: "x" }, "g1"));
      const { output } = formatter.parse(toolResultEvent("g1", "file1.ts"));
      expect(output).toContain("1 file");
    });

    test("Grep result shows no matches when empty", () => {
      formatter.parse(toolUseEvent("Grep", { pattern: "x" }, "g1"));
      const { output } = formatter.parse(toolResultEvent("g1", ""));
      expect(output).toContain("no matches");
    });

    test("Glob result shows file count", () => {
      formatter.parse(toolUseEvent("Glob", { pattern: "*.ts" }, "gl1"));
      const { output } = formatter.parse(
        toolResultEvent("gl1", "a.ts\nb.ts\nc.ts")
      );
      expect(output).toContain("3 files");
    });

    test("Bash result shows first line preview", () => {
      formatter.parse(toolUseEvent("Bash", { command: "ls" }, "b1"));
      const { output } = formatter.parse(
        toolResultEvent("b1", "README.md\nsrc/\npackage.json")
      );
      expect(output).toContain("README.md");
      expect(output).toContain("+2 lines");
    });

    test("Edit result shows checkmark", () => {
      formatter.parse(toolUseEvent("Edit", { file_path: "f.ts" }, "e1"));
      const { output } = formatter.parse(toolResultEvent("e1", "ok"));
      expect(output).toContain("✓");
    });

    test("Write result shows checkmark", () => {
      formatter.parse(toolUseEvent("Write", { file_path: "f.ts" }, "w1"));
      const { output } = formatter.parse(toolResultEvent("w1", "ok"));
      expect(output).toContain("✓");
    });

    test("Task result shows completed", () => {
      formatter.parse(toolUseEvent("Task", { description: "x" }, "t1"));
      const { output } = formatter.parse(toolResultEvent("t1", "done"));
      expect(output).toContain("completed");
    });
  });

  describe("formatText", () => {
    test("formats h1 headers", () => {
      const output = formatter.formatText("# Title\n");
      expect(output).toContain("Title");
      // Should not contain the # prefix
      expect(output).not.toContain("# ");
    });

    test("formats h2 headers", () => {
      const output = formatter.formatText("## Section\n");
      expect(output).toContain("Section");
      expect(output).not.toContain("## ");
    });

    test("formats h3 headers", () => {
      const output = formatter.formatText("### Subsection\n");
      expect(output).toContain("Subsection");
      expect(output).not.toContain("### ");
    });

    test("formats bullet points with dot", () => {
      const output = formatter.formatText("- item one\n");
      expect(output).toContain("•");
      expect(output).toContain("item one");
    });

    test("formats asterisk bullets with dot", () => {
      const output = formatter.formatText("* item two\n");
      expect(output).toContain("•");
      expect(output).toContain("item two");
    });

    test("formats numbered lists", () => {
      const output = formatter.formatText("1. first\n2. second\n");
      expect(output).toContain("1.");
      expect(output).toContain("first");
      expect(output).toContain("2.");
      expect(output).toContain("second");
    });

    test("formats code blocks with language", () => {
      const output = formatter.formatText("```typescript\nconst x = 1;\n```\n");
      expect(output).toContain("typescript");
      expect(output).toContain("const x = 1;");
      // Should have block delimiters
      expect(output).toContain("┌");
      expect(output).toContain("└");
    });

    test("formats inline code", () => {
      const output = formatter.formatText("Use `bun test` to run\n");
      expect(output).toContain("bun test");
    });

    test("truncates text after 10 content lines", () => {
      const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}\n`).join("");
      const output = formatter.formatText(lines);
      expect(output).toContain("Line 1");
      expect(output).toContain("Line 10");
      expect(output).toContain("...continuing...");
      expect(output).not.toContain("Line 15");
    });
  });

  describe("flush", () => {
    test("outputs remaining buffered text", () => {
      formatter.formatText("no newline yet");
      const output = formatter.flush();
      expect(output).toContain("no newline yet");
    });

    test("returns empty when nothing buffered", () => {
      const output = formatter.flush();
      expect(output).toBe("");
    });
  });

  describe("reset", () => {
    test("clears all accumulated state", () => {
      formatter.parse(textEvent("some text\n"));
      expect(formatter.getAssistantText()).not.toBe("");

      formatter.reset();
      expect(formatter.getAssistantText()).toBe("");
    });
  });
});
