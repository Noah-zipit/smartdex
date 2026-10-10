import { app } from "electron";
import { join } from "node:path";
import { adbBinaryPath, adb, AdbError } from "./adb";
import { detectDevices, deviceStateError, getFreeformEnabled, enableFreeform } from "./device";
import { helperApkPath, isHelperInstalled, installHelper, launchHelperDesk } from "./helper";
import { scrcpyBinaryPath, ScrcpyProcess } from "./scrcpy";
import { findScrcpyDisplayId } from "./displays";

export type ConnState = "disconnected" | "connecting" | "connected";
export type RebootState = "unknown" | "not-needed" | "needed";

export interface Checklist {
  adbAvailable: boolean;
  deviceDetected: boolean;
  deviceAuthorized: boolean;
  freeformEnabled: boolean;
}

export interface SmartdexEvents {
  log(text: string): void;
  state(state: ConnState, detail?: string): void;
  rebootNeeded(needed: boolean): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ConnectionManager {
  private state: ConnState = "disconnected";
  private reboot: RebootState = "unknown";
  private events: SmartdexEvents;
  private scrcpy = new ScrcpyProcess();

  constructor(events: SmartdexEvents) {
    this.events = events;
    this.scrcpy.setLogHandler((line) => this.events.log(line.text));
  }

  get currentState(): ConnState {
    return this.state;
  }

  get rebootNeeded(): boolean {
    return this.reboot === "needed";
  }

  private resourcesDir(): string {
    if (process.env.SMARTDEX_RESOURCES) return process.env.SMARTDEX_RESOURCES;
    if (app.isPackaged) return join(app.getAppPath(), "..", "..", "resources");
    return join(app.getAppPath(), "resources"); // dev: windows-app/resources
  }

  /** Lightweight health info for the first-run checklist. */
  async getChecklist(): Promise<Checklist> {
    const out: Checklist = { adbAvailable: false, deviceDetected: false, deviceAuthorized: false, freeformEnabled: false };
    const adbPath = adbBinaryPath(this.resourcesDir());
    try {
      await adb(adbPath, ["version"]);
      out.adbAvailable = true;
    } catch {
      return out;
    }
    try {
      const devices = await detectDevices(adbPath);
      const dev = devices[0];
      if (!dev) return out;
      out.deviceDetected = true;
      if (dev.state !== "device") return out;
      out.deviceAuthorized = true;
      out.freeformEnabled = await getFreeformEnabled(adbPath, dev.serial);
    } catch {
      // keep what we have; details surface during Connect
    }
    return out;
  }

  private fail(reason: string): void {
    this.events.log(`[error] ${reason}`);
    this.events.state("disconnected", reason);
    this.state = "disconnected";
  }

  async connect(): Promise<void> {
    if (this.state === "connecting") return;
    if (this.state === "connected") return;
    this.state = "connecting";
    this.events.state("connecting");

    const resources = this.resourcesDir();
    const adbPath = adbBinaryPath(resources);
    const log = (t: string) => this.events.log(t);

    try {
      // 1. scrcpy present?
      const scrcpyBin = scrcpyBinaryPath(resources);
      if (!scrcpyBin) {
        this.fail(
          "scrcpy not found in resources/bin. Run scripts/fetch-binaries.js (packaging agent) to download scrcpy v5.0.1, then retry.",
        );
        return;
      }

      // 2. Device detected?
      let devices;
      try {
        devices = await detectDevices(adbPath);
      } catch (e) {
        const d = e instanceof AdbError ? ` (${e.causeDetail})` : "";
        this.fail(`Could not run adb devices${d}. Make sure adb is bundled at resources/bin/adb.`);
        return;
      }
      const device = devices[0];
      if (!device) {
        this.fail("No Android device found. Connect your phone via USB with USB debugging enabled, then press Connect again.");
        return;
      }
      const stateErr = deviceStateError(device);
      if (stateErr) {
        this.fail(stateErr);
        return;
      }
      log(`[adb] device ${device.serial} ready`);

      // 3. Freeform mode. A phone REBOOT is required after first setting it,
      //    so if we had to flip it, stop here and tell the user.
      const freeform = await getFreeformEnabled(adbPath, device.serial);
      if (!freeform) {
        log("[adb] freeform support is off — enabling it (one-time)");
        await enableFreeform(adbPath, device.serial);
        this.reboot = "needed";
        this.events.rebootNeeded(true);
        this.fail(
          "Freeform multi-window mode was just enabled. REBOOT YOUR PHONE, then press Connect again. This reboot is only needed once.",
        );
        return;
      }
      log("[adb] freeform support enabled");

      // 4. Helper APK installed?
      const apk = helperApkPath(resources);
      const installed = await isHelperInstalled(adbPath, device.serial);
      if (!installed) {
        if (!apk) {
          this.fail(
            "SmartDex helper app is not installed on the phone and smartdex-helper.apk is missing from windows-app/resources/apk/ (the Android agent has not delivered it yet). Connect again once the APK is in place.",
          );
          return;
        }
        log("[adb] installing helper APK…");
        try {
          await installHelper(adbPath, device.serial, apk);
        } catch (e) {
          const d = e instanceof AdbError ? ` (${e.causeDetail})` : "";
          this.fail(`Failed to install helper APK${d}. Try installing it manually: adb install ${apk}`);
          return;
        }
        log("[adb] helper APK installed");
      } else {
        log("[adb] helper app already installed");
      }

      // 5. Start scrcpy with the pinned flags.
      log("[scrcpy] starting virtual display 1920x1080…");
      this.scrcpy.start(scrcpyBin);

      // 6. Find the virtual display id (retry while scrcpy warms up).
      let displayId: number | null = null;
      for (let i = 0; i < 10; i++) {
        await sleep(1000);
        displayId = await findScrcpyDisplayId(adbPath, device.serial).catch(() => null);
        if (displayId !== null) break;
      }
      if (displayId === null) {
        this.scrcpy.stop();
        this.fail("scrcpy started but no virtual display appeared. Check the log above and press Connect again.");
        return;
      }
      log(`[adb] virtual display id = ${displayId}`);

      // 7. Launch the desk UI onto the virtual display.
      try {
        await launchHelperDesk(adbPath, device.serial, displayId);
      } catch (e) {
        const d = e instanceof AdbError ? ` (${e.causeDetail})` : "";
        this.fail(`Could not launch the helper desk UI${d}. scrcpy window is still live — retry Disconnect then Connect.`);
        return;
      }

      this.state = "connected";
      this.reboot = "not-needed";
      this.events.rebootNeeded(false);
      log("[smartdex] connected — control the desk with mouse (right-click = back) and keyboard");
      this.events.state("connected");
    } catch (e) {
      const d = e instanceof AdbError ? ` (${e.causeDetail})` : e instanceof Error ? ` (${e.message})` : "";
      this.fail(`Unexpected failure${d}. See log.`);
    }
  }

  async disconnect(): Promise<void> {
    // Killing scrcpy destroys its virtual display; the phone is left clean.
    this.scrcpy.stop();
    this.state = "disconnected";
    this.events.log("[smartdex] disconnected");
    this.events.state("disconnected");
  }
}
