import type { Executor, ExecutionResult, ExecuteOptions } from "../executor";
import { readConfig } from "../../lib";
import { ServiceManager } from "../services";

export class LocalExecutor implements Executor {
  private serviceManager: ServiceManager | null = null;

  async initialize(): Promise<void> {
    const config = await readConfig();
    if (config.services?.length) {
      this.serviceManager = new ServiceManager(config.services, config.mcp);
      await this.serviceManager.startAll();
    }
  }

  async execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    const args = [
      "claude",
      "--dangerously-skip-permissions",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
    ];

    if (options?.model) {
      args.push("--model", options.model);
    }

    const mcpConfigPath = this.serviceManager?.getMcpConfigPath();
    if (mcpConfigPath) {
      args.push("--mcp-config", mcpConfigPath);
    }

    args.push(prompt);

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    const decoder = new TextDecoder();

    const readStream = async (
      stream: ReadableStream<Uint8Array>,
      handler: (chunk: string) => void
    ) => {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        output += text;
        handler(text);
      }
    };

    await Promise.all([
      readStream(proc.stdout, onStdout),
      readStream(proc.stderr, onStderr),
    ]);

    const exitCode = await proc.exited;
    return { exitCode, output };
  }

  async readFile(path: string): Promise<string | null> {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    try {
      return await file.text();
    } catch {
      return null;
    }
  }

  async cleanup(): Promise<void> {
    if (this.serviceManager) {
      await this.serviceManager.stopAll();
    }
  }
}
