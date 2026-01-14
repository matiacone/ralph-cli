import type { Executor, ExecutionResult } from "../executor";

export class LocalExecutor implements Executor {
  async initialize(): Promise<void> {
    // No initialization needed for local execution
  }

  async execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<ExecutionResult> {
    const args = [
      "claude",
      "--dangerously-skip-permissions",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      prompt,
    ];

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
    // No cleanup needed for local execution
  }
}
