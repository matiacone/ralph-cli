import type { ModelAlias } from "../lib";

export interface ExecutionResult {
  exitCode: number;
  output: string;
}

export interface ExecuteOptions {
  model?: ModelAlias;
}

export interface Executor {
  initialize(): Promise<void>;
  execute(
    prompt: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    options?: ExecuteOptions
  ): Promise<ExecutionResult>;
  readFile(path: string): Promise<string | null>;
  cleanup(): Promise<void>;
}
