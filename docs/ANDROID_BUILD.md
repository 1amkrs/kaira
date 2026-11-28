# Building Kaira for Android TV (Google TV, Nvidia Shield, Fire TV, Android)

Kaira ships as a complete native Android TV & Android APK project under `android/` with:

- **Embedded 127.0.0.1 Local Server (`KairaLocalServer.kt`)**: Serves bundled Kaira pages and proxies `/api/*`, `/s/`, `/f/`, and `/k/` with `Referer`, `Range`/`206` byte-range forwarding, binary segment streaming, and `.m3u8` URL rewriting so 4K HLS streams play directly on Android TV with zero external backend required.
- **Native Hardware-Accelerated Media3 ExoPlayer (`TvPlayerActivity.kt`)**: Fullscreen 4K/HD HLS player with D-pad 10s rewind/forward, instant server switching (`Kaira 4K`, `Aldebaran`, `Vega`, `Sirius`, etc.), automatic failover, and automatic Continue Watching progress sync back to Kaira.
- **Leanback TV Launcher & 10-Foot Spatial Navigation**: Supports Android TV Leanback banner (`LEANBACK_LAUNCHER`), full D-pad directional focus across rails, hero CTAs, episodes, and modals, plus remote `Back`, `Search`, and media playback keys.

## Option 1: Build APK via GitHub Actions (No Android Studio Required)

1. Push this repository to GitHub (or run the **Build Android TV APK** workflow manually from the **Actions** tab).
2. Download the **`kaira-android-tv-apk`** artifact (`app-debug.apk`).
3. Sideload onto your Android TV / Google TV / Nvidia Shield / Fire TV:
   ```bash
   adb connect <YOUR_TV_IP>:5555
   adb install -r app-debug.apk
   ```

## Option 2: Build Locally with Android Studio or Gradle

### Prerequisites
- Node.js 20+
- JDK 17+
- Android Studio (or Android SDK Platform 35 + Build Tools)

### Steps
1. Build and sync the Kaira web bundle into the Android TV project assets:
   ```bash
   npm run build:android
   ```
2. Open the `android/` folder in **Android Studio**, or build from the command line:
   ```bash
   cd android
   gradle testDebugUnitTest assembleDebug
   ```
3. Install the generated APK (`android/app/build/outputs/apk/debug/app-debug.apk`) on your TV:
   ```bash
   adb connect <YOUR_TV_IP>:5555
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

## Previewing Android TV D-Pad Mode in the Browser

Open `http://localhost:3000/?android=tv` to test the 10-foot Android TV focus rings and D-pad arrow-key navigation (`ArrowUp`/`Down`/`Left`/`Right`, `Enter`, `Backspace`/`Escape`) directly on desktop.
