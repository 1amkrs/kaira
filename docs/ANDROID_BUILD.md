# Building Kaira for Android & Android TV

Kaira ships with two Android targets:

1. **Installable Android PWA** (works immediately on Chrome for Android & Android TV browsers)
2. **Native Android / Android TV APK Project** located in `android/` (supports both touchscreens and Android TV Leanback D-pad remotes)

## Option 1: Install as an Android PWA

1. Open the hosted Kaira URL in Chrome on your Android phone, tablet, or TV.
2. Tap **Install Android App** inside **Settings -> System Information**, or use Chrome's **Install app / Add to Home screen** menu.
3. Kaira launches standalone without browser chrome and integrates with Android MediaSession lock-screen / notification controls.

## Option 2: Build the Native Android APK

### Prerequisites
- JDK 17+
- Android Studio (or Android SDK Platform 35 + Build Tools)

### Steps
1. Build and sync the web bundle into the Android project assets:
   ```bash
   npm run build:android
   ```
2. Open the `android/` folder in **Android Studio**, or build from the command line if Gradle/Android SDK is configured:
   ```bash
   cd android
   gradle assembleDebug
   ```
3. The debug APK will be output to `android/app/build/outputs/apk/debug/app-debug.apk`.
4. Install onto an Android phone or Android TV via ADB:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
