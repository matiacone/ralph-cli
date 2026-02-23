import type { Executor, ExecutionResult, ExecuteOptions } from "../executor";
import { readConfig } from "../../lib";
import { ServiceManager } from "../services";
import { debug } from "../debug";

const MCP_CONFIG_PATH = ".ralph/mcp-config.json";

async function gatherMcpConfig(): Promise<string | null> {
  const servers: Record<string, unknown> = {};

  // Only read project-level MCPs from .mcp.json
  // User-level MCPs (e.g. pencil, chrome) are for interactive use and can hang in headless mode
  try {
    const projectMcp = await Bun.file(".mcp.json").json();
    Object.assign(servers, projectMcp);
  } catch {}

  if (Object.keys(servers).length === 0) return null;

  await Bun.write(MCP_CONFIG_PATH, JSON.stringify({ mcpServers: servers }, null, 2));
  return MCP_CONFIG_PATH;
}

export class LocalExecutor implements Executor {
  private serviceManager: ServiceManager | null = null;
  private mcpConfigPath: string | null = null;
  private currentProc: ReturnType<typeof Bun.spawn> | null = null;

  async initialize(): Promise<void> {
    this.mcpConfigPath = await gatherMcpConfig();

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

    if (this.mcpConfigPath) {
      args.push("--mcp-config", this.mcpConfigPath);
    }

    args.push(prompt);

    debug("executor", "Spawning claude", { args: args.filter(a => a !== prompt).join(" "), mcpConfig: this.mcpConfigPath });

    // Strip ANTHROPIC_API_KEY so claude uses OAuth (Max plan) instead of API credits
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY")
    );

    const proc = Bun.spawn(args, {
      stdio: ["inherit", "pipe", "pipe"],
      env,
    });
    this.currentProc = proc;

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
    this.currentProc = null;
    return { exitCode, output };
  }

  abort(): void {
    if (this.currentProc) {
      this.currentProc.kill();
      this.currentProc = null;
    }
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
