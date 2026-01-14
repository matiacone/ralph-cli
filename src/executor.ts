export interface ExecutionResult {
  exitCode: number;
  output: string;
}

export interface Executor {
  initialize(): Promise<void>;
  execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void
  ): Promise<ExecutionResult>;
  readFile(path: string): Promise<string | null>;
  cleanup(): Promise<void>;
}
