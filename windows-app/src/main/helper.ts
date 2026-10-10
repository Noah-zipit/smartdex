import { existsSync } from "node:fs";
import { join } from "node:path";
import { adb } from "./adb";

export const HELPER_PACKAGE = "com.smartdex.helper";
export const HELPER_DESK_ACTIVITY = "com.smartdex.helper/.DeskActivity";

export function helperApkPath(resourcesDir: string): string | null {
  const p = join(resourcesDir, "apk", "smartdex-helper.apk");
  return existsSync(p) ? p : null;
}

export async function isHelperInstalled(adbPath: string, serial: string): Promise<boolean> {
  const out = await adb(adbPath, ["-s", serial, "shell", "pm", "list", "packages", HELPER_PACKAGE]);
  return out.includes(HELPER_PACKAGE);
}

export async function installHelper(adbPath: string, serial: string, apkPath: string): Promise<void> {
  await adb(adbPath, ["-s", serial, "install", "-r", apkPath], 120000);
}

/** Launch the helper desk UI onto the virtual display. */
export async function launchHelperDesk(adbPath: string, serial: string, displayId: number): Promise<void> {
  await adb(adbPath, ["-s", serial, "shell", "am", "start", "--display", String(displayId), "-n", HELPER_DESK_ACTIVITY]);
}
