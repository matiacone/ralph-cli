import type { ServiceConfig, McpConfig } from "../lib";

interface RunningService {
  name: string;
  proc: ReturnType<typeof Bun.spawn>;
  logFile: Bun.FileSink;
  ready: boolean;
  openUrl?: string;
}

export class ServiceManager {
  private services: ServiceConfig[];
  private mcp?: McpConfig;
  private running: RunningService[] = [];
  private mcpConfigPath: string | null = null;
  private logsDir = ".ralph/logs";

  constructor(services: ServiceConfig[], mcp?: McpConfig) {
    this.services = services;
    this.mcp = mcp;
  }

  async startAll(): Promise<void> {
    await Bun.$`mkdir -p ${this.logsDir}`.quiet();

    if (this.mcp?.playwriter?.enabled) {
      await this.generateMcpConfig();
    }

    const startPromises = this.services.map((config) => this.startService(config));
    await Promise.all(startPromises);
  }

  private async startService(config: ServiceConfig): Promise<void> {
    const logPath = `${this.logsDir}/${config.name}.log`;
    const logFile = Bun.file(logPath).writer();

    const timestamp = new Date().toISOString();
    logFile.write(`[${timestamp}] Starting ${config.command} ${(config.args ?? []).join(" ")}\n`);

    const proc = Bun.spawn([config.command, ...(config.args ?? [])], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const runningService: RunningService = {
      name: config.name,
      proc,
      logFile,
      ready: !config.readyPattern,
      openUrl: config.openUrl,
    };

    this.running.push(runningService);

    const readyPromise = config.readyPattern
      ? this.waitForReady(runningService, config.readyPattern, config.readyTimeout ?? 30000)
      : Promise.resolve();

    this.pipeOutput(proc.stdout, logFile, runningService, config.readyPattern);
    this.pipeOutput(proc.stderr, logFile, runningService, config.readyPattern);

    await readyPromise;

    if (runningService.ready && config.openUrl) {
      await this.openBrowser(config.openUrl);
    }

    console.log(`✓ Service "${config.name}" started${config.readyPattern ? " and ready" : ""}`);
  }

  private async pipeOutput(
    stream: ReadableStream<Uint8Array>,
    logFile: Bun.FileSink,
    service: RunningService,
    readyPattern?: string
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        logFile.write(text);

        if (readyPattern && !service.ready) {
          const regex = new RegExp(readyPattern);
          if (regex.test(text)) {
            service.ready = true;
          }
        }
      }
    } catch {
      // Stream closed
    }
  }

  private async waitForReady(
    service: RunningService,
    _pattern: string,
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    while (!service.ready) {
      if (Date.now() - startTime > timeout) {
        console.warn(`⚠ Service "${service.name}" did not become ready within ${timeout}ms`);
        return;
      }
      await Bun.sleep(100);
    }
  }

  private async openBrowser(url: string): Promise<void> {
    try {
      await Bun.spawn(["xdg-open", url], {
        stdout: "ignore",
        stderr: "ignore",
      }).exited;
    } catch {
      console.warn(`⚠ Could not open browser for ${url}`);
    }
  }

  private async generateMcpConfig(): Promise<void> {
    this.mcpConfigPath = ".ralph/mcp-config.json";

    const config = {
      mcpServers: {
        playwriter: {
          command: "npx",
          args: ["-y", "playwriter@latest"],
        },
      },
    };

    await Bun.write(this.mcpConfigPath, JSON.stringify(config, null, 2));
    console.log("✓ Generated MCP config for Playwriter");
  }

  getMcpConfigPath(): string | null {
    return this.mcpConfigPath;
  }

  async stopAll(): Promise<void> {
    for (const service of this.running) {
      try {
        service.proc.kill();
        await service.logFile.end();
        console.log(`✓ Stopped service "${service.name}"`);
      } catch {
        // Process may have already exited
      }
    }
    this.running = [];
  }

  getLogsDir(): string {
    return this.logsDir;
  }
}
