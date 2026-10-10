import { adb, AdbError } from "./adb";

export interface DeviceInfo {
  serial: string;
  state: "device" | "unauthorized" | "offline" | string;
}

/** Parse `adb devices` output into a list of devices. */
export function parseDevices(output: string): DeviceInfo[] {
  const devices: DeviceInfo[] = [];
  for (const line of output.split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(\S+)$/);
    if (m && m[1] !== "List") devices.push({ serial: m[1], state: m[2] });
  }
  return devices;
}

export async function detectDevices(adbPath: string): Promise<DeviceInfo[]> {
  const out = await adb(adbPath, ["devices"]);
  return parseDevices(out);
}

/** Human-readable error for a non-ready device state. */
export function deviceStateError(device: DeviceInfo): string | null {
  if (device.state === "device") return null;
  if (device.state === "unauthorized")
    return `Device ${device.serial} is unauthorized. On your phone, accept the "Allow USB debugging" RSA prompt, then press Connect again.`;
  return `Device ${device.serial} is in state "${device.state}". Reconnect the USB cable and press Connect again.`;
}

/**
 * Freeform (multi-window) support flag.
 * Returns true when enable_freeform_support == 1.
 */
export async function getFreeformEnabled(adbPath: string, serial: string): Promise<boolean> {
  const out = await adb(adbPath, ["-s", serial, "shell", "settings", "get", "global", "enable_freeform_support"]);
  return out.trim() === "1";
}

/** Turn freeform support on. Returns true on success. */
export async function enableFreeform(adbPath: string, serial: string): Promise<void> {
  await adb(adbPath, ["-s", serial, "shell", "settings", "put", "global", "enable_freeform_support", "1"]);
}

/** Turn freeform support off (cleanup on disconnect). */
export async function disableFreeform(adbPath: string, serial: string): Promise<void> {
  try {
    await adb(adbPath, ["-s", serial, "shell", "settings", "put", "global", "enable_freeform_support", "0"]);
  } catch (e) {
    // Best-effort cleanup; never fail teardown on this.
    if (e instanceof AdbError) console.warn("[smartdex] freeform cleanup skipped:", e.message);
  }
}
