import { c } from "./colors";

export class StreamFormatter {
  private buffer = "";
  private inCodeBlock = false;
  private codeBlockLang = "";
  private lineBuffer = "";
  private assistantText = "";

  reset() {
    this.buffer = "";
    this.inCodeBlock = false;
    this.codeBlockLang = "";
    this.lineBuffer = "";
    this.assistantText = "";
  }

  getAssistantText(): string {
    return this.assistantText;
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

        // Handle assistant text content
        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text") {
              this.assistantText += block.text;
              output += this.formatText(block.text);
            }
          }
        }

        // Handle tool use - show what tool is being called
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          const toolName = event.content_block.name;
          output += `\n${c.dim}─── ${c.yellow}${toolName}${c.dim} ───${c.reset}\n`;
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
