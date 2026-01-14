import { Daytona, Sandbox } from "@daytonaio/sdk";
import type { Executor, ExecutionResult } from "../executor";

export interface DaytonaExecutorConfig {
  repoUrl: string;
  branch: string;
}

export class DaytonaExecutor implements Executor {
  private daytona: Daytona;
  private sandbox: Sandbox | null = null;
  private sessionId = "ralph-session";
  private config: DaytonaExecutorConfig;

  constructor(config: DaytonaExecutorConfig) {
    this.config = config;
    this.daytona = new Daytona();
  }

  async initialize(): Promise<void> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const ghToken = process.env.GH_TOKEN;

    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required for sandbox mode");
    }
    if (!ghToken) {
      throw new Error("GH_TOKEN environment variable is required for sandbox mode");
    }

    this.sandbox = await this.daytona.create({
      language: "typescript",
      envVars: {
        ANTHROPIC_API_KEY: anthropicKey,
        GH_TOKEN: ghToken,
      },
    });

    await this.sandbox.git.clone(
      this.config.repoUrl,
      "/workspace",
      this.config.branch,
      undefined,
      undefined,
      ghToken
    );

    await this.sandbox.process.createSession(this.sessionId);

    await this.sandbox.process.executeSessionCommand(this.sessionId, {
      command: "cd /workspace && bun install",
    });

    await this.sandbox.process.executeSessionCommand(this.sessionId, {
      command: "npm install -g @anthropic-ai/claude-code",
    });
  }

  async execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<ExecutionResult> {
    if (!this.sandbox) {
      throw new Error("Executor not initialized. Call initialize() first.");
    }

    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const command = `cd /workspace && claude --dangerously-skip-permissions -p --output-format stream-json --verbose '${escapedPrompt}'`;

    const result = await this.sandbox.process.executeSessionCommand(
      this.sessionId,
      { command, runAsync: true }
    );

    const cmdId = result.cmdId;
    if (!cmdId) {
      throw new Error("No command ID returned from session command");
    }

    let output = "";
    await this.sandbox.process.getSessionCommandLogs(
      this.sessionId,
      cmdId,
      (chunk) => {
        output += chunk;
        onStdout(chunk);
      },
      (chunk) => {
        output += chunk;
        onStderr(chunk);
      }
    );

    const finalResult = await this.sandbox.process.getSessionCommand(
      this.sessionId,
      cmdId
    );

    return {
      exitCode: finalResult.exitCode ?? 1,
      output,
    };
  }

  async readFile(path: string): Promise<string | null> {
    if (!this.sandbox) {
      throw new Error("Executor not initialized. Call initialize() first.");
    }

    try {
      const buffer = await this.sandbox.fs.downloadFile(`/workspace/${path}`);
      return buffer.toString();
    } catch {
      return null;
    }
  }

  async cleanup(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.delete();
      } catch {
        // Ignore cleanup errors
      }
      this.sandbox = null;
    }
  }
}
