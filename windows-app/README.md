# SmartDex — Windows app

Electron + TypeScript desktop app. Connects to an Android phone over USB, spawns a
virtual 1920x1080 display via scrcpy, and launches the SmartDex helper desk UI on it.

## Dev setup

```bash
cd windows-app
npm install
npm run dev      # builds (tsc) and launches Electron
npm run build    # tsc only, emits to dist/
npm run watch    # tsc --watch for the main process
```

`npm run dist` builds then runs `electron-builder --config electron-builder.yml`
(the `.yml` is owned by the packaging agent — don't edit it here).

## How resources/ gets populated

`resources/` is bundled into the installer by electron-builder (see `electron-builder.yml`).
Its contents are fetched by the packaging agent's `scripts/fetch-binaries.js` — don't
hand-place files there; re-run the fetch script if something is missing.

| Path | Contents | Status |
|---|---|---|
| `resources/bin/adb/` | platform-tools adb for Windows | fetched |
| `resources/bin/scrcpy/` | scrcpy **v5.0.1** for Windows | fetched, version verified in binary |
| `resources/apk/smartdex-helper.apk` | Android helper app (built by the android-helper project) | **not yet delivered** — app shows a clear error until it's in place |

If `adb`/`scrcpy` are absent in dev, the app falls back to `adb` on PATH; scrcpy has no
fallback and fails with an explicit message.

You can also point the app at any resources dir with the `SMARTDEX_RESOURCES` env var.

## How Connect works (`src/main/connection.ts`)

1. Verifies bundled scrcpy exists.
2. `adb devices` — no device → "connect USB with USB debugging on"; `unauthorized` →
   "accept the RSA prompt on the phone".
3. Checks `settings get global enable_freeform_support`. If `0`, sets it to `1` and
   STOPS with a reboot banner — Android requires a reboot after first enabling it.
   Next Connect proceeds past this step.
4. Checks `pm list packages com.smartdex.helper`; installs `resources/apk/smartdex-helper.apk`
   if missing (clear error if the APK isn't there yet).
5. Spawns scrcpy with the pinned flags:
   `--new-display=1920x1080/160 --max-fps=60 --video-bit-rate=16M --display-ime-policy=local --no-audio --window-title=SmartDex`.
   stdout/stderr stream into the UI log.
6. Parses `dumpsys display` for the virtual display id (retries ~10s), then
   `am start --display <id> -n com.smartdex.helper/.DeskActivity`.

**Disconnect** kills scrcpy (its virtual display is destroyed automatically, phone left
clean). Freeform is intentionally left ON — flipping it back would cost another reboot.

## Source layout

- `src/main/adb.ts` — locate bundled adb, run commands, `AdbError` with detail
- `src/main/device.ts` — `adb devices` parsing, freeform get/set
- `src/main/helper.ts` — helper APK check/install/launch
- `src/main/scrcpy.ts` — spawn/kill scrcpy, pinned flags, log streaming
- `src/main/displays.ts` — find the scrcpy virtual display id from `dumpsys display`
- `src/main/connection.ts` — the Connect/Disconnect orchestration + checklist
- `src/main/main.ts` + `preload.ts` — Electron wiring (contextIsolation, typed IPC)
- `src/renderer/` — single dark UI: status, checklist, Connect/Disconnect, log console
