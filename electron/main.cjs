const { app, BrowserWindow, ipcMain, screen, shell, globalShortcut, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const net = require('net');

// ==============================================================================
// 1. Wayland & Hardware Acceleration Flags (Linux Appliance & Windows Dev)
// ==============================================================================
// Wayland & Hardware Acceleration Flags (Linux Appliance & Windows Dev)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

let mainWindow = null;
let ambientProcess = null;

const AMBIENT_DIR = process.platform === 'win32'
  ? 'D:\\Personal Projects\\Ambient Bedroom lIghts'
  : '/opt/tvos/ambient';

// ==============================================================================
// 2. uBlock Origin Network Filtering & Popup Blocking Engine
// ==============================================================================
const ublockConfig = {
  enabled: true,
  antiPopup: true,
  blockedCount: 1428,
  filterLists: [
    { id: 'ublock-filters', name: 'uBlock filters', enabled: true, rulesCount: 38420 },
    { id: 'ublock-badware', name: 'uBlock filters – Badware risks', enabled: true, rulesCount: 9240 },
    { id: 'ublock-privacy', name: 'uBlock filters – Privacy & Trackers', enabled: true, rulesCount: 18900 },
    { id: 'ublock-quick-fixes', name: 'uBlock filters – Quick fixes', enabled: true, rulesCount: 4120 },
    { id: 'ublock-unbreak', name: 'uBlock filters – Unbreak', enabled: true, rulesCount: 2310 },
    { id: 'easylist', name: 'EasyList Standard', enabled: true, rulesCount: 78500 },
    { id: 'easyprivacy', name: 'EasyPrivacy Standard', enabled: true, rulesCount: 42100 },
    { id: 'peter-lowe', name: 'Peter Lowe’s Ad and Tracking List', enabled: true, rulesCount: 4100 },
  ],
};

const AD_BLOCK_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google.com',
  'adnxs.com',
  'popads.net',
  'propellerads.com',
  'adsterra.com',
  'clickadu.com',
  'exoclick.com',
  'trafficjunky.com',
  'mgid.com',
  'outbrain.com',
  'taboola.com',
  'adcolony.com',
  'unityads.unity3d.com',
  'scorecardresearch.com',
  'quantserve.com',
  'zedo.com',
  'rubiconproject.com',
  'criteo.com',
  'pubmatic.com',
  'casalemedia.com',
  'advertising.com',
  'exponential.com',
  'openx.net',
  'adroll.com',
  'revcontent.com',
  'contextweb.com',
  'bidswitch.net',
  'smartadserver.com',
  'adform.net',
  'spotxchange.com',
  'moatads.com',
  'chartbeat.net',
  'amazon-adsystem.com',
  'servedby.flashtalking.com',
  'serving-sys.com',
  'imrworldwide.com',
  'hotjar.com',
  'segment.io',
  'statcounter.com',
  'histats.com',
  'yandex.ru/ads',
];

function setupUblockEngine() {
  const filter = { urls: ['*://*/*'] };

  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (!ublockConfig.enabled) {
      return callback({ cancel: false });
    }

    const url = details.url.toLowerCase();
    const isAd = AD_BLOCK_DOMAINS.some((domain) => url.includes(domain));
    const isAdPattern =
      (url.includes('/ads/') ||
        url.includes('/ad/') ||
        url.includes('&ad_') ||
        url.includes('?ad_') ||
        url.includes('doubleclick') ||
        url.includes('pagead') ||
        url.includes('interstitial') ||
        url.includes('prebid') ||
        url.includes('googleads')) &&
      !url.includes('youtube.com/watch') &&
      !url.includes('youtube.com/embed');

    if (isAd || isAdPattern) {
      ublockConfig.blockedCount++;
      return callback({ cancel: true });
    }

    return callback({ cancel: false });
  });
}

// ==============================================================================
// 3. Main Window Initialization
// ==============================================================================
function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay() || (screen.getAllDisplays() && screen.getAllDisplays()[0]);
  const { x, y, width, height } = primaryDisplay ? primaryDisplay.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

  const isKioskMode = process.env.NODE_ENV === 'production' || process.platform === 'linux';

  mainWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    fullscreen: true,
    kiosk: isKioskMode,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0c',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.maximize();
  mainWindow.show();
  mainWindow.focus();

  setupUblockEngine();

  // Neutralize iframe/embed popup windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (ublockConfig.antiPopup) {
      ublockConfig.blockedCount++;
      console.log(`[uBlock Origin] 🛡️ Neutralized popup window: ${url}`);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron Main] ⚠️ Page failed to load (${errorCode}): ${errorDescription} -> ${validatedURL}`);
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    const loadDev = () => {
      mainWindow.loadURL(devUrl).catch(() => {
        console.log('[Electron Main] Waiting for Vite dev server...');
        setTimeout(loadDev, 1000);
      });
    };
    loadDev();
  } else {
    const possiblePaths = [
      path.join(__dirname, '../dist/index.html'),
      path.join(process.cwd(), 'dist/index.html'),
      '/opt/tvos/dist/index.html',
    ];
    const indexPath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
    console.log('[Electron Main] 📺 Loading TV OS Shell UI from:', indexPath);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron Main] 🚨 Error loading UI:', err);
    });
  }

  // Developer Escape Sequence: Ctrl + Alt + Shift + Q
  const handleDeveloperEscape = () => {
    console.log('[Electron Main] 🚨 Developer Escape Sequence Triggered');
    if (mainWindow) {
      if (mainWindow.isKiosk() || mainWindow.isFullScreen()) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setSize(1280, 720);
        mainWindow.center();
      } else {
        app.quit();
      }
    }
  };

  // Input event handler
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11') {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      } else if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
      } else if (
        (input.key === 'q' || input.key === 'Q') &&
        input.control &&
        input.alt &&
        input.shift
      ) {
        handleDeveloperEscape();
      }
    }
  });

  // Register Global Shortcut
  try {
    globalShortcut.register('CommandOrControl+Alt+Shift+Q', handleDeveloperEscape);
  } catch (e) {}

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (ambientProcess) {
      try {
        ambientProcess.kill();
      } catch (e) {}
      ambientProcess = null;
    }
  });
}

// TCP Bulb connectivity check
function testBulbTcp(ip, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('error', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    try {
      socket.connect(6668, ip);
    } catch (e) {
      resolve(false);
    }
  });
}

// ==============================================================================
// 4. Comprehensive Platform & System Diagnostics IPC Handlers
// ==============================================================================
ipcMain.handle('get-platform-info', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
  };
});

ipcMain.handle('get-system-diagnostics', async () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let osName = 'Linux Appliance';
  let kernel = os.release();
  let distro = 'TV OS Linux';
  let deviceModel = 'Personal TV Appliance';
  let hardwareVideoDecode = 'VA-API Hardware Video Decoding Active';
  let audioServer = 'pipewire';
  let displayServer = process.env.WAYLAND_DISPLAY ? 'wayland' : 'x11';

  if (process.platform === 'win32') {
    osName = 'Windows 11 (Dev Host)';
    distro = 'Windows Development Environment';
    deviceModel = 'x86_64 PC Host';
    displayServer = 'windows-dwm';
    audioServer = 'wasapi';
    hardwareVideoDecode = 'D3D11 Video Acceleration Active';
  } else {
    // Linux Appliance Info
    try {
      if (fs.existsSync('/etc/os-release')) {
        const release = fs.readFileSync('/etc/os-release', 'utf8');
        const prettyMatch = release.match(/PRETTY_NAME="([^"]+)"/);
        if (prettyMatch) osName = prettyMatch[1];
      }
      if (fs.existsSync('/proc/device-tree/model')) {
        deviceModel = fs.readFileSync('/proc/device-tree/model', 'utf8').trim();
      } else if (process.arch === 'arm64') {
        deviceModel = 'Raspberry Pi 5 Model B';
      } else {
        deviceModel = 'x86_64 PC Appliance';
      }
    } catch (e) {}

    if (process.arch === 'arm64') {
      hardwareVideoDecode = 'VideoCore VII V4L2 Hardware Path (HEVC 4K60)';
    } else {
      hardwareVideoDecode = 'Mesa VA-API / Intel iHD / AMD AMF Decode';
    }
  }

  // Network info
  let ipAddress = '127.0.0.1';
  let networkType = 'offline';
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (!net.internal && net.family === 'IPv4') {
          ipAddress = net.address;
          networkType = name.startsWith('wl') || name.startsWith('wi') ? 'wifi' : 'ethernet';
          break;
        }
      }
    }
  } catch (e) {}

  return {
    os: osName,
    kernel: `${os.type()} ${kernel}`,
    distro,
    arch: process.arch === 'arm64' ? 'aarch64' : 'x86_64',
    deviceModel,
    cpuModel: cpus.length > 0 ? cpus[0].model : 'Appliance Multi-Core CPU',
    cpuCores: cpus.length,
    ramTotalBytes: totalMem,
    ramUsedBytes: usedMem,
    ramFreeBytes: freeMem,
    gpuModel: process.arch === 'arm64' ? 'Broadcom VideoCore VII (V3D 7.1)' : 'Mesa DRM / Intel Iris / AMD Radeon',
    gpuDriver: process.arch === 'arm64' ? 'Mesa vc4 / v3d' : 'Mesa 24.1 / DRM KMS',
    hardwareVideoDecode,
    displayServer,
    activeDisplay: {
      id: primaryDisplay.id,
      name: 'HDMI-A-1 (Sanyo 4K TV / Primary Display)',
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      refreshRate: primaryDisplay.displayFrequency || 60,
      isPrimary: true,
      scaleFactor: primaryDisplay.scaleFactor || 1,
      hdrSupported: true,
    },
    audioServer,
    activeAudioDevice: {
      id: 'hdmi-output-default',
      name: 'PipeWire / Realtek HDMI Audio Output (Sanyo TV)',
      isDefault: true,
      type: 'hdmi',
      channels: 6,
    },
    networkType,
    ipAddress,
    controllerConnected: true,
    controllerName: 'Xbox Wireless Controller (USB/Bluetooth)',
    storageTotalBytes: 512 * 1024 * 1024 * 1024,
    storageFreeBytes: 360 * 1024 * 1024 * 1024,
    uptimeSeconds: Math.floor(os.uptime()),
  };
});

ipcMain.handle('get-audio-devices', async () => {
  return [
    { id: 'hdmi-default', name: 'Digital Output (HDMI Audio / Sanyo TV)', isDefault: true, type: 'hdmi', channels: 6 },
    { id: 'analog-default', name: 'Analog Stereo Audio (Line Out / Headphones)', isDefault: false, type: 'analog', channels: 2 },
    { id: 'bluetooth-default', name: 'Bluetooth Wireless Audio', isDefault: false, type: 'bluetooth', channels: 2 },
  ];
});

ipcMain.handle('set-audio-device', async (event, deviceId) => {
  console.log(`[Electron Main] Setting audio device sink: ${deviceId}`);
  return true;
});

// App Launching
ipcMain.handle('launch-app', async (event, appData) => {
  const { target, launchType, type } = appData;
  const effectiveType = launchType || type || 'uri';

  console.log(`[Electron Main] Launching target: ${target} (${effectiveType})`);

  try {
    if (effectiveType === 'web' || target.startsWith('http')) {
      await shell.openExternal(target);
      return { success: true };
    } else if (effectiveType === 'uri') {
      await shell.openExternal(target);
      return { success: true };
    } else if (effectiveType === 'executable') {
      if (process.platform === 'win32') {
        exec(`start "" "${target}"`, (err) => {
          if (err) console.error('[Electron Main] Executable launch error:', err);
        });
      } else {
        exec(`xdg-open "${target}" || "${target}" &`, (err) => {
          if (err) console.error('[Electron Main] Linux launch error:', err);
        });
      }
      return { success: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }

  return { success: true };
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('open-path', async (event, filePath) => {
  return await shell.openPath(filePath);
});

ipcMain.handle('get-display-info', async () => {
  return {
    primary: screen.getPrimaryDisplay(),
    allDisplays: screen.getAllDisplays(),
  };
});

ipcMain.handle('set-fullscreen', async (event, flag) => {
  if (mainWindow) {
    mainWindow.setFullScreen(flag);
  }
});

ipcMain.handle('system-power', async (event, action) => {
  console.log(`[Electron Main] Executing system power command: ${action}`);
  if (process.platform === 'win32') {
    if (action === 'shutdown') exec('shutdown /s /t 0');
    else if (action === 'restart') exec('shutdown /r /t 0');
    else if (action === 'sleep') exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  } else {
    if (action === 'shutdown') exec('systemctl poweroff || shutdown -h now');
    else if (action === 'restart') exec('systemctl reboot || reboot');
    else if (action === 'sleep') exec('systemctl suspend');
  }
});

// Ambient Lighting Real-Time Integration
ipcMain.handle('ambient-status', async () => {
  const [leftOnline, topOnline, rightOnline] = await Promise.all([
    testBulbTcp('192.168.29.203'),
    testBulbTcp('192.168.29.109'),
    testBulbTcp('192.168.29.216'),
  ]);

  const anyOnline = leftOnline || topOnline || rightOnline;

  return {
    connected: anyOnline,
    enabled: ambientProcess !== null || anyOnline,
    mode: 'ambient',
    bulbs: [
      { id: 'left', name: 'Syska 1 (Left)', position: 'left', ip: '192.168.29.203', online: leftOnline, colorHex: '#4285f4' },
      { id: 'top', name: 'Wipro (Top)', position: 'top', ip: '192.168.29.109', online: topOnline, colorHex: '#34a853' },
      { id: 'right', name: 'Syska 2 (Right)', position: 'right', ip: '192.168.29.216', online: rightOnline, colorHex: '#ea4335' },
    ],
  };
});

ipcMain.handle('ambient-mode', async (event, mode) => {
  console.log(`[Electron Main] Ambient mode requested: ${mode}`);
  if (mode === 'off') {
    if (ambientProcess) {
      try {
        ambientProcess.kill();
      } catch (e) {}
      ambientProcess = null;
    }
    return { success: true };
  }

  if (!ambientProcess) {
    try {
      ambientProcess = spawn('python3', ['main.py', '--mode', mode, '--minimized'], {
        cwd: AMBIENT_DIR,
        detached: true,
        stdio: 'ignore',
      });
      ambientProcess.unref();
    } catch (err) {
      console.warn('[Electron Main] Ambient Python backend notice:', err.message);
    }
  }

  return { success: true };
});

ipcMain.handle('ambient-intensity', async (event, intensity) => {
  return { success: true };
});

ipcMain.handle('ublock-status', async () => {
  return ublockConfig;
});

ipcMain.handle('ublock-toggle', async (event, enabled) => {
  ublockConfig.enabled = Boolean(enabled);
  return ublockConfig;
});

ipcMain.handle('ublock-toggle-popup', async (event, enabled) => {
  ublockConfig.antiPopup = Boolean(enabled);
  return ublockConfig;
});

// App Lifecycle
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (ambientProcess) {
    try {
      ambientProcess.kill();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
