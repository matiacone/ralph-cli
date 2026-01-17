import type { Executor } from "../executor";
import { LocalExecutor } from "./local";
import { DaytonaExecutor } from "./daytona";

export interface CreateExecutorOptions {
  sandbox?: boolean;
  repoUrl?: string;
  branch?: string;
}

export async function createExecutor(
  opts: CreateExecutorOptions = {}
): Promise<Executor> {
  if (!opts.sandbox) {
    return new LocalExecutor();
  }

  if (!opts.repoUrl) {
    throw new Error("repoUrl is required for sandbox mode");
  }
  if (!opts.branch) {
    throw new Error("branch is required for sandbox mode");
  }

  return new DaytonaExecutor({
    repoUrl: opts.repoUrl,
    branch: opts.branch,
  });
}

export { LocalExecutor } from "./local";
export { DaytonaExecutor } from "./daytona";
export type { Executor, ExecutionResult, ExecuteOptions } from "../executor";
