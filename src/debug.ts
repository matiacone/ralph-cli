import { c } from "./colors";

let debugEnabled = false;

export function setDebug(enabled: boolean) {
  debugEnabled = enabled;
}

export function isDebugEnabled() {
  return debugEnabled;
}

export function debug(context: string, message: string, data?: Record<string, unknown>) {
  if (!debugEnabled) return;

  const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 12) ?? "";
  const prefix = `${c.dim}[${timestamp}]${c.reset} ${c.magenta}[${context}]${c.reset}`;

  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}
