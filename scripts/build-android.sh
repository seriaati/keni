#!/usr/bin/env bash
# Builds the signed Android app (frontend/android) in Docker, so no Android SDK is needed. Nothing
# of your server is built in: the app asks for its address.
# Usage: scripts/build-android.sh
#        VERSION_NAME=1.2.0 VERSION_CODE=10200 scripts/build-android.sh   (default: dev, 1)
# The first build creates the signing key, frontend/android/keni.keystore with its password in
# keystore.properties, and later builds reuse it. Back both up: Android installs an update only
# when it is signed with the same key.
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE=keni-android-build
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/keni-android" # Gradle, Bun and the last build's files
ANDROID=frontend/android

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

export VERSION_NAME=${VERSION_NAME:-} VERSION_CODE=${VERSION_CODE:-}
[[ -z $VERSION_CODE || $VERSION_CODE =~ ^[1-9][0-9]*$ ]] || die "VERSION_CODE must be a positive whole number."
command -v docker >/dev/null || die "docker is not installed."

say "Preparing the build image"
docker build --quiet --tag "$IMAGE" - < scripts/android.Dockerfile >/dev/null
mkdir -p "$CACHE"
# As you, so what it writes is yours. Java takes its home from the user database, not $HOME.
run() {
  docker run --rm --user "$(id -u):$(id -g)" -v "$CACHE:/cache" -v "$PWD/frontend:/src" \
    -e HOME=/cache/home -e JAVA_TOOL_OPTIONS=-Duser.home=/cache/home -e GRADLE_USER_HOME=/cache/gradle \
    -e BUN_INSTALL_CACHE_DIR=/cache/bun -e VERSION_NAME -e VERSION_CODE "$IMAGE" "$@"
}

if [[ ! -f $ANDROID/keni.keystore ]]; then
  [[ ! -f $ANDROID/keystore.properties ]] || die "$ANDROID/keystore.properties exists without keni.keystore."
  say "Creating the signing key"
  password=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  run keytool -genkeypair -keystore /src/android/keni.keystore -storepass "$password" -keypass "$password" \
    -alias keni -keyalg RSA -keysize 4096 -validity 36500 -dname CN=keni 2>/dev/null
  chmod 600 "$ANDROID/keni.keystore"
  (umask 077 && printf 'password=%s\n' "$password" > "$ANDROID/keystore.properties")
  printf 'Back up %s/keni.keystore and %s/keystore.properties: updates need them.\n' "$ANDROID" "$ANDROID"
fi
[[ -f $ANDROID/keystore.properties ]] || die "$ANDROID/keystore.properties (the keystore's password) is missing."

say "Building the app"
# A copy in the cache: node_modules there are Linux's, and survive to the next build.
run bash -euo pipefail -c '
  mkdir -p /cache/work && rm -rf /cache/work/android
  tar -C /src -c --exclude=android/app/build --exclude=android/build --exclude=android/.gradle \
    --exclude=android/keni.apk package.json bun.lock capacitor.config.ts android | tar -C /cache/work -x
  cd /cache/work
  bun install --frozen-lockfile --silent
  bun x --bun cap sync android
  cd android && ./gradlew --no-daemon --quiet assembleRelease \
    ${VERSION_NAME:+-PversionName="$VERSION_NAME"} ${VERSION_CODE:+-PversionCode="$VERSION_CODE"}
  cp app/build/outputs/apk/release/app-release.apk /src/android/keni.apk'

say "Done: $ANDROID/keni.apk"
echo "Copy it to your phone and open it to install (allow installing from that app when asked)."
