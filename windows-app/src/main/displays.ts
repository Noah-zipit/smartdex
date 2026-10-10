import { adb } from "./adb";

export interface DisplayInfo {
  id: number;
  flags: string;
}

/**
 * Parse `adb shell dumpsys display` and find the virtual display created by
 * scrcpy. scrcpy names its display like "scrcpy" and it shows up as a virtual
 * display; the id is usually 1. Returns null if not found (caller should
 * retry — the display appears shortly after scrcpy starts).
 */
export async function findScrcpyDisplayId(adbPath: string, serial: string): Promise<number | null> {
  const out = await adb(adbPath, ["-s", serial, "shell", "dumpsys", "display"]);

  // First pass: look for a DisplayDeviceInfo block mentioning scrcpy.
  const lines = out.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/scrcpy/i.test(lines[i])) {
      // The display id lives in a nearby "mDisplayId=N" or "Display N:" line.
      for (let j = Math.max(0, i - 30); j < Math.min(lines.length, i + 30); j++) {
        const m = lines[j].match(/(?:mDisplayId|Display\s+)\s*[:=]?\s*(\d+)/i);
        if (m) return parseInt(m[1], 10);
      }
    }
  }

  // Fallback: list all virtual displays; scrcpy's is usually the only virtual
  // display, and id 1 is the canonical case.
  const virtualIds: number[] = [];
  for (const line of lines) {
    const m = line.match(/Display\s+(\d+):\s*.*?VIRTUAL_DISPLAY/i);
    if (m) virtualIds.push(parseInt(m[1], 10));
    else {
      const m2 = line.match(/mDisplayId=(\d+)/);
      if (m2) virtualIds.push(parseInt(m2[1], 10));
    }
  }
  const unique = [...new Set(virtualIds)];
  // Built-in display is 0; any non-zero virtual display is a candidate.
  const nonZero = unique.filter((id) => id !== 0);
  if (nonZero.length === 1) return nonZero[0];
  if (unique.includes(1)) return 1;
  return nonZero[0] ?? null;
}
