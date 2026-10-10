import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class AdbError extends Error {
  constructor(
    message: string,
    public readonly causeDetail?: string,
  ) {
    super(message);
    this.name = "AdbError";
  }
}

/** Resolves to the adb binary. Prefers the bundled copy under resources/bin/adb. */
export function adbBinaryPath(resourcesDir: string): string {
  const bundled = join(resourcesDir, "bin", "adb", process.platform === "win32" ? "adb.exe" : "adb");
  if (existsSync(bundled)) return bundled;
  return "adb"; // fall back to PATH (dev machines)
}

/** Run an adb command, returning stdout. Rejects with AdbError on failure. */
export function runAdb(adbPath: string, args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `adb ${args.join(" ")}`;
    execFile(adbPath, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr?.toString().trim() || stdout?.toString().trim() || err.message;
        reject(new AdbError(`adb failed: ${cmd}`, detail));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

/** Short alias: run with the resolved adb path. */
export function adb(adbPath: string, args: string[], timeoutMs = 30000): Promise<string> {
  return runAdb(adbPath, args, timeoutMs);
}
