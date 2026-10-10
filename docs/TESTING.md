# SmartDex testing ledger

Honest record of what is verified vs. what still needs a real phone.
Updated 2026-10-10. Keep this file truthful — move items between sections
only with evidence.

## Verified

Research and machine-verified findings (no hand-waving):

- **scrcpy v5.0.1 download + checksum** — the pinned URL
  `https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip`
  was downloaded on 2026-10-10 and its SHA-256 matched the pinned value
  `b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5`
  exactly. `scripts/fetch-binaries.js` aborts loudly on any mismatch.
- **Platform-tools version + checksum** — Google's SDK repository manifest
  (`https://dl.google.com/android/repository/repository2-3.xml`) confirms the
  current stable is r37.0.1 and the Windows artifact is named
  `platform-tools_r37.0.1-win.zip` (note: `-win.zip`, not `-windows.zip`;
  the `-windows.zip` form 404s). The URL returns HTTP 200, and its SHA-1
  `e03e78b1d80b396f1c3358e31251cb31740e1110` (the only checksum Google
  publishes for it) matched on download, 2026-10-10. No SHA-256 is
  published by Google for platform-tools.
- **Zip layouts** — the scrcpy zip wraps everything in one top-level folder
  `scrcpy-win64-v5.0.1/`; the platform-tools zip wraps in `platform-tools/`.
  `fetch-binaries.js` unwraps the single top-level folder so the staged
  layout is flat: `bin/scrcpy/scrcpy.exe`, `bin/adb/adb.exe`.
- **fetch-binaries.js works end-to-end** — run on 2026-10-10 (Linux VM):
  downloaded both zips, verified both checksums, extracted and unwrapped
  correctly, and skipped everything on a second run (idempotent; `--force`
  re-fetches). **Not yet run on Windows** — the PowerShell `Expand-Archive`
  path is untested; CI will exercise it.
- **Resource paths match the main process** — `src/main/adb.ts` expects
  `resources/bin/adb/adb.exe`, `src/main/scrcpy.ts` expects
  `resources/bin/scrcpy/scrcpy.exe`, `src/main/helper.ts` expects
  `resources/apk/smartdex-helper.apk`. `windows-app/electron-builder.yml`
  maps `resources/bin/**` and `resources/apk/**` into the packaged app's
  `resources/` via `extraResources`, which is the directory the main
  process resolves (`connection.ts` → `app.getAppPath()/../.. /resources`,
  overridable with `SMARTDEX_RESOURCES`).
- **Pinned scrcpy flags** (`src/main/scrcpy.ts`):
  `--new-display=1920x1080/160`, `--max-fps=60`, `--video-bit-rate=16M`,
  `--display-ime-policy=local`, `--no-audio`, `--window-title=SmartDex`.
  These are the exact flags from the verified recipe.
- **Freeform adb commands** (`src/main/device.ts`):
  - read:  `adb -s <serial> shell settings get global enable_freeform_support`
  - enable: `adb -s <serial> shell settings put global enable_freeform_support 1`
  - This is the Taskbar-proven pattern — the open-source Taskbar app
    (farmerbb/Taskbar) uses the same global setting to enable freeform
    multi-window mode on stock (non-root) devices, so the API surface is
    real and does not require root.
- **Display-id discovery is dynamic, not assumed** (`src/main/displays.ts`):
  parses `adb -s <serial> shell dumpsys display`, finds the scrcpy-created
  virtual display, and reads its id from a nearby `mDisplayId=N` /
  `Display N:` line. It does not hardcode display 1.
- **`npm run dist` and the lockfile** — `windows-app/package.json` has a
  `dist` script (`tsc && electron-builder --config electron-builder.yml`)
  and a committed `package-lock.json` (generated 2026-10-10), so the CI's
  `npm ci` has a lockfile to work from.
- **Workflow YAML is valid** — `.github/workflows/build.yml` and
  `windows-app/electron-builder.yml` both parse and assert the key fields
  (appId `com.smartdex.app`, productName `SmartDex`, NSIS target, x64 arch,
  `smartdex-installer` artifact, tag-gated release). CI has never run yet
  (no push since these files were added).

## Needs Ashar's on-device test

Everything below requires a real phone. Target device: **moto g54**.

### Blockers before the test

1. The helper APK (`windows-app/resources/apk/smartdex-helper.apk`) has not
   been delivered yet — the Android agent owns it. Connect will stop at the
   "helper APK missing" message until it exists. The adb/scrcpy path can be
   smoke-tested without it; the full desktop flow cannot.
2. CI has never run: the first push to main is the first real installer
   build. Expect the SmartScreen warning (installer is unsigned — documented,
   not a bug).

### Exact manual test steps (moto g54 + Windows 10/11 x64)

1. **Phone prep** — Settings > About phone > tap Build number 7 times.
   Settings > System > Developer options > enable **USB debugging**.
2. **Install** — run the `SmartDex-*.exe` from the CI artifact (or GitHub
   Release). Expect the SmartScreen blue box: "Windows protected your PC" →
   **More info → Run anyway**.
3. **Connect phone via USB.** On the phone, accept the "Allow USB debugging?"
   prompt (check "Always allow from this computer").
4. **Launch SmartDex, check the first-run checklist** — adb available, device
   detected, device authorized should all be green; freeform will be red.
5. **Press Connect.** Expect the log: `[adb] freeform support is off —
   enabling it (one-time)`, then a reboot prompt: "Freeform multi-window
   mode was just enabled. REBOOT YOUR PHONE, then press Connect again."
   - **Record:** does the moto g54 actually require the reboot, or does
     freeform take effect immediately? (The app errs on the side of asking.)
6. **Reboot the phone, press Connect again.** Expect:
   `[adb] freeform support enabled` → `[adb] installing helper APK…` →
   `[scrcpy] starting virtual display 1920x1080…` →
   `[adb] virtual display id = N`.
   - **Record the value of N.** The code finds it dynamically; we want to
     know whether it is 1 on the moto g54 (expected) or something else.
   - **Record:** does the scrcpy window show the helper desk UI?
7. **Desktop interaction** — open the start menu, launch a real app (e.g.
   Settings or Chrome).
   - **Record:** does the app open as a **freeform window on the virtual
     display** (not fullscreen on the phone)? This is the make-or-break
     question: does the moto g54 honor `enable_freeform_support` on
     **virtual displays**? Some devices enable freeform on the physical
     screen but ignore it on virtual displays.
   - **Record:** mouse click/drag, keyboard input, right-click = back.
8. **Press Disconnect.**
   - **Record:** does the scrcpy window close, the virtual display get
     destroyed (`adb shell dumpsys display` no longer lists it), and the
     phone return to exactly its prior state? (`enable_freeform_support`
     stays 1 by design — that is the one-time setting, not leftover state.)
9. **Repeat step 6 once more** (second Connect, no reboot this time) to
   confirm the steady-state path works without the one-time setup.

### Things to watch for and report back

- If step 7 fails (app opens fullscreen or on the phone screen instead of a
  freeform window on the virtual display), the freeform-on-virtual-display
  assumption is wrong for the moto g54 and the launch path needs rework —
  do not "fix" by assuming; report the exact behavior.
- If any adb command in the log errors, paste the exact log lines.
- Confirm the helper APK installs and the start menu shows the phone's
  real apps + icons once the Android agent delivers the APK.
