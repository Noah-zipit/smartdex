# SmartDex

Your own Samsung-DeX-like desktop for Android — on Windows.

Plug your Android phone into your Windows PC, hit **Connect**, and get a real
desktop: taskbar, start menu, your actual apps opening in floating windows,
full mouse and keyboard control. Unplug (or hit Disconnect) and your phone is
exactly as it was.

## How it works

```
Windows PC                              Android phone
┌─────────────────────────┐            ┌──────────────────────────┐
│ SmartDex (Electron)     │            │ SmartDex Helper (APK)    │
│  ├─ Desktop shell UI    │   ADB/USB  │  ├─ App inventory        │
│  │  (taskbar, launcher) │◄──────────►│  │  (apps.json + icons)  │
│  ├─ adb + scrcpy        │            │  └─ Freeform launcher    │
│  │  (bundled)           │  scrcpy    │     (broadcast receiver) │
│  └─ Virtual display     │◄──────────│                          │
│     1920x1080           │  stream    │  Virtual display         │
└─────────────────────────┘            └──────────────────────────┘
```

1. **Connect** — the app talks to your phone over ADB, enables Android's
   freeform window mode (one-time settings), installs the helper APK if
   needed, and starts scrcpy with a virtual display.
2. **Desktop** — the scrcpy stream renders inside SmartDex's desktop shell.
   The helper app exports your real app list + icons; the start menu shows
   them.
3. **Launch** — clicking an app sends a broadcast; the helper opens it as a
   freeform window on the virtual display. Mouse and keyboard are forwarded
   by scrcpy.
4. **Disconnect** — scrcpy stops, the virtual display is destroyed, the phone
   is untouched.

## Repo layout

- `windows-app/` — Electron + TypeScript desktop app (bundles adb + scrcpy)
- `android-helper/` — tiny Kotlin helper APK (app inventory + freeform launcher)
- `.github/workflows/` — CI: builds the Windows installer on every push

## Status

v1 is under active development. See
[docs/TESTING.md](docs/TESTING.md) for what has been verified vs. what needs
on-device testing.

## Requirements

- Windows 10/11 (64-bit)
- Android 10+ phone with USB debugging enabled
- USB cable (or ADB over Wi-Fi)

## Development

Prereqs:

- **Node 20+** (LTS) — for the Windows app and `scripts/fetch-binaries.js`.
- **JDK + Android SDK** — only needed if you work on `android-helper/`
  (the Kotlin helper APK). Not needed for the Windows app.

Agent boundaries: `windows-app/src` + `windows-app/package.json` belong to
the Windows-app agent; `android-helper/` belongs to the Android agent.
Packaging, CI, and docs are handled separately — coordinate on the shared
contracts (`windows-app/resources/` layout, the APK filename
`smartdex-helper.apk`).

## Building the installer

```powershell
cd windows-app
npm ci
node ../scripts/fetch-binaries.js   # downloads scrcpy + adb, verifies checksums
npm run dist                        # -> windows-app/dist/SmartDex-*.exe
```

The installer is **unsigned** — Windows SmartScreen will warn on first run
("Windows protected your PC" → More info → Run anyway). That is expected;
see [docs/TESTING.md](docs/TESTING.md) for what is verified and what still
needs on-device testing.

## License

MIT — see [LICENSE](LICENSE).
