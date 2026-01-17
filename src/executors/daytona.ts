import { Daytona, Sandbox, PtyHandle } from "@daytonaio/sdk";
import type { Executor, ExecutionResult, ExecuteOptions } from "../executor";

export interface DaytonaExecutorConfig {
  repoUrl: string;
  branch: string;
}

export class DaytonaExecutor implements Executor {
  private daytona: Daytona;
  private sandbox: Sandbox | null = null;
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

    console.log("📦 Creating Daytona sandbox...");
    this.sandbox = await this.daytona.create({
      language: "typescript",
      envVars: {
        ANTHROPIC_API_KEY: anthropicKey,
        GH_TOKEN: ghToken,
      },
    });
    console.log("✓ Sandbox created");

    console.log("📥 Cloning repository...");
    await this.sandbox.git.clone(
      this.config.repoUrl,
      "workspace",
      this.config.branch,
      undefined,
      "oauth2",
      ghToken
    );
    console.log("✓ Repository cloned");

    console.log("📦 Installing bun...");
    const bunInstall = await this.sandbox.process.executeCommand(
      "curl -fsSL https://bun.sh/install | bash && echo 'export PATH=$HOME/.bun/bin:$PATH' >> ~/.bashrc"
    );
    if (bunInstall.exitCode !== 0) {
      console.log("⚠ Bun install failed:", bunInstall.result);
    }

    console.log("📦 Installing dependencies...");
    const bunResult = await this.sandbox.process.executeCommand(
      "source ~/.bashrc && cd ~/workspace && bun install"
    );
    console.log("✓ Dependencies installed", bunResult.exitCode === 0 ? "" : `(exit: ${bunResult.exitCode})`);

    console.log("📦 Installing Claude Code...");
    const claudeResult = await this.sandbox.process.executeCommand(
      "npm install -g @anthropic-ai/claude-code"
    );
    console.log("✓ Claude Code installed", claudeResult.exitCode === 0 ? "" : `(exit: ${claudeResult.exitCode})`);
  }

  async execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    _onStderr: (chunk: string) => void,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    if (!this.sandbox) {
      throw new Error("Executor not initialized. Call initialize() first.");
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY!;
    const ghToken = process.env.GH_TOKEN!;

    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const modelFlag = options?.model ? ` --model ${options.model}` : "";
    // Use npx to run claude (avoids PATH issues with npm global installs)
    const claudeCmd = `npx @anthropic-ai/claude-code --dangerously-skip-permissions -p --output-format stream-json --verbose${modelFlag} '${escapedPrompt}'`;

    let output = "";
    const decoder = new TextDecoder();

    console.log("🚀 Starting Claude in sandbox via PTY...");
    const ptyHandle: PtyHandle = await this.sandbox.process.createPty({
      id: `claude-${Date.now()}`,
      cwd: "/home/daytona/workspace",
      cols: 200,
      rows: 50,
      onData: (data: Uint8Array) => {
        const text = decoder.decode(data);
        output += text;
        onStdout(text);
      },
    });

    await ptyHandle.waitForConnection();
    console.log("📡 PTY connected, streaming output...");

    // Source bashrc for bun PATH, export env vars, then exec claude
    ptyHandle.sendInput(
      `source ~/.bashrc && export ANTHROPIC_API_KEY="${anthropicKey}" GH_TOKEN="${ghToken}" && exec ${claudeCmd}\n`
    );

    const result = await ptyHandle.wait();
    await ptyHandle.disconnect();

    console.log("✓ Command completed (exit code:", result.exitCode, ")");

    return {
      exitCode: result.exitCode ?? 1,
      output,
    };
  }

  async readFile(path: string): Promise<string | null> {
    if (!this.sandbox) {
      throw new Error("Executor not initialized. Call initialize() first.");
    }

    try {
      const buffer = await this.sandbox.fs.downloadFile(`workspace/${path}`);
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
