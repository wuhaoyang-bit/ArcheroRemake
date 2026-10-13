#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
toolchain="$PWD/analysis/android-toolchain"
if [[ -z "${JAVA_HOME:-}" && -d "$toolchain/amazon-corretto-17.jdk/Contents/Home" ]]; then
  export JAVA_HOME="$toolchain/amazon-corretto-17.jdk/Contents/Home"
fi
if [[ -z "${ANDROID_HOME:-}" && -d "$toolchain/sdk/platforms" ]]; then
  export ANDROID_HOME="$toolchain/sdk"
fi
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$toolchain/gradle-cache}"
mkdir -p "$toolchain"
if [[ -n "${ANDROID_HOME:-}" ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
fi
if [[ ! -f "$toolchain/archero-debug.keystore" ]]; then
  "${JAVA_HOME:?Set JAVA_HOME to JDK 17}/bin/keytool" -genkeypair \
    -keystore "$toolchain/archero-debug.keystore" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname 'CN=ArcheroRemake Debug,O=ArcheroRemake,C=CN'
fi
(cd android && ./gradlew assembleDebug)
mkdir -p releases
cp android/app/build/outputs/apk/debug/app-debug.apk releases/ArcheroRemake-v0.1.0-debug.apk
printf '\nAPK: %s/releases/ArcheroRemake-v0.1.0-debug.apk\n' "$PWD"
