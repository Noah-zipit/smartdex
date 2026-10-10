import { ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type LogLine = { stream: "stdout" | "stderr"; text: string };

/** Pinned scrcpy version per the verified recipe. */
export const SCRCPY_VERSION = "v5.0.1";

/** Exact flags from the verified recipe. */
export const SCRCPY_ARGS = [
  "--new-display=1920x1080/160",
  "--max-fps=60",
  "--video-bit-rate=16M",
  "--display-ime-policy=local",
  "--no-audio",
  "--window-title=SmartDex",
];

export function scrcpyBinaryPath(resourcesDir: string): string | null {
  const exe = process.platform === "win32" ? "scrcpy.exe" : "scrcpy";
  const p = join(resourcesDir, "bin", "scrcpy", exe);
  return existsSync(p) ? p : null;
}

export class ScrcpyProcess {
  private child: ChildProcess | null = null;
  private onLine: (line: LogLine) => void = () => {};

  setLogHandler(fn: (line: LogLine) => void) {
    this.onLine = fn;
  }

  get running(): boolean {
    return this.child !== null;
  }

  start(binaryPath: string): void {
    if (this.child) throw new Error("scrcpy is already running");
    const child = spawn(binaryPath, SCRCPY_ARGS, { windowsHide: true });
    this.child = child;

    const emit = (stream: "stdout" | "stderr") => (data: Buffer) => {
      for (const text of data.toString().split("\n")) {
        const t = text.trimEnd();
        if (t) this.onLine({ stream, text: `[scrcpy] ${t}` });
      }
    };
    child.stdout?.on("data", emit("stdout"));
    child.stderr?.on("data", emit("stderr"));
    child.on("exit", (code, signal) => {
      this.onLine({
        stream: "stderr",
        text: `[scrcpy] exited (code=${code}, signal=${signal}) — virtual display destroyed`,
      });
      this.child = null;
    });
    child.on("error", (err) => {
      this.onLine({ stream: "stderr", text: `[scrcpy] failed to start: ${err.message}` });
      this.child = null;
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (!child) return;
    // Killing scrcpy destroys its virtual display automatically.
    if (process.platform === "win32") child.kill("SIGTERM");
    else child.kill("SIGKILL");
  }
}
