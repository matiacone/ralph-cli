import { c } from "./colors";

export class StreamFormatter {
  private buffer = "";
  private inCodeBlock = false;
  private codeBlockLang = "";
  private lineBuffer = "";
  private assistantText = "";
  private toolNames = new Map<string, string>();
  private textLineCount = 0;
  private maxTextLines = 10;
  private truncated = false;

  reset() {
    this.buffer = "";
    this.inCodeBlock = false;
    this.codeBlockLang = "";
    this.lineBuffer = "";
    this.assistantText = "";
    this.toolNames.clear();
    this.textLineCount = 0;
    this.truncated = false;
  }

  private resetTextTruncation() {
    this.textLineCount = 0;
    this.truncated = false;
  }

  getAssistantText(): string {
    return this.assistantText;
  }

  private formatToolInput(toolName: string, input: Record<string, unknown>): string {
    if (!input) return "";

    switch (toolName) {
      case "Read":
      case "Write":
      case "Edit":
      case "NotebookEdit":
        if (input.file_path || input.notebook_path) {
          const path = (input.file_path || input.notebook_path) as string;
          return ` ${c.dim}${path}${c.reset}`;
        }
        break;
      case "Bash":
        if (input.description) {
          return ` ${c.dim}${input.description}${c.reset}`;
        } else if (input.command) {
          const cmd = input.command as string;
          const truncated = cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
          return ` ${c.dim}${truncated}${c.reset}`;
        }
        break;
      case "Grep":
        if (input.pattern) {
          const path = input.path ? ` in ${input.path}` : "";
          return ` ${c.dim}/${input.pattern}/${path}${c.reset}`;
        }
        break;
      case "Glob":
        if (input.pattern) {
          return ` ${c.dim}${input.pattern}${c.reset}`;
        }
        break;
      case "Task":
        if (input.description) {
          return ` ${c.dim}${input.description}${c.reset}`;
        }
        break;
      case "WebFetch":
        if (input.url) {
          return ` ${c.dim}${input.url}${c.reset}`;
        }
        break;
      case "WebSearch":
        if (input.query) {
          return ` ${c.dim}"${input.query}"${c.reset}`;
        }
        break;
    }
    return "";
  }

  private formatToolResult(
    toolName: string,
    content: string | Array<{ type: string; text?: string }>
  ): string {
    const text = Array.isArray(content)
      ? content
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("\n")
      : content ?? "";

    switch (toolName) {
      case "Read": {
        if (!text) return `${c.dim}→ empty${c.reset}`;
        const lines = text.split("\n").length;
        return `${c.dim}→ ${lines} lines${c.reset}`;
      }
      case "Grep": {
        const matches = text.split("\n").filter((l) => l.trim()).length;
        if (matches === 0) return `${c.dim}→ no matches${c.reset}`;
        return `${c.dim}→ ${matches} ${matches === 1 ? "file" : "files"}${c.reset}`;
      }
      case "Glob": {
        const files = text.split("\n").filter((l) => l.trim()).length;
        if (files === 0) return `${c.dim}→ no files${c.reset}`;
        return `${c.dim}→ ${files} ${files === 1 ? "file" : "files"}${c.reset}`;
      }
      case "Bash": {
        const lines = text.split("\n").filter((l) => l.trim());
        const firstLine = lines[0];
        if (!firstLine) return `${c.dim}→ (empty)${c.reset}`;
        const preview = firstLine.slice(0, 60);
        const truncated = firstLine.length > 60 ? preview + "..." : preview;
        const more = lines.length > 1 ? ` (+${lines.length - 1} lines)` : "";
        return `${c.dim}→ ${truncated}${more}${c.reset}`;
      }
      case "Edit":
      case "Write":
      case "NotebookEdit":
        return `${c.dim}→ ✓${c.reset}`;
      case "Task":
        return `${c.dim}→ completed${c.reset}`;
      case "WebFetch":
      case "WebSearch":
        return `${c.dim}→ fetched${c.reset}`;
    }
    return "";
  }

  private formatLine(line: string): string {
    // Code block start
    if (line.startsWith("```")) {
      this.inCodeBlock = !this.inCodeBlock;
      if (this.inCodeBlock) {
        this.codeBlockLang = line.slice(3).trim();
        const lang = this.codeBlockLang ? ` ${c.dim}${this.codeBlockLang}${c.reset}` : "";
        return `${c.dim}┌──${lang}${c.reset}\n`;
      } else {
        this.codeBlockLang = "";
        return `${c.dim}└──${c.reset}\n`;
      }
    }

    // Inside code block - dim the code
    if (this.inCodeBlock) {
      return `${c.dim}│${c.reset} ${c.cyan}${line}${c.reset}\n`;
    }

    // Headers
    if (line.startsWith("### ")) {
      return `${c.bold}${c.blue}${line.slice(4)}${c.reset}\n`;
    }
    if (line.startsWith("## ")) {
      return `${c.bold}${c.magenta}${line.slice(3)}${c.reset}\n`;
    }
    if (line.startsWith("# ")) {
      return `${c.bold}${c.green}${line.slice(2)}${c.reset}\n`;
    }

    // Bullet points
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return `${c.yellow}•${c.reset} ${line.slice(2)}\n`;
    }

    // Numbered lists
    const numberedMatch = line.match(/^(\d+)\. (.*)$/);
    if (numberedMatch) {
      return `${c.yellow}${numberedMatch[1]}.${c.reset} ${numberedMatch[2]}\n`;
    }

    // Inline code
    const formatted = line.replace(/`([^`]+)`/g, `${c.cyan}$1${c.reset}`);

    return formatted + "\n";
  }

  formatText(text: string): string {
    let output = "";
    const combined = this.lineBuffer + text;
    const lines = combined.split("\n");

    // Keep the last incomplete line in the buffer
    this.lineBuffer = lines.pop() || "";

    for (const line of lines) {
      // Skip empty lines for counting purposes
      const isContentLine = line.trim().length > 0;

      if (isContentLine) {
        this.textLineCount++;
      }

      // If we've exceeded max lines, show truncation indicator once
      if (this.textLineCount > this.maxTextLines) {
        if (!this.truncated) {
          this.truncated = true;
          output += `${c.dim}[...continuing...]${c.reset}\n`;
        }
        // Still accumulate assistantText but don't output
        continue;
      }

      output += this.formatLine(line);
    }

    return output;
  }

  parse(text: string): { output: string; remaining: string } {
    const combined = this.buffer + text;
    const lines = combined.split("\n");
    const remaining = lines.pop() || "";
    let output = "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);

        // Handle assistant text content and tool use
        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text") {
              this.assistantText += block.text;
              output += this.formatText(block.text);
            } else if (block.type === "tool_use") {
              // Flush any remaining line buffer
              if (this.lineBuffer) {
                this.lineBuffer = "";
              }
              // Reset text truncation for new tool call
              this.resetTextTruncation();
              const toolName = block.name;
              const toolInput = this.formatToolInput(toolName, block.input);
              output += `\n${c.dim}─── ${c.yellow}${toolName}${c.reset}${toolInput}${c.dim} ───${c.reset}\n`;
              // Store tool ID -> name mapping for result display
              if (block.id) {
                this.toolNames.set(block.id, toolName);
              }
            }
          }
        }

        // Handle user events with tool results
        if (event.type === "user" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              const toolName = this.toolNames.get(block.tool_use_id);
              if (toolName) {
                const resultSummary = this.formatToolResult(toolName, block.content);
                if (resultSummary) {
                  output += `${resultSummary}\n`;
                }
              }
            }
          }
        }

        // Handle tool results
        if (event.type === "result" && event.subtype === "success") {
          output += `${c.dim}───────────────${c.reset}\n\n`;
        }
      } catch {}
    }

    this.buffer = remaining;
    return { output, remaining };
  }

  flush(): string {
    if (this.lineBuffer) {
      const output = this.formatLine(this.lineBuffer);
      this.lineBuffer = "";
      return output;
    }
    return "";
  }
}
