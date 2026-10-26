#!/bin/bash
# Fallback APK builder for the SmartDex helper (no Gradle needed).
#
# The normal build is `./gradlew assembleDebug` (needs JDK 17 + Android SDK).
# This script exists because some sandboxes block Gradle's network access;
# it drives aapt2 + kotlinc + d8 + apksigner directly and produces a byte-
# equivalent debug APK. The APK committed at windows-app/resources/apk/
# smartdex-helper.apk was produced with this script.
#
# Requirements (env-overridable):
#   JAVA_HOME     -> JDK 17+                          (default ~/workspace/jdk/jdk17)
#   ANDROID_HOME  -> Android SDK with platforms/android-34
#                    and build-tools/34.0.0           (default ~/workspace/sdk)
#   KOTLINC_HOME  -> Kotlin compiler 2.0.20 dist      (default ~/workspace/kotlinc/kotlinc)
#   APKLIBS       -> dir with downloaded androidx artifacts
#                    (default ~/workspace/apklibs; run tools/fetch-deps.py first)
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-$HOME/workspace/jdk/jdk17}"
export PATH="$JAVA_HOME/bin:${KOTLINC_HOME:-$HOME/workspace/kotlinc/kotlinc}/bin:$PATH"
SDK="${ANDROID_HOME:-$HOME/workspace/sdk}"
BT="$SDK/build-tools/34.0.0"
AAPT2="$BT/aapt2"; D8="$BT/d8"; ZIPALIGN="$BT/zipalign"; APKSIGNER="$BT/apksigner"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/app/src/main"
LIBS="${APKLIBS:-$HOME/workspace/apklibs}/libs"
WORK="${WORK:-/tmp/apkbuild}"
rm -rf "$WORK"; mkdir -p "$WORK"

AARD="$WORK/aar"
mkdir -p "$AARD"
for spec in "recyclerview-1.3.2:recyclerview" "core-1.7.0:core" "customview-1.0.0:customview" "customview-poolingcontainer-1.0.0:cvpool"; do
  a="${spec%%:*}"; d="${spec##*:}"
  unzip -q -o "$LIBS/$a.aar" -d "$AARD/$d" "classes.jar" "AndroidManifest.xml"
  # res/ is absent from some AARs (e.g. customview) — that is fine.
  unzip -q -o "$LIBS/$a.aar" -d "$AARD/$d" "res/*" 2>/dev/null || true
done
RV_JAR="$AARD/recyclerview/classes.jar"; CORE_JAR="$AARD/core/classes.jar"
CV_JAR="$AARD/customview/classes.jar"; CVP_JAR="$AARD/cvpool/classes.jar"

echo "=== 1. compile resources ==="
$AAPT2 compile --dir "$APP/res" -o "$WORK/app_res.zip"
$AAPT2 compile --dir "$AARD/recyclerview/res" -o "$WORK/rv_res.zip"
$AAPT2 compile --dir "$AARD/core/res" -o "$WORK/core_res.zip"

echo "=== 2. link ==="
$AAPT2 link -o "$WORK/app-unsigned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$APP/AndroidManifest.xml" \
  --min-sdk-version 28 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0 \
  --java "$WORK/gen" \
  --extra-packages androidx.recyclerview:androidx.core \
  "$WORK/app_res.zip" "$WORK/rv_res.zip" "$WORK/core_res.zip"

echo "=== 3. kotlinc ==="
STDLIB="${KOTLINC_HOME:-$HOME/workspace/kotlinc/kotlinc}/lib/kotlin-stdlib.jar"
CP="$ANDROID_JAR:$RV_JAR:$CORE_JAR:$CV_JAR:$CVP_JAR:$LIBS/annotation-1.1.0.jar:$LIBS/collection-1.0.0.jar:$STDLIB"
mkdir -p "$WORK/classes"
kotlinc -jvm-target 17 -cp "$CP" -d "$WORK/classes" \
  "$APP"/java/com/smartdex/helper/*.kt \
  $(find "$WORK/gen" -name "*.java")

echo "=== 4. d8 ==="
mkdir -p "$WORK/dex"
$D8 --min-api 28 --lib "$ANDROID_JAR" --output "$WORK/dex" \
  $(find "$WORK/classes" -name "*.class") \
  "$RV_JAR" "$CORE_JAR" "$CV_JAR" "$CVP_JAR" \
  "$LIBS/annotation-1.1.0.jar" "$LIBS/collection-1.0.0.jar" "$STDLIB"

echo "=== 5. package, align, sign ==="
cp "$WORK/app-unsigned.apk" "$WORK/app.apk"
(cd "$WORK/dex" && zip -q -0 -j "$WORK/app.apk" classes.dex)
$ZIPALIGN -f 4 "$WORK/app.apk" "$WORK/app-aligned.apk"
KS="${DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Android Debug,O=Android,C=US" 2>/dev/null
fi
$APKSIGNER sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$WORK/smartdex-helper.apk" "$WORK/app-aligned.apk"
$APKSIGNER verify "$WORK/smartdex-helper.apk" && echo "SIGNATURE OK"
ls -la "$WORK/smartdex-helper.apk"
