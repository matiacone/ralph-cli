import { c } from "./colors";

const PACKAGE_NAME = "ralph-run";

async function getInstalledVersion(): Promise<string | null> {
  try {
    const pkgPath = import.meta.dir.replace(/\/src$/, "") + "/package.json";
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version;
  } catch {
    return null;
  }
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

export async function autoUpdate() {
  try {
    const [installed, latest] = await Promise.all([
      getInstalledVersion(),
      getLatestVersion(),
    ]);

    if (!installed || !latest) return;
    if (!isNewer(latest, installed)) return;

    console.log(
      `${c.yellow}Update available: ${installed} → ${latest}${c.reset}`
    );
    console.log(`${c.dim}Run: npm update -g ${PACKAGE_NAME}${c.reset}\n`);
  } catch {
    // Silently fail - update check is non-critical
  }
}
