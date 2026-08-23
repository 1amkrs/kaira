# TV OS System Architecture

## 1. Operating System Vision & Philosophy

**TV OS** is a dedicated, bootable Linux-based personal TV appliance operating system inspired by the design principles of **SteamOS**, **Google TV**, **Apple tvOS**, and **Xbox Console UX**.

The appliance operates under a strict principle:
- **Linux is the Operating System** (Kernel, systemd, Wayland compositor, PipeWire, Mesa/DRM/KMS drivers).
- **Electron is the TV Shell Runtime** (Wayland client hosting the React 10-foot UI with GPU acceleration).
- **The underlying Linux desktop is completely invisible** during normal operation.

```
┌─────────────────────────────────────────────────────────────┐
│                       Hardware Layer                        │
│          PC / Laptop (x86_64)   •   Raspberry Pi 5 (ARM64)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Bootloader / Firmware                    │
│             UEFI / GRUB         •   RPi EEPROM / config.txt │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         Linux Kernel                        │
│             Mesa DRM / KMS      •   V4L2 / VideoCore VII    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    systemd Appliance Core                   │
│        PipeWire Audio   •   BlueZ   •   NetworkManager      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Wayland Kiosk Compositor                   │
│              Cage Kiosk / Weston / Labwc Compositor         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   TV OS Electron Runtime                    │
│     Wayland Ozone Client   •   Node.js Platform Adapters    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│              Decoupled OS Platform Services                 │
│ PlayerService • MediaService • ControllerService • Display  │
│  AudioService • AmbientLight • NetworkService • SystemInfo  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                     TV Shell React UI                       │
│    Spatial Nav Focus Engine • Cinematic 10-foot Rails UI    │
│  Home • Movies • Shows • Music • Games • Apps • Settings    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Boot Sequence & Appliance Lifecycle

```
POWER ON
   │
   ▼
Bootloader (GRUB / RPi Bootloader)
[quiet splash vt.global_cursor_default=0 loglevel=0]
   │
   ▼
Linux Kernel Initialization
(DRM/KMS modesetting to native TV resolution 4K/1440p/1080p)
   │
   ▼
systemd Target: graphical.target
(Starts NetworkManager, PipeWire, BlueZ, Bluetooth Controller Pairing)
   │
   ▼
systemd Service: tvos.service (Supervisor: Restart=always, RestartSec=2)
   │
   ▼
Wayland Kiosk Compositor (Cage)
   │
   ▼
TV OS Shell Runtime (Electron in Ozone Wayland mode)
   │
   ▼
Cinematic Splash Screen & Hardware Readiness Probe
(Kernel OK, Xbox Controller Detected, Audio Engine Ready, Ambient Sync Active)
   │
   ▼
TV OS Home Screen
```

---

## 3. Platform Abstraction Layer (`src/platform/`)

The application core is completely decoupled from operating system APIs and CPU architectures:

```
src/platform/
├── types.ts                   # Master interfaces (IPlatformAdapter, IDisplayAdapter, etc.)
├── factory.ts                 # Runtime capability & environment detector
├── index.ts                   # Singleton platform access point
├── linux/
│   ├── common/
│   │   ├── LinuxPlatformAdapter.ts   # Wayland display, PipeWire audio, systemctl power
│   │   ├── LinuxDisplayAdapter.ts    # Wayland Ozone & X11 fallback query
│   │   ├── LinuxAudioAdapter.ts      # PipeWire & PulseAudio device routing
│   │   ├── LinuxControllerAdapter.ts # evdev / SDL / Gamepad API normalization
│   │   ├── LinuxPowerAdapter.ts      # systemctl suspend, reboot, poweroff
│   │   ├── LinuxSystemAdapter.ts     # /etc/os-release, /proc/cpuinfo, /proc/meminfo
│   │   └── LinuxProcessAdapter.ts    # xdg-open, native Linux process spawn
│   ├── x86_64/
│   │   └── LinuxX64Adapter.ts        # Intel / AMD / NVIDIA VA-API & NVDEC acceleration
│   └── arm64/
│       └── LinuxARM64Adapter.ts      # Raspberry Pi 5 VideoCore VII & V4L2 hardware path
└── windows/
    └── WindowsPlatformAdapter.ts     # DirectX / D3D11 / WASAPI development shell
```

---

## 4. Decoupled OS Services Architecture (`src/services/`)

All services are standalone TypeScript singletons that expose clean interfaces and maintain runtime state independently:

| Service | Responsibility | Fault Tolerance Policy |
|---|---|---|
| `PlayerService` | High-level playback lifecycle, queue management, subtitles, intro skip, playback state machine. | Restarts driver on fatal media error; emits status events. |
| `MediaService` | Unified provider abstraction (`search`, `getMovies`, `getShows`, `getMusic`, `getArtwork`, `getStream`). | Returns degraded cached results if network or remote source is unreachable. |
| `ControllerService` | Gamepad polling loop (60 FPS), axis deadzone filtering, repeat accelerators, and semantic event normalization. | Falls back to keyboard navigation instantly. |
| `AmbientLightService` | Screen frame color extraction and Tuya smart bulb (Syska/Wipro) network synchronization. | Optional feature; TCP timeouts do not block boot or playback. |
| `DisplayService` | Normalized display queries, resolution setting, refresh rate, HDR detection, and borderless fullscreen. | Graceful fallback to default screen dimensions. |
| `AudioService` | Audio output device enumeration (HDMI, Bluetooth, USB), volume scaling, mute control. | Falls back to default system audio sink. |
| `NetworkService` | Live Ethernet, Wi-Fi, and Internet connectivity monitoring. | Emits network change events; shell remains usable offline. |
| `PowerService` | System sleep/suspend, restart, and power-down dispatcher. | Dispatches systemd/OS-specific power commands. |
| `AppService` | Registry for native Linux games/apps, Steam Big Picture, RetroArch, streaming targets. | Captures launch exceptions and provides UI feedback toasts. |
| `UpdateService` | Future A/B atomic immutable system update architecture stub. | Non-blocking background checks. |
| `SystemService` | Real-time system diagnostics (OS, Kernel, CPU, RAM, GPU, Video Dec, Storage, Audio). | Gathers metrics via IPC and system adapters. |

---

## 5. Player Architecture & Capability Matrix

The Player engine utilizes a driver/backend abstraction:

```
                  PlayerService
                        │
             PlayerEngineController
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
    Capability Matrix         SubtitleEngine
  (Hardware Decode/Codecs)    AudioBoostEngine
            │
  ┌─────────┼─────────┬─────────┐
  ▼         ▼         ▼         ▼
Native     MPV     YouTube    Embed
Driver    Driver   Driver    Driver
(HTML5/   (Linux/  (Leanback) (Sandboxed
 HLS)      Pipe)              Iframe)
```

### Runtime Capability Detection
- `capabilities.video.hardwareDecode`: VA-API (Intel/AMD), NVDEC (NVIDIA), VideoCore VII (RPi5), D3D11 (Windows).
- `capabilities.video.codecs`: Verified runtime support for H.264 (AVC), H.265 (HEVC), AV1, VP9.
- `capabilities.display.hdr`: HDR10 / Wide Color Gamut pass-through.

---

## 6. Controller Semantic Normalization

Raw hardware inputs are normalized before reaching the spatial focus engine:

| Semantic Action | Xbox Controller (USB / Bluetooth) | Keyboard Fallback |
|---|---|---|
| `NAV_UP` | D-Pad Up / Left Analog Stick Up | ArrowUp |
| `NAV_DOWN` | D-Pad Down / Left Analog Stick Down | ArrowDown |
| `NAV_LEFT` | D-Pad Left / Left Analog Stick Left | ArrowLeft |
| `NAV_RIGHT` | D-Pad Right / Left Analog Stick Right | ArrowRight |
| `SELECT` | Button 0 (A / Cross) | Enter / Space |
| `BACK` | Button 1 (B / Circle) | Escape / Backspace |
| `PLAY_PAUSE` | Button 0 (in player) / Button 2 (X) | Space / k |
| `SEEK_FORWARD` | D-Pad Right (in player) / RB | ArrowRight / l |
| `SEEK_BACKWARD` | D-Pad Left (in player) / LB | ArrowLeft / j |
| `SUBTITLES` | Button 3 (Y) in player | s |
| `MENU` | Button 9 (Menu / Start) | m |
| `SEARCH` | Button 8 (View / Select) / Button 2 (X) | / or y |

---

## 7. Native Dependencies & Portability Audit

| Dependency | Type | Windows x64 | Linux x86_64 | Linux ARM64 (RPi 5) | Notes |
|---|---|---|---|---|---|
| `react` / `react-dom` | Pure JS | Yes | Yes | Yes | 100% portable web standard. |
| `hls.js` | Pure JS | Yes | Yes | Yes | Standard MediaSource Extensions (MSE). |
| `lucide-react` | Pure JS | Yes | Yes | Yes | Pure SVG icons. |
| `lottie-web` | Pure JS | Yes | Yes | Yes | Canvas / SVG animation renderer. |
| `clsx` | Pure JS | Yes | Yes | Yes | Utility for class composition. |
| `electron` | Prebuilt Binary | Yes | Yes | Yes | Official x86_64 and ARM64 Linux builds. |

**Audit Conclusion**: Zero native C++ node-gyp bindings that require architecture-specific compilation exist in user-space dependencies. The application is 100% portable across Windows x64, Linux x86_64, and Linux ARM64.

---

## 8. Build & Packaging Targets

1. **Linux x86_64 Appliance Image**:
   - `dist/images/TVOS-x86_64.iso`: Hybrid bootable live Linux ISO (UEFI & BIOS) booting directly to Wayland kiosk TV OS.
2. **Linux ARM64 Raspberry Pi 5 Appliance Image**:
   - `dist/images/TVOS-aarch64.img`: Raw flashable microSD image with Raspberry Pi kernel, VideoCore VII GPU acceleration, and Wayland kiosk TV OS.
3. **Development Application Builds**:
   - Linux x86_64: `dist/linux-x64/`
   - Linux ARM64: `dist/linux-arm64/`
   - Windows x64: `dist/windows-x64/`
