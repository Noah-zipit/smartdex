# SmartDex Helper (Android)

Tiny dependency-free helper APK (`com.smartdex.helper`) that draws the actual
desktop on the phone's scrcpy virtual display. Not a home-screen replacement —
just one activity.

## Launch

The Windows app launches it onto the virtual display:

```
adb shell am start --display <id> -n com.smartdex.helper/.DeskActivity
```

The activity reads which display it is on and opens tapped apps as freeform
windows on that same display.

## What it does

- Fullscreen `DeskActivity`: code-drawn wallpaper (gradient + dot grid, zero assets),
  clock + date, searchable app grid (5 columns, icon + label).
- App list: `packageManager.queryIntentActivities(ACTION_MAIN + CATEGORY_LAUNCHER)` —
  the Taskbar-proven pattern, sorted alphabetically. `QUERY_ALL_PACKAGES` is
  declared so Android 11+ sees every installed app.
- Tap an app → launched freeform, centered, at ~75% of the display size, via the
  public `ActivityOptions` API (`setLaunchWindowingMode(5)` /
  `setLaunchDisplayId(...)` / `setLaunchBounds(...)`). No special permission is
  needed on API 28+. If a launch ever fails, the failure is logged and the
  Windows app can fall back to `am start --display <id> --windowingMode 5`.

## Build

Needs a JDK 17+ and the Android SDK (platform 34 + build-tools 34):

```
export ANDROID_HOME=/path/to/Android/Sdk
cd android-helper
./gradlew assembleDebug
```

The debug APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Copy it to
`windows-app/resources/apk/smartdex-helper.apk` so the Windows app can install
it via `adb install`.

If Gradle's network access is blocked (some sandboxes), `build-manual.sh`
builds the same APK directly with aapt2 + kotlinc + d8 + apksigner
(requires the same JDK/SDK plus a Kotlin compiler dist and the androidx
artifacts from `tools/fetch-deps.py`; see the script header).
