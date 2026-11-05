# The toolchain scripts/build-android.sh builds the Android app with: a JDK, the Android SDK (the
# parts the Gradle build uses, so it never has to install any) and Bun.
FROM oven/bun:1.4.2-slim AS bun

FROM eclipse-temurin:21.0.12_8-jdk-noble
ENV ANDROID_HOME=/opt/android-sdk
# Google's SDK command-line tools 23.0; the checksum is the one in dl.google.com/android/repository/repository2-3.xml.
ARG TOOLS=commandlinetools-linux-16111833_latest.zip
ARG TOOLS_SHA1=e025545c62a8e64c7559119566a569fb1dec5f60
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
 && curl -fsSLo /tmp/tools.zip "https://dl.google.com/android/repository/$TOOLS" \
 && echo "$TOOLS_SHA1  /tmp/tools.zip" | sha1sum -c - \
 && unzip -q /tmp/tools.zip -d /tmp && rm /tmp/tools.zip \
 && yes | /tmp/cmdline-tools/bin/sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null \
 && /tmp/cmdline-tools/bin/sdkmanager --sdk_root="$ANDROID_HOME" "platforms;android-36" "build-tools;35.0.0" platform-tools >/dev/null \
 && rm -rf /tmp/cmdline-tools
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
