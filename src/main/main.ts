import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeTheme,
  Tray,
  clipboard,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
  shell
} from "electron";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import OCR from "rapidocrjson";
import { autoUpdater } from "electron-updater";

const execFileAsync = promisify(execFile);
const APP_NAME = "抓个屏";
const APP_PROTOCOL = "zhuageping";
const SETTINGS_SCHEMA_VERSION = 2;
const WINDOWS_STARTUP_VALUE_NAME = "Zhuageping";
const WINDOWS_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const packagedDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, APP_NAME) : path.join(os.homedir(), "AppData", "Roaming", APP_NAME);
const appRuntimeDir = app.isPackaged ? packagedDataDir : path.join(process.cwd(), ".runtime");
const appProfileDir = path.join(appRuntimeDir, "electron-profile");
const tempCaptureDir = path.join(appRuntimeDir, "temp-captures");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function overlayEditorHtmlPath() {
  const builtPath = path.join(__dirname, "overlay", "editor.html");
  if (fsSync.existsSync(builtPath)) {
    return builtPath;
  }
  return path.join(process.cwd(), "src", "main", "overlay", "editor.html");
}

function recorderHtmlPath() {
  const builtPath = path.join(__dirname, "overlay", "recorder.html");
  if (fsSync.existsSync(builtPath)) {
    return builtPath;
  }
  return path.join(process.cwd(), "src", "main", "overlay", "recorder.html");
}

function pinViewerHtmlPath() {
  const builtPath = path.join(__dirname, "pin", "pin.html");
  if (fsSync.existsSync(builtPath)) {
    return builtPath;
  }
  return path.join(process.cwd(), "src", "main", "pin", "pin.html");
}

function appIconPath() {
  const builtPath = path.join(__dirname, "assets", "app-logo.png");
  if (fsSync.existsSync(builtPath)) {
    return builtPath;
  }
  return path.join(process.cwd(), "src", "main", "assets", "app-logo.png");
}

function createAppIcon() {
  return nativeImage.createFromPath(appIconPath());
}

function registerProtocolHandler() {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [process.argv[1]]);
    return;
  }
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

app.setPath("userData", appProfileDir);
app.setName(APP_NAME);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-dir", path.join(appRuntimeDir, "chromium-cache"));
if (process.platform === "win32") {
  // WGC avoids recurring DXGI duplication stalls on some multi-GPU and multi-display systems.
  app.commandLine.appendSwitch("enable-features", "AllowWgcScreenCapturer");
}
try {
  os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL);
} catch (error) {
  if (!app.isPackaged) {
    console.warn("Unable to raise main process priority.", error);
  }
}

type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-bar";

type CaptureOptions = {
  location: string;
  project: string;
  note: string;
  watermarkEnabled: boolean;
  watermarkPosition: WatermarkPosition;
};

type OutputFormat = "png" | "jpg";
type AppLanguage = "zh-CN" | "en-US";
type AppTheme = "system" | "light" | "dark";
type RecordingQuality = "standard" | "high" | "compact";
type RecordingFormat = "mp4";

type AppSettings = CaptureOptions & {
  settingsSchemaVersion: number;
  launchAtStartup: boolean;
  runAsAdmin: boolean;
  autoBackup: boolean;
  keepResponsive: boolean;
  trayMenu: boolean;
  autoCopy: boolean;
  autoPinAfterCapture: boolean;
  outputFormat: OutputFormat;
  language: AppLanguage;
  theme: AppTheme;
  logLevel: "normal" | "verbose" | "silent";
  screenshotDir: string;
  shortcutCapture: string;
  shortcutCaptureCopy: string;
  shortcutArea: string;
  shortcutScrollCapture: string;
  shortcutRecord: string;
  shortcutPin: string;
  shortcutTogglePins: string;
  recordingFps: number;
  recordingFormat: RecordingFormat;
  recordingQuality: RecordingQuality;
  recordingMic: boolean;
  recordingCountdown: boolean;
  recordingShowCursor: boolean;
  recordingClickHighlight: boolean;
};

type ScreenshotRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  location: string;
  project: string;
  note: string;
  watermarkPosition: WatermarkPosition;
};

type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RecordingRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  durationMs: number;
  width: number;
  height: number;
  format: RecordingFormat;
};

type PrivacyRegion = CaptureRegion & {
  strength?: number;
};

type InlineCapturePayload = {
  region: CaptureRegion;
  annotationDataUrl: string;
  baseDataUrl?: string | null;
  ocrDataUrl?: string | null;
  privacyDataUrl?: string | null;
  mosaicRegions: PrivacyRegion[];
  blurRegions: PrivacyRegion[];
};

type InlineCaptureResult = {
  buffer: Buffer;
  action: "save" | "save-as" | "copy" | "pin";
  savePath?: string;
};

type RecordingPayload = {
  dataUrl?: string;
  dataBuffer?: ArrayBuffer | Uint8Array | Buffer;
  byteLength?: number;
  mimeType?: string;
  durationMs: number;
  width: number;
  height: number;
  cropX?: number;
  cropY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

type RecordingMode = "region" | "screen";

type NativeRecordingSelection = {
  display: DisplayLike;
  region: CaptureRegion;
  overlay: BrowserWindow;
};

type AppUpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "disabled";
  message: string;
  currentVersion: string;
  latestVersion?: string;
  percent?: number;
};

type OcrLine = {
  text: string;
  confidence: number;
  box?: [[number, number], [number, number], [number, number], [number, number]];
};

type OcrResult = {
  ok: boolean;
  text: string;
  lines: OcrLine[];
  elapsedMs: number;
  enginePath?: string;
  error?: string;
};

type RegionFrame = {
  buffer: Buffer;
  raw: Buffer;
  width: number;
  height: number;
  channels: number;
};

type DisplayLike = Pick<Electron.Display, "bounds" | "size" | "scaleFactor" | "id" | "label">;

function getCursorDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

type PinWindowState = {
  filePath: string;
  naturalWidth: number;
  naturalHeight: number;
  initialWidth: number;
  initialHeight: number;
  locked: boolean;
  clickThrough: boolean;
  toolbarInteractive: boolean;
  topLevel: "normal" | "floating" | "screen";
  opacity: number;
  dragStart?: {
    pointer: { x: number; y: number };
    bounds: Electron.Rectangle;
  };
};

const rootDir = app.isPackaged ? path.join(appRuntimeDir, "local") : path.resolve(app.getPath("userData"), "..", "jietu-shiyou-2026-local");
const dataDir = path.join(rootDir, "data");
const defaultScreenshotDir = path.join(rootDir, "screenshots");
const backupDir = path.join(rootDir, "backups");
const historyPath = path.join(dataDir, "history.json");
const recordingHistoryPath = path.join(dataDir, "recordings.json");
const settingsPath = path.join(dataDir, "settings.json");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pinWindows: BrowserWindow[] = [];
let pinWindowStates = new Map<number, PinWindowState>();
let pinsVisible = true;
let shortcutCaptureRunning = false;
let recordingRunning = false;
let activeRecordingOverlay: BrowserWindow | null = null;
let activeNativeRecorderProcess: ChildProcess | null = null;
let activeRecordingUsesNative = false;
let nativeRecordingSelectionCommitted = false;
let pendingNativeRecorderCommand: "stop" | "cancel" | null = null;
let hotkeyGuardProcess: ChildProcess | null = null;
let hotkeyGuardRestartTimer: NodeJS.Timeout | null = null;
let hotkeyGuardOutputBuffer = "";
let hotkeyGuardIntentionalStop = false;
let ocrWorker: OCR | null = null;
let ocrWorkerEnginePath = "";
let updaterReady = false;
let updateCheckInProgress = false;
let updateDownloaded = false;
let downloadedUpdateVersion = "";
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let appSettings: AppSettings = {
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  location: "上海市",
  project: "默认项目",
  note: "",
  watermarkEnabled: true,
  watermarkPosition: "bottom-right",
  launchAtStartup: false,
  runAsAdmin: false,
  autoBackup: true,
  keepResponsive: true,
  trayMenu: true,
  autoCopy: true,
  autoPinAfterCapture: false,
  outputFormat: "png",
  language: "zh-CN",
  theme: "system",
  logLevel: "normal",
  screenshotDir: defaultScreenshotDir,
  shortcutCapture: "F1",
  shortcutCaptureCopy: "Ctrl+F1",
  shortcutArea: "Shift+F1",
  shortcutScrollCapture: "Ctrl+Shift+F1",
  shortcutRecord: "F2",
  shortcutPin: "F3",
  shortcutTogglePins: "Shift+F3",
  recordingFps: 30,
  recordingFormat: "mp4",
  recordingQuality: "standard",
  recordingMic: false,
  recordingCountdown: true,
  recordingShowCursor: true,
  recordingClickHighlight: true
};

const mainMessages = {
  "zh-CN": {
    preferences: "首选项",
    protocolOpened: (protocol: string) => `已通过 ${protocol}:// 唤起`,
    tray: {
      regionCapture: "区域截图",
      regionCaptureCopy: "区域截图并自动复制",
      customCapture: "自定义截屏",
      scrollCapture: "滚动截图（长图）",
      recordRegion: "区域录屏",
      recordScreen: "当前屏幕录屏",
      stopRecording: "停止录屏",
      pinLatest: "贴最近截图",
      togglePins: "隐藏/显示所有贴图",
      switchPinGroup: "切换到另一贴图组",
      clearHistory: "清空截屏历史",
      preferences: "首选项...",
      theme: "主题",
      themeSystem: "跟随系统",
      themeLight: "浅色",
      themeDark: "深色",
      checkForUpdates: "检查更新...",
      help: "帮助",
      restart: "重新启动",
      quit: "退出"
    },
    status: {
      shortcutFailed: (accelerator: string) => `快捷键注册失败：${accelerator}`,
      hotkeyGuardReady: "快捷键增强已启用",
      hotkeyGuardUnavailable: "快捷键增强未启用，已使用系统全局热键兜底",
      hotkeyGuardStopped: "快捷键增强已停止，正在尝试恢复",
      scrollSelect: "拖动选择要滚动截取的区域",
      scrollHint: "拖动选择长截图区域，单击可选中窗口",
      scrollPreparing: "正在准备滚动截图...",
      scrollMerged: (frames: number) => `长截图合成完成：${frames} 帧`,
      scrollMergedEditable: (frames: number) => `长截图已合成：${frames} 帧，可继续编辑`,
      recordingSelect: "拖动选择录屏区域",
      recordingPreparing: "正在准备录屏...",
      recordingCanceled: "录屏已取消",
      recordingSaved: (filePath: string) => `录屏已保存：${filePath}`,
      recordingFailed: "录屏失败，请重试",
      ocrDone: "OCR 识别完成，文字已复制",
      ocrFailed: "OCR 识别失败",
      noPinSource: "暂无可贴图的截图",
      pinMissing: "贴图文件不存在",
      pinned: "截图已贴到桌面",
      pinsShown: "已显示所有贴图",
      pinsHidden: "已隐藏所有贴图",
      pinLockedResize: "贴图已锁定，无法缩放",
      pinLockedReset: "贴图已锁定，无法重置大小",
      pinSaved: "贴图已保存",
      pinCopied: "贴图已复制",
      themeUpdated: "主题已更新",
      checkingUpdate: "正在检查更新...",
      updateAvailable: (version: string) => `发现新版本：${version}，正在下载`,
      updateNotAvailable: "当前已是最新版本",
      updateDownloading: (percent: number) => `正在下载更新：${percent}%`,
      updateDownloaded: (version: string) => `新版 ${version} 已下载，重启后安装`,
      updateDisabled: "开发环境不检查更新，请在安装版中测试",
      updateError: (message: string) => `检查更新失败：${message}`
    },
    dialog: {
      scrollSelectionTitle: "滚动截图选区",
      recordingTitle: "录屏",
      captureTitle: "截图",
      pinTitle: "贴图",
      savePin: "保存贴图",
      saveScreenshot: "保存截图",
      imageFilter: "图片",
      chooseScreenshotDir: "选择截图保存目录",
      updateReadyTitle: "更新已准备好",
      updateReadyMessage: (version: string) => `抓个屏 ${version} 已下载完成。现在重启并安装吗？`,
      restartNow: "立即重启",
      later: "稍后"
    },
    pinMenu: {
      unlock: "解除锁定",
      lock: "锁定贴图",
      topLevel: "置顶级别",
      normal: "普通窗口",
      floating: "浮层置顶",
      screen: "最高置顶",
      opacity: "透明度",
      disableClickThrough: "关闭鼠标穿透",
      enableClickThrough: "开启鼠标穿透",
      saveImage: "保存图片...",
      copyImage: "复制图片",
      openFolder: "打开所在文件夹",
      destroy: "销毁贴图"
    }
  },
  "en-US": {
    preferences: "Preferences",
    protocolOpened: (protocol: string) => `Opened via ${protocol}://`,
    tray: {
      regionCapture: "Region Capture",
      regionCaptureCopy: "Capture and Auto Copy",
      customCapture: "Custom Capture",
      scrollCapture: "Scrolling Capture",
      recordRegion: "Region Recording",
      recordScreen: "Current Screen Recording",
      stopRecording: "Stop Recording",
      pinLatest: "Pin Latest Screenshot",
      togglePins: "Show/Hide All Pins",
      switchPinGroup: "Switch Pin Group",
      clearHistory: "Clear Screenshot History",
      preferences: "Preferences...",
      theme: "Theme",
      themeSystem: "Follow System",
      themeLight: "Light",
      themeDark: "Dark",
      checkForUpdates: "Check for Updates...",
      help: "Help",
      restart: "Restart",
      quit: "Quit"
    },
    status: {
      shortcutFailed: (accelerator: string) => `Shortcut registration failed: ${accelerator}`,
      hotkeyGuardReady: "Shortcut guard enabled",
      hotkeyGuardUnavailable: "Shortcut guard unavailable; using system global shortcuts as fallback",
      hotkeyGuardStopped: "Shortcut guard stopped, trying to recover",
      scrollSelect: "Drag to select the scrolling capture region",
      scrollHint: "Drag to select a scrolling capture region, or click to select a window",
      scrollPreparing: "Preparing scrolling capture...",
      scrollMerged: (frames: number) => `Scrolling capture merged: ${frames} frames`,
      scrollMergedEditable: (frames: number) => `Long screenshot merged: ${frames} frames, ready to edit`,
      recordingSelect: "Drag to select a recording region",
      recordingPreparing: "Preparing recording...",
      recordingCanceled: "Recording canceled",
      recordingSaved: (filePath: string) => `Recording saved: ${filePath}`,
      recordingFailed: "Recording failed. Please try again.",
      ocrDone: "OCR completed, text copied",
      ocrFailed: "OCR failed",
      noPinSource: "No screenshot available to pin",
      pinMissing: "Pinned image file does not exist",
      pinned: "Screenshot pinned to desktop",
      pinsShown: "All pins shown",
      pinsHidden: "All pins hidden",
      pinLockedResize: "Pin is locked and cannot be resized",
      pinLockedReset: "Pin is locked and cannot reset size",
      pinSaved: "Pin saved",
      pinCopied: "Pin copied",
      themeUpdated: "Theme updated",
      checkingUpdate: "Checking for updates...",
      updateAvailable: (version: string) => `New version found: ${version}. Downloading...`,
      updateNotAvailable: "You are on the latest version",
      updateDownloading: (percent: number) => `Downloading update: ${percent}%`,
      updateDownloaded: (version: string) => `Version ${version} downloaded. Restart to install`,
      updateDisabled: "Update checks run in packaged builds only",
      updateError: (message: string) => `Update check failed: ${message}`
    },
    dialog: {
      scrollSelectionTitle: "Scrolling Capture Region",
      recordingTitle: "Recording",
      captureTitle: "Capture",
      pinTitle: "Pin",
      savePin: "Save Pin",
      saveScreenshot: "Save Screenshot",
      imageFilter: "Images",
      chooseScreenshotDir: "Choose Screenshot Folder",
      updateReadyTitle: "Update Ready",
      updateReadyMessage: (version: string) => `Zhuageping ${version} has been downloaded. Restart and install now?`,
      restartNow: "Restart Now",
      later: "Later"
    },
    pinMenu: {
      unlock: "Unlock Pin",
      lock: "Lock Pin",
      topLevel: "Always-on-top Level",
      normal: "Normal Window",
      floating: "Floating Top",
      screen: "Highest Top",
      opacity: "Opacity",
      disableClickThrough: "Disable Mouse Pass-through",
      enableClickThrough: "Enable Mouse Pass-through",
      saveImage: "Save Image...",
      copyImage: "Copy Image",
      openFolder: "Open Folder",
      destroy: "Destroy Pin"
    }
  }
} as const;

function mt() {
  return mainMessages[appSettings.language] ?? mainMessages["zh-CN"];
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 680,
    height: 500,
    minWidth: 600,
    minHeight: 476,
    maxWidth: 760,
    maxHeight: 640,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    title: `${APP_NAME} ${mt().preferences}`,
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setBackgroundColor("#00000000");
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Preferences window failed to load: ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Preferences renderer crashed: ${details.reason}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) {
      console.error(`Renderer console: ${message}`);
    }
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.alt) {
      return;
    }
    if (input.key === "F1" && input.control && input.shift) {
      event.preventDefault();
      runShortcutScrollCapture(appSettings.autoCopy);
      return;
    }
    if (input.key === "F1") {
      event.preventDefault();
      runShortcutCapture(Boolean(input.control || input.meta) || appSettings.autoCopy);
    }
    if (input.key === "F2" && !input.control && !input.meta && !input.shift) {
      event.preventDefault();
      void runShortcutRecording();
    }
    if (input.key === "F3" && !input.control && !input.meta) {
      event.preventDefault();
      if (input.shift) {
        togglePinWindows();
      } else {
        void pinLatestScreenshot();
      }
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function showPreferencesWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send("app:open-preferences");
}

function handleProtocolUrl(protocolUrl?: string) {
  if (!protocolUrl || !protocolUrl.toLowerCase().startsWith(`${APP_PROTOCOL}://`)) {
    showPreferencesWindow();
    return;
  }

  let command = "";
  try {
    const parsedUrl = new URL(protocolUrl);
    command = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, "");
  } catch {
    command = "";
  }

  if (command === "capture") {
    runShortcutCapture(appSettings.autoCopy);
    return;
  }

  if (command === "scroll") {
    runShortcutScrollCapture(appSettings.autoCopy);
    return;
  }

  if (command === "pin") {
    void pinLatestScreenshot();
    return;
  }

  showPreferencesWindow();
  mainWindow?.webContents.send("app:status", mt().protocolOpened(APP_PROTOCOL));
}

async function createTray() {
  let trayIcon = createAppIcon();
  if (trayIcon.isEmpty()) {
    const iconSvg = `
    <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#1c6758"/>
      <path d="M9 10h14v12H9z" fill="#fff" opacity=".95"/>
      <path d="M12 13h8v6h-8z" fill="#1c6758"/>
      <circle cx="22" cy="10" r="4" fill="#e4f06a"/>
    </svg>
  `;
    const iconBuffer = await sharp(Buffer.from(iconSvg)).png().toBuffer();
    trayIcon = nativeImage.createFromBuffer(iconBuffer);
  }
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const baseItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: mt().tray.regionCapture,
      accelerator: appSettings.shortcutCapture,
      click: () => {
        void capturePrimaryScreen(appSettings, appSettings.autoCopy);
      }
    },
    {
      label: mt().tray.regionCaptureCopy,
      accelerator: appSettings.shortcutCaptureCopy,
      click: async () => {
        await capturePrimaryScreen(appSettings, true);
      }
    }
  ];

  const extendedItems: Electron.MenuItemConstructorOptions[] = appSettings.trayMenu
    ? [
        {
          label: mt().tray.customCapture,
          accelerator: appSettings.shortcutArea,
          click: () => {
            void captureSelectedRegion(appSettings, appSettings.autoCopy);
          }
        },
        {
          label: mt().tray.scrollCapture,
          accelerator: appSettings.shortcutScrollCapture,
          click: () => {
            void captureScrollingRegion(appSettings, appSettings.autoCopy);
          }
        },
        {
          label: recordingRunning ? mt().tray.stopRecording : mt().tray.recordRegion,
          accelerator: appSettings.shortcutRecord,
          click: () => {
            void runShortcutRecording();
          }
        },
        {
          label: mt().tray.recordScreen,
          enabled: !recordingRunning,
          click: () => {
            void startRegionRecording(appSettings, "screen");
          }
        },
        { type: "separator" },
        {
          label: mt().tray.pinLatest,
          accelerator: appSettings.shortcutPin,
          click: () => {
            void pinLatestScreenshot();
          }
        },
        {
          label: mt().tray.togglePins,
          accelerator: appSettings.shortcutTogglePins,
          click: () => togglePinWindows()
        },
        { label: mt().tray.switchPinGroup, accelerator: "Ctrl+F3", enabled: false },
        { type: "separator" },
        {
          label: mt().tray.clearHistory,
          click: async () => {
            await writeHistory([]);
            mainWindow?.webContents.send("app:history-cleared");
          }
        }
      ]
    : [];

  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...baseItems,
      ...extendedItems,
      { type: "separator" },
      {
        label: mt().tray.preferences,
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send("app:open-preferences");
        }
      },
      {
        label: mt().tray.theme,
        submenu: [
          {
            label: mt().tray.themeSystem,
            type: "radio",
            checked: appSettings.theme === "system",
            click: () => {
              void updateAppTheme("system");
            }
          },
          {
            label: mt().tray.themeLight,
            type: "radio",
            checked: appSettings.theme === "light",
            click: () => {
              void updateAppTheme("light");
            }
          },
          {
            label: mt().tray.themeDark,
            type: "radio",
            checked: appSettings.theme === "dark",
            click: () => {
              void updateAppTheme("dark");
            }
          }
        ]
      },
      {
        label: mt().tray.checkForUpdates,
        click: () => {
          void checkForAppUpdates(true);
        }
      },
      { label: mt().tray.help, enabled: false },
      { type: "separator" },
      {
        label: mt().tray.restart,
        click: () => {
          isQuitting = true;
          app.relaunch();
          app.exit(0);
        }
      },
      {
        label: mt().tray.quit,
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function recordingDir() {
  return path.join(appSettings.screenshotDir || defaultScreenshotDir, "recordings");
}

async function ensureStorage() {
  await fs.mkdir(appRuntimeDir, { recursive: true });
  await fs.mkdir(appProfileDir, { recursive: true });
  await fs.mkdir(tempCaptureDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  await fs.mkdir(recordingDir(), { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });

  try {
    await fs.access(historyPath);
  } catch {
    await fs.writeFile(historyPath, "[]", "utf8");
  }

  try {
    await fs.access(recordingHistoryPath);
  } catch {
    await fs.writeFile(recordingHistoryPath, "[]", "utf8");
  }

  try {
    await fs.access(settingsPath);
  } catch {
    await writeSettings(appSettings);
  }
}

async function readSettings(): Promise<AppSettings> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    const storedSchemaVersion = Number(stored.settingsSchemaVersion || 0);
    appSettings = {
      ...appSettings,
      ...stored,
      screenshotDir: stored.screenshotDir || defaultScreenshotDir
    };
    if (storedSchemaVersion < SETTINGS_SCHEMA_VERSION) {
      appSettings.recordingFormat = "mp4";
    }
    normalizeSettings(appSettings);
    nativeTheme.themeSource = appSettings.theme;
    await fs.writeFile(settingsPath, JSON.stringify(appSettings, null, 2), "utf8");
  } catch {
    await writeSettings(appSettings);
  }
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  await fs.mkdir(recordingDir(), { recursive: true });
  return appSettings;
}

async function writeSettings(settings: AppSettings) {
  appSettings = settings;
  normalizeSettings(appSettings);
  nativeTheme.themeSource = appSettings.theme;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  await fs.mkdir(recordingDir(), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(appSettings, null, 2), "utf8");
  mainWindow?.setTitle(`${APP_NAME} ${mt().preferences}`);
  syncLoginItemSettings();
  registerGlobalShortcuts();
  startHotkeyGuard();
  updateTrayMenu();
}

function sendUpdateStatus(status: AppUpdateStatus) {
  mainWindow?.webContents.send("app:update-status", status);
  mainWindow?.webContents.send("app:status", status.message);
}

function buildUpdateStatus(
  state: AppUpdateStatus["state"],
  message: string,
  details: Omit<AppUpdateStatus, "state" | "message" | "currentVersion"> = {}
): AppUpdateStatus {
  return {
    state,
    message,
    currentVersion: app.getVersion(),
    ...details
  };
}

function showDownloadedUpdateDialog(version: string) {
  const options: Electron.MessageBoxOptions = {
    type: "info",
    buttons: [mt().dialog.restartNow, mt().dialog.later],
    defaultId: 0,
    cancelId: 1,
    title: mt().dialog.updateReadyTitle,
    message: mt().dialog.updateReadyMessage(version)
  };
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const prompt = owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options);
  void prompt.then(({ response }) => {
    if (response === 0) {
      installDownloadedUpdate();
    }
  });
}

function setupAutoUpdater() {
  if (updaterReady) {
    return;
  }
  updaterReady = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => {
    updateCheckInProgress = true;
    sendUpdateStatus(buildUpdateStatus("checking", mt().status.checkingUpdate));
  });
  autoUpdater.on("update-available", (info) => {
    updateDownloaded = false;
    downloadedUpdateVersion = "";
    sendUpdateStatus(buildUpdateStatus("available", mt().status.updateAvailable(info.version), { latestVersion: info.version }));
  });
  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
    sendUpdateStatus(buildUpdateStatus("downloading", mt().status.updateDownloading(percent), { percent }));
  });
  autoUpdater.on("update-not-available", (info) => {
    updateCheckInProgress = false;
    sendUpdateStatus(buildUpdateStatus("not-available", mt().status.updateNotAvailable, { latestVersion: info.version }));
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateCheckInProgress = false;
    updateDownloaded = true;
    downloadedUpdateVersion = info.version;
    sendUpdateStatus(buildUpdateStatus("downloaded", mt().status.updateDownloaded(info.version), { latestVersion: info.version }));
    showDownloadedUpdateDialog(info.version);
  });
  autoUpdater.on("error", (error) => {
    updateCheckInProgress = false;
    const message = error instanceof Error ? error.message : String(error);
    sendUpdateStatus(buildUpdateStatus("error", mt().status.updateError(message)));
  });
}

async function checkForAppUpdates(manual = false): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    const status = buildUpdateStatus("disabled", mt().status.updateDisabled);
    if (manual) {
      sendUpdateStatus(status);
    }
    return status;
  }
  setupAutoUpdater();
  if (updateDownloaded) {
    const version = downloadedUpdateVersion || app.getVersion();
    const status = buildUpdateStatus("downloaded", mt().status.updateDownloaded(version), { latestVersion: version });
    sendUpdateStatus(status);
    return status;
  }
  if (updateCheckInProgress) {
    const status = buildUpdateStatus("checking", mt().status.checkingUpdate);
    sendUpdateStatus(status);
    return status;
  }
  try {
    updateCheckInProgress = true;
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo.version;
    return buildUpdateStatus("checking", mt().status.checkingUpdate, latestVersion ? { latestVersion } : {});
  } catch (error) {
    updateCheckInProgress = false;
    const message = error instanceof Error ? error.message : String(error);
    const status = buildUpdateStatus("error", mt().status.updateError(message));
    sendUpdateStatus(status);
    return status;
  }
}

function installDownloadedUpdate() {
  if (!updateDownloaded) {
    sendUpdateStatus(buildUpdateStatus("idle", mt().status.updateNotAvailable));
    return;
  }
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
}

function normalizeWindowsShortcut(accelerator: string) {
  return accelerator
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/CmdOrCtrl/gi, "Ctrl")
    .replace(/Control/gi, "Ctrl")
    .replace(/Command/gi, "Ctrl")
    .replace(/\s*\+\s*/g, "+")
    .trim();
}

function normalizeShortcutSettings(settings: AppSettings) {
  settings.shortcutCapture = normalizeWindowsShortcut(settings.shortcutCapture);
  settings.shortcutCaptureCopy = normalizeWindowsShortcut(settings.shortcutCaptureCopy);
  settings.shortcutArea = normalizeWindowsShortcut(settings.shortcutArea);
  settings.shortcutScrollCapture = normalizeWindowsShortcut(settings.shortcutScrollCapture);
  settings.shortcutRecord = normalizeWindowsShortcut(settings.shortcutRecord || "F2");
  settings.shortcutPin = normalizeWindowsShortcut(settings.shortcutPin);
  settings.shortcutTogglePins = normalizeWindowsShortcut(settings.shortcutTogglePins);
}

function normalizeLanguageSetting(settings: AppSettings) {
  settings.language = settings.language === "en-US" ? "en-US" : "zh-CN";
}

function normalizeThemeSetting(settings: AppSettings) {
  settings.theme = settings.theme === "dark" || settings.theme === "light" ? settings.theme : "system";
}

function normalizeSettings(settings: AppSettings) {
  settings.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
  normalizeLanguageSetting(settings);
  normalizeThemeSetting(settings);
  normalizeShortcutSettings(settings);
  settings.recordingFps = [15, 30, 60].includes(Number(settings.recordingFps)) ? Number(settings.recordingFps) : 30;
  settings.recordingFormat = "mp4";
  settings.recordingQuality = ["standard", "high", "compact"].includes(settings.recordingQuality) ? settings.recordingQuality : "standard";
  settings.recordingMic = Boolean(settings.recordingMic);
  settings.recordingCountdown = settings.recordingCountdown !== false;
  settings.recordingShowCursor = settings.recordingShowCursor !== false;
  settings.recordingClickHighlight = settings.recordingClickHighlight !== false;
}

async function updateAppTheme(theme: AppTheme) {
  await writeSettings({ ...appSettings, theme });
  mainWindow?.webContents.send("app:settings-updated", appSettings);
  mainWindow?.webContents.send("app:status", mt().status.themeUpdated);
}

function syncLoginItemSettings() {
  if (process.platform !== "win32") {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: appSettings.launchAtStartup,
    path: process.execPath,
    args: app.isPackaged ? [] : [process.cwd()]
  });

  void syncWindowsRunStartup();
}

function startupCommandLine() {
  const quotedExe = `"${process.execPath.replace(/"/g, "")}"`;
  if (app.isPackaged) {
    return quotedExe;
  }
  return `${quotedExe} "${process.cwd().replace(/"/g, "")}"`;
}

async function syncWindowsRunStartup() {
  if (process.platform !== "win32") {
    return;
  }

  try {
    if (appSettings.launchAtStartup) {
      await execFileAsync("reg.exe", [
        "add",
        WINDOWS_RUN_KEY,
        "/v",
        WINDOWS_STARTUP_VALUE_NAME,
        "/t",
        "REG_SZ",
        "/d",
        startupCommandLine(),
        "/f"
      ]);
    } else {
      await execFileAsync("reg.exe", ["delete", WINDOWS_RUN_KEY, "/v", WINDOWS_STARTUP_VALUE_NAME, "/f"]).catch(() => undefined);
    }
  } catch (error) {
    console.warn(`Failed to sync Windows startup registry: ${(error as Error).message}`);
  }
}

async function restartAsAdmin() {
  if (process.platform !== "win32") {
    return;
  }

  const args = app.isPackaged ? "" : `"${process.cwd()}"`;
  isQuitting = true;
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -ArgumentList '${args.replace(/'/g, "''")}' -Verb RunAs`
    ],
    { windowsHide: true }
  );
  app.quit();
}

function runShortcutCapture(copyAfterCapture = appSettings.autoCopy) {
  if (shortcutCaptureRunning) {
    return;
  }
  shortcutCaptureRunning = true;
  void capturePrimaryScreen(appSettings, copyAfterCapture).finally(() => {
    shortcutCaptureRunning = false;
  });
}

function runShortcutScrollCapture(copyAfterCapture = appSettings.autoCopy) {
  if (shortcutCaptureRunning) {
    return;
  }
  shortcutCaptureRunning = true;
  void captureScrollingRegion(appSettings, copyAfterCapture).finally(() => {
    shortcutCaptureRunning = false;
  });
}

function runShortcutRecording() {
  if (recordingRunning && activeNativeRecorderProcess?.stdin?.writable) {
    activeNativeRecorderProcess.stdin.write("stop\n");
    return;
  }
  if (recordingRunning && activeRecordingOverlay && !activeRecordingOverlay.isDestroyed()) {
    const command = activeRecordingUsesNative && !nativeRecordingSelectionCommitted ? "cancel" : "stop";
    if (activeRecordingUsesNative && nativeRecordingSelectionCommitted) pendingNativeRecorderCommand = "stop";
    activeRecordingOverlay.webContents.send("recording-command", command);
    return;
  }
  void startRegionRecording(appSettings).catch((error) => {
    console.error("Recording shortcut failed.", error);
  });
}

function startRegionRecording(settings: AppSettings, mode: RecordingMode = "region"): Promise<RecordingRecord | null> {
  if (shortcutCaptureRunning || recordingRunning) {
    return Promise.resolve(null);
  }
  recordingRunning = true;
  pendingNativeRecorderCommand = null;
  updateTrayMenu();
  globalShortcut.register("Escape", () => runShortcutRecording());
  return recordSelectedRegion(settings, mode).finally(() => {
    recordingRunning = false;
    pendingNativeRecorderCommand = null;
    globalShortcut.unregister("Escape");
    updateTrayMenu();
  });
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const registrations: Array<[string, () => void]> = [
    [appSettings.shortcutCapture, () => runShortcutCapture(appSettings.autoCopy)],
    [appSettings.shortcutCaptureCopy, () => runShortcutCapture(true)],
    [appSettings.shortcutArea, () => runShortcutCapture(appSettings.autoCopy)],
    [appSettings.shortcutScrollCapture, () => runShortcutScrollCapture(appSettings.autoCopy)],
    [appSettings.shortcutRecord, () => runShortcutRecording()],
    [appSettings.shortcutPin, () => void pinLatestScreenshot()],
    [appSettings.shortcutTogglePins, () => togglePinWindows()]
  ];

  for (const [accelerator, handler] of registrations) {
    if (accelerator.trim()) {
      const registered = globalShortcut.register(accelerator, handler);
      if (!registered) {
        console.warn(`Global shortcut registration failed: ${accelerator}`);
        mainWindow?.webContents.send("app:status", mt().status.shortcutFailed(accelerator));
      } else if (!app.isPackaged) {
        console.info(`Global shortcut registered: ${accelerator}`);
      }
    }
  }
}

function hotkeyGuardPath() {
  const fileName = "ZhuagepingHotkeyGuard.exe";
  const packagedPath = path.join(process.resourcesPath, "hotkey", fileName);
  if (app.isPackaged) {
    return packagedPath;
  }

  const builtPath = path.join(process.cwd(), "build", "hotkey", fileName);
  if (fsSync.existsSync(builtPath)) {
    return builtPath;
  }

  return packagedPath;
}

function hotkeyGuardConfigArg() {
  const payload = {
    shortcutCapture: appSettings.shortcutCapture,
    shortcutCaptureCopy: appSettings.shortcutCaptureCopy,
    shortcutArea: appSettings.shortcutArea,
    shortcutScrollCapture: appSettings.shortcutScrollCapture,
    shortcutRecord: appSettings.shortcutRecord,
    shortcutPin: appSettings.shortcutPin,
    shortcutTogglePins: appSettings.shortcutTogglePins
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function handleHotkeyGuardAction(action: string) {
  switch (action) {
    case "capture":
    case "area":
      runShortcutCapture(appSettings.autoCopy);
      break;
    case "capture-copy":
      runShortcutCapture(true);
      break;
    case "scroll":
      runShortcutScrollCapture(appSettings.autoCopy);
      break;
    case "record":
      runShortcutRecording();
      break;
    case "pin":
      void pinLatestScreenshot();
      break;
    case "toggle-pins":
      togglePinWindows();
      break;
    case "ready":
      if (!app.isPackaged) {
        console.info("Hotkey guard ready");
      }
      mainWindow?.webContents.send("app:status", mt().status.hotkeyGuardReady);
      break;
    default:
      if (action.startsWith("error:")) {
        console.warn(`Hotkey guard ${action}`);
        mainWindow?.webContents.send("app:status", mt().status.hotkeyGuardUnavailable);
      }
      break;
  }
}

function stopHotkeyGuard() {
  hotkeyGuardIntentionalStop = true;
  if (hotkeyGuardRestartTimer) {
    clearTimeout(hotkeyGuardRestartTimer);
    hotkeyGuardRestartTimer = null;
  }

  const child = hotkeyGuardProcess;
  hotkeyGuardProcess = null;
  if (child && !child.killed) {
    child.kill();
  }
}

function startHotkeyGuard() {
  if (process.platform !== "win32") {
    return;
  }

  stopHotkeyGuard();
  hotkeyGuardIntentionalStop = false;
  hotkeyGuardOutputBuffer = "";

  const guardPath = hotkeyGuardPath();
  if (!fsSync.existsSync(guardPath)) {
    if (!app.isPackaged) {
      console.warn(`Hotkey guard not found: ${guardPath}`);
    }
    mainWindow?.webContents.send("app:status", mt().status.hotkeyGuardUnavailable);
    return;
  }

  const child = spawn(guardPath, [hotkeyGuardConfigArg()], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  hotkeyGuardProcess = child;

  child.stdout.on("data", (chunk: Buffer) => {
    hotkeyGuardOutputBuffer += chunk.toString("utf8");
    const lines = hotkeyGuardOutputBuffer.split(/\r?\n/);
    hotkeyGuardOutputBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const action = line.trim();
      if (action) {
        handleHotkeyGuardAction(action);
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const message = chunk.toString("utf8").trim();
    if (message) {
      console.warn(`Hotkey guard stderr: ${message}`);
    }
  });

  child.on("error", (error) => {
    console.warn(`Hotkey guard failed to start: ${error.message}`);
    mainWindow?.webContents.send("app:status", mt().status.hotkeyGuardUnavailable);
  });

  child.on("exit", (code, signal) => {
    if (hotkeyGuardProcess !== child) return;
    hotkeyGuardProcess = null;
    if (hotkeyGuardIntentionalStop || isQuitting) {
      return;
    }
    console.warn(`Hotkey guard exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
    mainWindow?.webContents.send("app:status", mt().status.hotkeyGuardStopped);
    hotkeyGuardRestartTimer = setTimeout(() => {
      hotkeyGuardRestartTimer = null;
      startHotkeyGuard();
    }, 1200);
  });
}

async function backupLocalData() {
  if (!appSettings.autoBackup) {
    return;
  }

  await fs.mkdir(backupDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  await fs.copyFile(historyPath, path.join(backupDir, `history-${today}.json`));
  await fs.copyFile(recordingHistoryPath, path.join(backupDir, `recordings-${today}.json`)).catch(() => undefined);
  await fs.copyFile(settingsPath, path.join(backupDir, `settings-${today}.json`));
}

async function readHistory(): Promise<ScreenshotRecord[]> {
  await ensureStorage();
  const raw = await fs.readFile(historyPath, "utf8");
  return JSON.parse(raw) as ScreenshotRecord[];
}

async function writeHistory(records: ScreenshotRecord[]) {
  await fs.writeFile(historyPath, JSON.stringify(records, null, 2), "utf8");
  await backupLocalData();
}

async function readRecordingHistory(): Promise<RecordingRecord[]> {
  await ensureStorage();
  const raw = await fs.readFile(recordingHistoryPath, "utf8");
  return JSON.parse(raw) as RecordingRecord[];
}

async function writeRecordingHistory(records: RecordingRecord[]) {
  await fs.writeFile(recordingHistoryPath, JSON.stringify(records, null, 2), "utf8");
  await backupLocalData();
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds())
  ].join("");
}

function formatScreenshotDateParts(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    datePart: [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(""),
    timePart: [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("")
  };
}

async function nextScreenshotSequence(datePart: string, extension: string) {
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  const files = await fs.readdir(appSettings.screenshotDir).catch(() => []);
  const pattern = new RegExp(`^Zhuageping-${datePart}-\\d{6}-(\\d{3})\\.${extension}$`, "i");
  const maxSequence = files.reduce((max, fileName) => {
    const match = fileName.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return String(maxSequence + 1).padStart(3, "0");
}

async function nextRecordingSequence(datePart: string) {
  const dir = recordingDir();
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir).catch(() => []);
  const pattern = new RegExp(`^Zhuageping-${datePart}-\\d{6}-(\\d{3})\\.mp4$`, "i");
  const maxSequence = files.reduce((max, fileName) => {
    const match = fileName.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return String(maxSequence + 1).padStart(3, "0");
}

async function buildScreenshotFilePath(date: Date, extension: string) {
  const { datePart, timePart } = formatScreenshotDateParts(date);
  let sequence = await nextScreenshotSequence(datePart, extension);
  let filePath = path.join(appSettings.screenshotDir, `Zhuageping-${datePart}-${timePart}-${sequence}.${extension}`);

  while (fsSync.existsSync(filePath)) {
    sequence = String(Number(sequence) + 1).padStart(3, "0");
    filePath = path.join(appSettings.screenshotDir, `Zhuageping-${datePart}-${timePart}-${sequence}.${extension}`);
  }

  return filePath;
}

async function buildRecordingFilePath(date: Date, format: RecordingFormat) {
  const dir = recordingDir();
  const { datePart, timePart } = formatScreenshotDateParts(date);
  let sequence = await nextRecordingSequence(datePart);
  let filePath = path.join(dir, `Zhuageping-${datePart}-${timePart}-${sequence}.${format}`);

  while (fsSync.existsSync(filePath)) {
    sequence = String(Number(sequence) + 1).padStart(3, "0");
    filePath = path.join(dir, `Zhuageping-${datePart}-${timePart}-${sequence}.${format}`);
  }

  return filePath;
}

function outputExtensionFromPath(filePath: string, fallback: OutputFormat) {
  const extension = path.extname(filePath).replace(".", "").toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "png") return "png";
  return fallback;
}

function ensureImageFileExtension(filePath: string, extension: OutputFormat) {
  const currentExtension = path.extname(filePath).toLowerCase();
  if (currentExtension === ".png" || currentExtension === ".jpg" || currentExtension === ".jpeg") {
    return filePath;
  }
  return `${filePath}.${extension}`;
}

async function showScreenshotSaveDialog() {
  const extension = appSettings.outputFormat === "jpg" ? "jpg" : "png";
  const defaultPath = await buildScreenshotFilePath(new Date(), extension);
  const result = await dialog.showSaveDialog({
    title: mt().dialog.saveScreenshot,
    defaultPath,
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPG", extensions: ["jpg", "jpeg"] },
      { name: mt().dialog.imageFilter, extensions: ["png", "jpg", "jpeg"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return ensureImageFileExtension(result.filePath, extension);
}

async function desktopSourceIdForDisplay(display: DisplayLike) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 }
  });
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
  if (!source) {
    throw new Error("无法获取屏幕录制源。");
  }
  return source.id;
}

function recordingVideoBitsPerSecond(settings: AppSettings) {
  if (settings.recordingQuality === "high") return 35_000_000;
  if (settings.recordingQuality === "compact") return 8_000_000;
  return 18_000_000;
}

function recordingMp4Crf(settings: AppSettings) {
  if (settings.recordingQuality === "high") return "16";
  if (settings.recordingQuality === "compact") return "26";
  return "20";
}

function ffmpegExecutablePath() {
  const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", executableName),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", executableName)
  ];
  return candidates.find((candidate) => fsSync.existsSync(candidate)) ?? null;
}

function runFfmpeg(args: string[]) {
  const executablePath = ffmpegExecutablePath();
  if (!executablePath) {
    return Promise.reject(new Error("ffmpeg executable was not found."));
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(executablePath, args, { windowsHide: true });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `ffmpeg exited with code ${code}`));
    });
  });
}

async function transcodeRecordingToMp4(
  inputPath: string,
  outputPath: string,
  settings: AppSettings,
  payload: RecordingPayload
) {
  const sourceWidth = Math.max(2, Math.floor(payload.sourceWidth ?? payload.width));
  const sourceHeight = Math.max(2, Math.floor(payload.sourceHeight ?? payload.height));
  const cropX = Math.max(0, Math.min(sourceWidth - 2, Math.floor((payload.cropX ?? 0) / 2) * 2));
  const cropY = Math.max(0, Math.min(sourceHeight - 2, Math.floor((payload.cropY ?? 0) / 2) * 2));
  const cropWidth = Math.max(2, Math.floor(Math.min(payload.width, sourceWidth - cropX) / 2) * 2);
  const cropHeight = Math.max(2, Math.floor(Math.min(payload.height, sourceHeight - cropY) / 2) * 2);
  await runFfmpeg([
    "-y",
    "-f",
    "matroska",
    "-i",
    inputPath,
    "-vf",
    `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`,
    "-fps_mode",
    "passthrough",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    recordingMp4Crf(settings),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath
  ]);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estimateSvgTextWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, character) => {
    if (/[\u3400-\u9fff]/.test(character)) return width + fontSize;
    if (/[0-9]/.test(character)) return width + fontSize * 0.58;
    if (/[A-Z]/.test(character)) return width + fontSize * 0.68;
    if (/[a-z]/.test(character)) return width + fontSize * 0.54;
    return width + fontSize * 0.42;
  }, 0);
}

function ellipsizeSvgText(value: string, fontSize: number, maxWidth: number) {
  if (estimateSvgTextWidth(value, fontSize) <= maxWidth) {
    return value;
  }
  const ellipsis = "...";
  let result = value;
  while (result.length > 0 && estimateSvgTextWidth(`${result}${ellipsis}`, fontSize) > maxWidth) {
    result = Array.from(result).slice(0, -1).join("");
  }
  return `${result}${ellipsis}`;
}

function buildWatermarkSvg(options: CaptureOptions, timestamp: string, imageWidth: number, imageHeight: number) {
  const metaLines = [
    options.location.trim() ? `地点 ${options.location.trim()}` : "地点 未设置",
    options.project.trim() ? `项目 ${options.project.trim()}` : "",
    options.note.trim() ? `备注 ${options.note.trim()}` : ""
  ].filter(Boolean);

  const shortSide = Math.min(imageWidth, imageHeight);
  const fontSize = Math.max(13, Math.min(22, Math.round(shortSide * 0.028)));
  const timeFontSize = Math.round(fontSize * 1.28);
  const lineHeight = Math.round(fontSize * 1.48);
  const paddingX = Math.round(fontSize * 1.05);
  const paddingY = Math.round(fontSize * 0.9);
  const accentWidth = Math.max(4, Math.round(fontSize * 0.28));
  const contentGap = Math.round(fontSize * 0.76);
  const margin = Math.max(12, Math.round(fontSize * 1.1));
  const maxCardWidth = Math.max(80, Math.min(imageWidth - margin * 2, 620));
  const desiredTextWidth = Math.max(
    estimateSvgTextWidth(timestamp, timeFontSize),
    ...metaLines.map((line) => estimateSvgTextWidth(line, fontSize))
  );
  const maxAvailableTextWidth = Math.max(60, maxCardWidth - paddingX * 2 - accentWidth - contentGap);
  const cardTextWidth = Math.min(Math.ceil(desiredTextWidth), maxAvailableTextWidth);
  const minimumCardWidth = Math.min(180, maxCardWidth);
  const contentWidth = Math.max(minimumCardWidth, Math.min(maxCardWidth, cardTextWidth + paddingX * 2 + accentWidth + contentGap));
  const metaGap = metaLines.length > 0 ? Math.round(fontSize * 0.55) : 0;
  const boxHeight = paddingY * 2 + timeFontSize + metaGap + metaLines.length * lineHeight;

  const isBottomBar = options.watermarkPosition === "bottom-bar";
  const width = isBottomBar ? imageWidth : contentWidth;
  const height = boxHeight;

  const x =
    options.watermarkPosition === "top-right" || options.watermarkPosition === "bottom-right"
      ? imageWidth - width - margin
      : isBottomBar
        ? 0
        : margin;
  const y =
    options.watermarkPosition === "bottom-left" ||
    options.watermarkPosition === "bottom-right" ||
    options.watermarkPosition === "bottom-bar"
      ? imageHeight - height - (isBottomBar ? 0 : margin)
      : margin;

  const accentX = isBottomBar ? margin : paddingX;
  const textX = accentX + accentWidth + contentGap;
  const maxTextWidth = Math.max(80, width - textX - paddingX);
  const metaStartY = paddingY + timeFontSize + metaGap + Math.round(fontSize * 0.86);
  const metaTextNodes = metaLines
    .map((line, index) => {
      const yPosition = metaStartY + index * lineHeight;
      return `<text x="${textX}" y="${yPosition}" font-family="Microsoft YaHei, Segoe UI, Arial" font-size="${fontSize}" font-weight="650" fill="#6b3b2f">${escapeXml(ellipsizeSvgText(line, fontSize, maxTextWidth))}</text>`;
    })
    .join("");

  const radius = isBottomBar ? 0 : Math.round(fontSize * 0.75);
  const accentRadius = Math.max(2, Math.round(accentWidth / 2));
  const timeY = paddingY + Math.round(timeFontSize * 0.92);
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#7c2d12" flood-opacity="0.18" />
        </filter>
        <linearGradient id="accentFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff8a3d" />
          <stop offset="1" stop-color="#ef2f25" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="rgba(255, 250, 244, 0.92)" stroke="rgba(255, 106, 42, 0.36)" stroke-width="1" filter="url(#shadow)" />
      <rect x="${accentX}" y="${paddingY}" width="${accentWidth}" height="${height - paddingY * 2}" rx="${accentRadius}" fill="url(#accentFill)" />
      <text x="${textX}" y="${timeY}" font-family="Microsoft YaHei, Segoe UI, Arial" font-size="${timeFontSize}" font-weight="800" fill="#ef2f25" letter-spacing="0">${escapeXml(ellipsizeSvgText(timestamp, timeFontSize, maxTextWidth))}</text>
      ${metaTextNodes}
    </svg>
  `;

  return {
    input: Buffer.from(svg),
    left: Math.max(0, x),
    top: Math.max(0, y)
  };
}

function captureCropFromDisplay(region: CaptureRegion, display: DisplayLike) {
  const scaleFactor = display.scaleFactor || 1;
  return {
    left: Math.max(0, Math.round((region.x - display.bounds.x) * scaleFactor)),
    top: Math.max(0, Math.round((region.y - display.bounds.y) * scaleFactor)),
    width: Math.max(1, Math.round(region.width * scaleFactor)),
    height: Math.max(1, Math.round(region.height * scaleFactor))
  };
}

async function captureWithElectron(width: number, height: number, display?: DisplayLike): Promise<Buffer> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height }
  });
  const source = display ? sources.find((item) => item.display_id === String(display.id)) ?? sources[0] : sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("Electron 屏幕捕获失败。");
  }

  return source.thumbnail.toPNG();
}

async function captureWithWindowsGdi(width: number, height: number, display?: DisplayLike): Promise<Buffer> {
  const tempPath = path.join(os.tmpdir(), `jietu-shiyou-${crypto.randomUUID()}.png`);
  const sourceX = Math.round((display?.bounds.x ?? 0) * (display?.scaleFactor || 1));
  const sourceY = Math.round((display?.bounds.y ?? 0) * (display?.scaleFactor || 1));
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap ${width}, ${height}
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen((New-Object System.Drawing.Point ${sourceX}, ${sourceY}), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size ${width}, ${height}))
$bitmap.Save('${tempPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;

  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    timeout: 10000,
    maxBuffer: width * height * 4 + 1024 * 1024
  });

  try {
    return await fs.readFile(tempPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function captureScreenBuffer(width: number, height: number, display?: DisplayLike): Promise<Buffer> {
  if (process.platform === "win32") {
    return captureWithWindowsGdi(width, height, display);
  }

  try {
    return await captureWithElectron(width, height, display);
  } catch (error) {
    console.warn("Electron desktop capture failed, using Windows GDI fallback.", error);
    return captureWithWindowsGdi(width, height, display);
  }
}

async function detectCursorWindowRegion(display: DisplayLike): Promise<CaptureRegion | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const scaleFactor = display.scaleFactor || 1;
  const cursorPoint = screen.getCursorScreenPoint();
  const physicalX = Math.round(cursorPoint.x * scaleFactor);
  const physicalY = Math.round(cursorPoint.y * scaleFactor);
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class WindowProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(POINT point);

  [DllImport("user32.dll")]
  public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hwnd);

  public static string Probe(int x, int y) {
    var point = new POINT { X = x, Y = y };
    var hwnd = WindowFromPoint(point);
    if (hwnd == IntPtr.Zero) return "{}";
    hwnd = GetAncestor(hwnd, 2);
    if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd)) return "{}";
    RECT rect;
    if (!GetWindowRect(hwnd, out rect)) return "{}";
    return rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom;
  }
}

"@
[WindowProbe]::Probe(${physicalX}, ${physicalY})
`;

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      timeout: 2500,
      maxBuffer: 1024 * 64
    });
    const raw = stdout.trim();
    if (!raw || raw === "{}") return null;
    const [left, top, right, bottom] = raw.split(",").map((value) => Number(value.trim()));
    if (![left, top, right, bottom].every(Number.isFinite)) return null;

    const region = {
      x: Math.round(left / scaleFactor),
      y: Math.round(top / scaleFactor),
      width: Math.round((right - left) / scaleFactor),
      height: Math.round((bottom - top) / scaleFactor)
    };
    const displayRight = display.bounds.x + display.bounds.width;
    const displayBottom = display.bounds.y + display.bounds.height;
    const x1 = Math.max(display.bounds.x, Math.min(displayRight, region.x));
    const y1 = Math.max(display.bounds.y, Math.min(displayBottom, region.y));
    const x2 = Math.max(display.bounds.x, Math.min(displayRight, region.x + region.width));
    const y2 = Math.max(display.bounds.y, Math.min(displayBottom, region.y + region.height));
    const clamped = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    if (clamped.width < 80 || clamped.height < 60) return null;
    return clamped;
  } catch (error) {
    console.warn("Window region probe failed.", error);
    return null;
  }
}

async function detectCursorDisplayDeviceName(): Promise<string | null> {
  if (process.platform !== "win32") return null;

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DisplayProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MONITORINFOEX {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szDevice;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT point);

  [DllImport("user32.dll")]
  public static extern IntPtr MonitorFromPoint(POINT point, uint flags);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);

  public static string Probe() {
    POINT point;
    if (!GetCursorPos(out point)) return "";
    var monitor = MonitorFromPoint(point, 2);
    if (monitor == IntPtr.Zero) return "";
    var info = new MONITORINFOEX();
    info.cbSize = Marshal.SizeOf(info);
    return GetMonitorInfo(monitor, ref info) ? info.szDevice : "";
  }
}
"@
[DisplayProbe]::Probe()
`;

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      timeout: 2500,
      maxBuffer: 1024 * 64
    });
    const deviceName = stdout.trim();
    return deviceName || null;
  } catch (error) {
    console.warn("Display device probe failed.", error);
    return null;
  }
}

function imageDataUrlToBuffer(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("无效的图片数据。");
  }
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}

function rapidOcrEngineCandidates() {
  const resourceRoot = process.resourcesPath || "";
  return [
    path.join(resourceRoot, "ocr", "RapidOCR-json", "RapidOCR_json.exe"),
    path.join(resourceRoot, "ocr", "RapidOCR_json.exe"),
    path.join(process.cwd(), "build", "ocr", "RapidOCR-json", "RapidOCR_json.exe"),
    path.join(process.cwd(), "build", "ocr", "RapidOCR_json.exe"),
    path.join(appRuntimeDir, "ocr", "RapidOCR-json", "RapidOCR_json.exe"),
    path.join(appRuntimeDir, "ocr-v0.1.0", "RapidOCR-json", "RapidOCR_json.exe")
  ];
}

function findRapidOcrEngine() {
  return rapidOcrEngineCandidates().find((candidate) => fsSync.existsSync(candidate));
}

function resetOcrWorker() {
  if (!ocrWorker) return;
  try {
    ocrWorker.terminate();
  } catch (error) {
    console.warn("RapidOCR worker terminate failed.", error);
  }
  ocrWorker = null;
  ocrWorkerEnginePath = "";
}

function getOcrWorker(enginePath: string) {
  if (ocrWorker && ocrWorkerEnginePath === enginePath && ocrWorker.exitCode === null) {
    return ocrWorker;
  }
  resetOcrWorker();
  ocrWorkerEnginePath = enginePath;
  const worker = new OCR(enginePath, [], {
    cwd: path.dirname(enginePath),
    windowsHide: true
  } as unknown as OCR.Options);
  ocrWorker = worker;
  worker.on("error", (error) => {
    console.error("RapidOCR worker error.", error);
    if (ocrWorker === worker) {
      resetOcrWorker();
    }
  });
  worker.once("exit", () => {
    if (ocrWorker === worker) {
      ocrWorker = null;
      ocrWorkerEnginePath = "";
    }
  });
  return worker;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function prepareOcrImageBuffer(payload: InlineCapturePayload) {
  if (payload.ocrDataUrl) {
    return imageDataUrlToBuffer(payload.ocrDataUrl);
  }
  if (payload.baseDataUrl) {
    return imageDataUrlToBuffer(payload.baseDataUrl);
  }

  const display = screen.getDisplayMatching({
    x: Math.round(payload.region.x),
    y: Math.round(payload.region.y),
    width: Math.round(payload.region.width),
    height: Math.round(payload.region.height)
  });
  const displayScaleFactor = display.scaleFactor || 1;
  const width = Math.round(display.size.width * displayScaleFactor);
  const height = Math.round(display.size.height * displayScaleFactor);
  const capturedBuffer = await captureScreenBuffer(width, height, display);
  const metadata = await sharp(capturedBuffer).metadata();
  const imageWidth = metadata.width ?? width;
  const imageHeight = metadata.height ?? height;
  const crop = captureCropFromDisplay(payload.region, display);
  return sharp(capturedBuffer)
    .extract(clampExtractRect({ x: crop.left, y: crop.top, width: crop.width, height: crop.height }, imageWidth, imageHeight))
    .png()
    .toBuffer();
}

async function recognizeOcrFromInlinePayload(payload: InlineCapturePayload): Promise<OcrResult> {
  const startedAt = Date.now();
  const enginePath = findRapidOcrEngine();
  if (!enginePath) {
    return {
      ok: false,
      text: "",
      lines: [],
      elapsedMs: Date.now() - startedAt,
      error: "未找到 RapidOCR-json 引擎。请将 RapidOCR_json.exe 和 models 放到 resources/ocr/RapidOCR-json 或 .runtime/ocr-v0.1.0/RapidOCR-json。"
    };
  }

  await fs.mkdir(tempCaptureDir, { recursive: true });
  const tempPath = path.join(tempCaptureDir, `ocr-${crypto.randomUUID()}.png`);
  try {
    const inputBuffer = await prepareOcrImageBuffer(payload);
    const metadata = await sharp(inputBuffer).metadata();
    const sourceWidth = metadata.width ?? Math.round(payload.region.width);
    const resizeWidth = sourceWidth > 0 && sourceWidth < 1400 ? Math.min(2200, sourceWidth * 2) : undefined;
    const preparedBuffer = await sharp(inputBuffer)
      .resize(resizeWidth ? { width: resizeWidth, withoutEnlargement: false } : undefined)
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    await fs.writeFile(tempPath, preparedBuffer);

    const worker = getOcrWorker(enginePath);
    const result = await withTimeout(
      worker.flush({ imagePath: tempPath } as unknown as OCR.Arg),
      25000,
      "OCR 识别超时，请稍后重试。"
    );
    if (result.code !== 100) {
      return {
        ok: false,
        text: "",
        lines: [],
        elapsedMs: Date.now() - startedAt,
        enginePath,
        error: result.message || `OCR 识别失败，错误码：${result.code}`
      };
    }

    const lines = [...(result.data ?? [])]
      .filter((line) => line.text?.trim())
      .sort((a, b) => {
        const ay = a.box.reduce((sum, point) => sum + point[1], 0) / 4;
        const by = b.box.reduce((sum, point) => sum + point[1], 0) / 4;
        if (Math.abs(ay - by) > 12) return ay - by;
        const ax = a.box.reduce((sum, point) => sum + point[0], 0) / 4;
        const bx = b.box.reduce((sum, point) => sum + point[0], 0) / 4;
        return ax - bx;
      })
      .map((line) => ({
        text: line.text.trim(),
        confidence: line.score,
        box: line.box
      }));
    const text = lines.map((line) => line.text).join("\n");
    if (text) {
      clipboard.writeText(text);
    }
    return {
      ok: true,
      text,
      lines,
      elapsedMs: Date.now() - startedAt,
      enginePath
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("超时")) {
      resetOcrWorker();
    }
    return {
      ok: false,
      text: "",
      lines: [],
      elapsedMs: Date.now() - startedAt,
      enginePath,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function selectScreenRegionOnly(selectionHint: string): Promise<CaptureRegion | null> {
  return new Promise((resolve) => {
    const editorPath = overlayEditorHtmlPath();
    const displays = [getCursorDisplay()];
    const selectionChannel = `scroll-region-selected-${crypto.randomUUID()}`;
    const overlays = displays.map((display) => {
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        show: false,
        resizable: false,
        movable: false,
        fullscreenable: false,
        focusable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        title: mt().dialog.scrollSelectionTitle,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          backgroundThrottling: false
        }
      });
      overlay.setMenu(null);
      overlay.setMenuBarVisibility(false);
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlay.once("ready-to-show", () => {
        if (overlay.isDestroyed()) return;
        overlay.showInactive();
        overlay.moveTop();
        overlay.focus();
      });
      overlay.webContents.once("did-finish-load", () => {
        if (overlay.isDestroyed()) return;
        overlay.showInactive();
        overlay.moveTop();
      });
      void overlay.loadFile(editorPath, {
        query: {
          scaleFactor: String(display.scaleFactor || 1),
          offsetX: String(display.bounds.x),
          offsetY: String(display.bounds.y),
          selectionChannel,
          selectionHint,
          language: appSettings.language
        }
      });
      return { display, overlay };
    });
    let resolved = false;

    const showActiveOverlays = () => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) {
          overlay.showInactive();
          overlay.moveTop();
          overlay.setAlwaysOnTop(true, "screen-saver");
        }
      });
      overlays.find(({ overlay }) => !overlay.isDestroyed())?.overlay.focus();
    };

    const finish = (region: CaptureRegion | null) => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener(selectionChannel, onRegionSelected);
      ipcMain.removeListener("inline-capture-cancel", onCancel);
      ipcMain.removeListener("overlay:ready", onOverlayReady);
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.close();
      });
      resolve(region);
    };

    const onCancel = () => finish(null);

    const onRegionSelected = (_event: Electron.IpcMainEvent, region: CaptureRegion) => {
      finish(region);
    };

    const onOverlayReady = (event: Electron.IpcMainEvent) => {
      if (resolved) return;
      showActiveOverlays();
      const readyEntry = overlays.find(({ overlay }) => !overlay.isDestroyed() && overlay.webContents.id === event.sender.id);
      if (!readyEntry || readyEntry.overlay.isDestroyed()) return;
      readyEntry.overlay.focus();
    };

    ipcMain.once("inline-capture-cancel", onCancel);
    ipcMain.on(selectionChannel, onRegionSelected);
    ipcMain.on("overlay:ready", onOverlayReady);
    overlays.forEach(({ overlay }) => {
      overlay.on("closed", () => finish(null));
    });
    showActiveOverlays();
  });
}

async function selectAndEditRegion(): Promise<InlineCaptureResult | null> {
  return new Promise((resolve) => {
    const editorPath = overlayEditorHtmlPath();
    const displays = [getCursorDisplay()];
    const captureDisplayDataUrl = async (display: DisplayLike) => {
      const displayScaleFactor = display.scaleFactor || 1;
      const width = Math.round(display.size.width * displayScaleFactor);
      const height = Math.round(display.size.height * displayScaleFactor);
      const capturedBuffer = await captureScreenBuffer(width, height, display);
      return `data:image/png;base64,${capturedBuffer.toString("base64")}`;
    };

    const overlays = displays.map((display) => {
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        show: false,
        resizable: false,
        movable: false,
        fullscreenable: false,
        focusable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        title: mt().dialog.captureTitle,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          backgroundThrottling: false
        }
      });
      overlay.setMenu(null);
      overlay.setMenuBarVisibility(false);
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlay.once("ready-to-show", () => {
        if (overlay.isDestroyed()) return;
        overlay.showInactive();
        overlay.moveTop();
        overlay.focus();
      });
      overlay.webContents.once("did-finish-load", () => {
        if (overlay.isDestroyed()) return;
        overlay.showInactive();
        overlay.moveTop();
      });
      void overlay.loadFile(editorPath, {
        query: {
          scaleFactor: String(display.scaleFactor || 1),
          offsetX: String(display.bounds.x),
          offsetY: String(display.bounds.y),
          language: appSettings.language
        }
      });
      return { display, overlay };
    });
    const overlayDisplays = new Map(overlays.map(({ display, overlay }) => [overlay.webContents.id, display]));
    let resolved = false;
    let preparingCapture = false;
    let preparingPreview = false;
    let preparingOcr = false;

    const buildCompositeBuffer = async (payload: InlineCapturePayload) => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.hide();
      });
      await delay(32);

      let baseBuffer: Buffer;
      let extractWidth: number;
      let extractHeight: number;

      if (payload.baseDataUrl) {
        baseBuffer = Buffer.from(payload.baseDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
        const baseMetadata = await sharp(baseBuffer).metadata();
        extractWidth = baseMetadata.width ?? Math.round(payload.region.width);
        extractHeight = baseMetadata.height ?? Math.round(payload.region.height);
      } else {
        const display = screen.getDisplayMatching({
          x: Math.round(payload.region.x),
          y: Math.round(payload.region.y),
          width: Math.round(payload.region.width),
          height: Math.round(payload.region.height)
        });
        const displayScaleFactor = display.scaleFactor || 1;
        const width = Math.round(display.size.width * displayScaleFactor);
        const height = Math.round(display.size.height * displayScaleFactor);
        const capturedBuffer = await captureScreenBuffer(width, height, display);
        const metadata = await sharp(capturedBuffer).metadata();
        const imageWidth = metadata.width ?? width;
        const imageHeight = metadata.height ?? height;
        const crop = captureCropFromDisplay(payload.region, display);
        const left = Math.max(0, Math.min(crop.left, imageWidth - 1));
        const top = Math.max(0, Math.min(crop.top, imageHeight - 1));
        extractWidth = Math.max(1, Math.min(crop.width, imageWidth - left));
        extractHeight = Math.max(1, Math.min(crop.height, imageHeight - top));

        baseBuffer = await sharp(capturedBuffer)
          .extract({ left, top, width: extractWidth, height: extractHeight })
          .png()
          .toBuffer();
      }

      const clampPrivacyRegion = (region: CaptureRegion) => {
        const regionLeft = Math.max(0, Math.min(Math.round(region.x), extractWidth - 1));
        const regionTop = Math.max(0, Math.min(Math.round(region.y), extractHeight - 1));
        return {
          left: regionLeft,
          top: regionTop,
          width: Math.max(1, Math.min(Math.round(region.width), extractWidth - regionLeft)),
          height: Math.max(1, Math.min(Math.round(region.height), extractHeight - regionTop))
        };
      };

      if (payload.privacyDataUrl) {
        const privacyBuffer = Buffer.from(
          payload.privacyDataUrl.replace(/^data:image\/png;base64,/, ""),
          "base64"
        );
        baseBuffer = await sharp(baseBuffer)
          .composite([{ input: privacyBuffer, left: 0, top: 0 }])
          .png()
          .toBuffer();
      } else {
        for (const region of payload.mosaicRegions ?? []) {
          const mosaic = clampPrivacyRegion(region);
          const blockSize = Math.max(8, 6 + (region.strength || 5) * 4);
          const miniWidth = Math.max(1, Math.round(mosaic.width / blockSize));
          const miniHeight = Math.max(1, Math.round(mosaic.height / blockSize));
          const pixelated = await sharp(baseBuffer)
            .extract(mosaic)
            .resize(miniWidth, miniHeight, { kernel: sharp.kernel.nearest })
            .resize(mosaic.width, mosaic.height, { kernel: sharp.kernel.nearest })
            .png()
            .toBuffer();
          baseBuffer = await sharp(baseBuffer)
            .composite([{ input: pixelated, left: mosaic.left, top: mosaic.top }])
            .png()
            .toBuffer();
        }

        for (const region of payload.blurRegions ?? []) {
          const blur = clampPrivacyRegion(region);
          const radius = Math.max(8, 6 + (region.strength || 5) * 4);
          const padding = Math.ceil(radius * 2);
          const expanded = {
            left: Math.max(0, blur.left - padding),
            top: Math.max(0, blur.top - padding),
            width: 0,
            height: 0
          };
          expanded.width = Math.max(
            1,
            Math.min(extractWidth - expanded.left, blur.width + (blur.left - expanded.left) + padding)
          );
          expanded.height = Math.max(
            1,
            Math.min(extractHeight - expanded.top, blur.height + (blur.top - expanded.top) + padding)
          );
          const blurred = await sharp(baseBuffer)
            .extract(expanded)
            .blur(radius)
            .extract({
              left: blur.left - expanded.left,
              top: blur.top - expanded.top,
              width: blur.width,
              height: blur.height
            })
            .png()
            .toBuffer();
          baseBuffer = await sharp(baseBuffer)
            .composite([{ input: blurred, left: blur.left, top: blur.top }])
            .png()
            .toBuffer();
        }
      }

      const annotationBuffer = Buffer.from(
        payload.annotationDataUrl.replace(/^data:image\/png;base64,/, ""),
        "base64"
      );
      return sharp(baseBuffer).composite([{ input: annotationBuffer, left: 0, top: 0 }]).png().toBuffer();
    };

    const captureDisplayPreviewDataUrl = async (display: DisplayLike) => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.hide();
      });
      await delay(32);
      return captureDisplayDataUrl(display);
    };

    const showActiveOverlays = () => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) {
          overlay.showInactive();
          overlay.moveTop();
          overlay.setAlwaysOnTop(true, "screen-saver");
        }
      });
      overlays.find(({ overlay }) => !overlay.isDestroyed())?.overlay.focus();
    };

    const notifyCaptureError = () => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.webContents.send("inline-capture-error");
      });
    };

    const finish = (result: InlineCaptureResult | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      ipcMain.removeListener("inline-capture-complete", onComplete);
      ipcMain.removeListener("inline-capture-save-as", onSaveAs);
      ipcMain.removeListener("inline-capture-copy", onCopy);
      ipcMain.removeListener("inline-capture-pin", onPin);
      ipcMain.removeListener("inline-capture-scroll", onScroll);
      ipcMain.removeListener("inline-capture-ocr", onOcr);
      ipcMain.removeListener("inline-capture-cancel", onCancel);
      ipcMain.removeListener("inline-region-selected", onRegionSelected);
      ipcMain.removeListener("overlay:ready", onOverlayReady);
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.close();
      });
      resolve(result);
    };

    const onComplete = async (_event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || resolved) {
        return;
      }
      preparingCapture = true;
      try {
        finish({ buffer: await buildCompositeBuffer(payload), action: "save" });
      } catch (error) {
        console.error("Inline capture failed.", error);
        showActiveOverlays();
        notifyCaptureError();
        preparingCapture = false;
      }
    };

    const onSaveAs = async (_event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || resolved) {
        return;
      }
      preparingCapture = true;
      try {
        const buffer = await buildCompositeBuffer(payload);
        const savePath = await showScreenshotSaveDialog();
        if (!savePath) {
          showActiveOverlays();
          if (!_event.sender.isDestroyed()) {
            _event.sender.send("inline-capture-save-canceled");
          }
          preparingCapture = false;
          return;
        }
        finish({ buffer, action: "save-as", savePath });
      } catch (error) {
        console.error("Inline save as failed.", error);
        showActiveOverlays();
        notifyCaptureError();
        preparingCapture = false;
      }
    };

    const onPin = async (_event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || resolved) {
        return;
      }
      preparingCapture = true;
      try {
        finish({ buffer: await buildCompositeBuffer(payload), action: "pin" });
      } catch (error) {
        console.error("Inline pin failed.", error);
        showActiveOverlays();
        notifyCaptureError();
        preparingCapture = false;
      }
    };

    const onCopy = async (_event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || resolved) {
        return;
      }
      preparingCapture = true;
      try {
        finish({ buffer: await buildCompositeBuffer(payload), action: "copy" });
      } catch (error) {
        console.error("Inline copy failed.", error);
        showActiveOverlays();
        notifyCaptureError();
        preparingCapture = false;
      }
    };

    const onScroll = async (event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || preparingPreview || resolved || event.sender.isDestroyed()) {
        return;
      }
      preparingCapture = true;
      const display = overlayDisplays.get(event.sender.id);
      try {
        overlays.forEach(({ overlay }) => {
          if (!overlay.isDestroyed()) overlay.hide();
        });
        const { buffer, usedFrames } = await captureScrollingBufferFromRegion(payload.region, (message) => {
          mainWindow?.webContents.send("app:status", message);
        });
        const metadata = await sharp(buffer).metadata();
        const imageWidth = metadata.width ?? Math.round(payload.region.width);
        const imageHeight = metadata.height ?? Math.round(payload.region.height);
        const targetDisplay = display ?? screen.getDisplayMatching(payload.region);
        const maxPreviewWidth = Math.max(240, targetDisplay.bounds.width - 80);
        const maxPreviewHeight = Math.max(180, targetDisplay.bounds.height - 150);
        const previewScale = Math.max(imageWidth / maxPreviewWidth, imageHeight / maxPreviewHeight, 1);
        const previewWidth = Math.max(120, Math.round(imageWidth / previewScale));
        const previewHeight = Math.max(80, Math.round(imageHeight / previewScale));
        const previewX = Math.round((targetDisplay.bounds.width - previewWidth) / 2);
        const previewY = Math.max(18, Math.round((targetDisplay.bounds.height - previewHeight) / 2) - 24);
        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

        showActiveOverlays();
        if (resolved || event.sender.isDestroyed()) return;
        event.sender.send("inline-region-ready", {
          x: previewX,
          y: previewY,
          width: previewWidth,
          height: previewHeight,
          pixelWidth: imageWidth,
          pixelHeight: imageHeight,
          scaleFactor: previewScale,
          captureRegion: { x: 0, y: 0, width: imageWidth, height: imageHeight },
          backgroundMode: "image",
          backgroundDataUrl: dataUrl,
          baseDataUrl: dataUrl
        });
        mainWindow?.webContents.send("app:status", mt().status.scrollMergedEditable(usedFrames));
      } catch (error) {
        console.error("Inline scroll capture failed.", error);
        showActiveOverlays();
        notifyCaptureError();
      } finally {
        preparingCapture = false;
      }
    };

    const onOcr = async (event: Electron.IpcMainEvent, payload: InlineCapturePayload) => {
      if (preparingCapture || preparingPreview || preparingOcr || resolved || event.sender.isDestroyed()) {
        return;
      }
      preparingOcr = true;
      try {
        const result = await recognizeOcrFromInlinePayload(payload);
        if (!event.sender.isDestroyed()) {
          event.sender.send("inline-ocr-result", result);
        }
        mainWindow?.webContents.send("app:status", result.ok ? mt().status.ocrDone : result.error || mt().status.ocrFailed);
      } catch (error) {
        const result: OcrResult = {
          ok: false,
          text: "",
          lines: [],
          elapsedMs: 0,
          error: error instanceof Error ? error.message : String(error)
        };
        if (!event.sender.isDestroyed()) {
          event.sender.send("inline-ocr-result", result);
        }
      } finally {
        preparingOcr = false;
      }
    };

    const onCancel = () => finish(null);

    const onOverlayReady = (event: Electron.IpcMainEvent) => {
      if (resolved) return;
      showActiveOverlays();
      const readyEntry = overlays.find(({ overlay }) => !overlay.isDestroyed() && overlay.webContents.id === event.sender.id);
      const readyOverlay = readyEntry?.overlay;
      if (readyEntry && readyOverlay && !readyOverlay.isDestroyed()) {
        readyOverlay.focus();
      }
    };

    const onRegionSelected = async (event: Electron.IpcMainEvent, region: CaptureRegion) => {
      if (preparingCapture || preparingPreview || resolved || event.sender.isDestroyed()) {
        return;
      }
      const display = overlayDisplays.get(event.sender.id);
      if (!display) return;
      preparingPreview = true;
      let backgroundDataUrl: string | undefined;
      try {
        backgroundDataUrl = await captureDisplayPreviewDataUrl(display);
      } catch (error) {
        console.warn("Inline preview capture failed.", error);
      } finally {
        showActiveOverlays();
        preparingPreview = false;
      }
      if (resolved || event.sender.isDestroyed()) return;
      event.sender.send("inline-region-ready", {
        x: region.x - display.bounds.x,
        y: region.y - display.bounds.y,
        width: region.width,
        height: region.height,
        scaleFactor: display.scaleFactor || 1,
        backgroundMode: "display",
        backgroundDataUrl
      });
    };

    ipcMain.once("inline-capture-complete", onComplete);
    ipcMain.on("inline-capture-save-as", onSaveAs);
    ipcMain.once("inline-capture-copy", onCopy);
    ipcMain.once("inline-capture-pin", onPin);
    ipcMain.on("inline-capture-scroll", onScroll);
    ipcMain.on("inline-capture-ocr", onOcr);
    ipcMain.once("inline-capture-cancel", onCancel);
    ipcMain.on("inline-region-selected", onRegionSelected);
    ipcMain.on("overlay:ready", onOverlayReady);
    overlays.forEach(({ overlay }) => {
      overlay.on("closed", () => finish(null));
    });
    showActiveOverlays();
  });
}

function clampExtractRect(crop: CaptureRegion, imageWidth: number, imageHeight: number) {
  const left = Math.max(0, Math.min(Math.round(crop.x), imageWidth - 1));
  const top = Math.max(0, Math.min(Math.round(crop.y), imageHeight - 1));
  return {
    left,
    top,
    width: Math.max(1, Math.min(Math.round(crop.width), imageWidth - left)),
    height: Math.max(1, Math.min(Math.round(crop.height), imageHeight - top))
  };
}

async function captureRegionFrame(region: CaptureRegion): Promise<RegionFrame> {
  const display = screen.getDisplayMatching({
    x: Math.round(region.x),
    y: Math.round(region.y),
    width: Math.round(region.width),
    height: Math.round(region.height)
  });
  const displayScaleFactor = display.scaleFactor || 1;
  const width = Math.round(display.size.width * displayScaleFactor);
  const height = Math.round(display.size.height * displayScaleFactor);
  const capturedBuffer = await captureScreenBuffer(width, height, display);
  const metadata = await sharp(capturedBuffer).metadata();
  const imageWidth = metadata.width ?? width;
  const imageHeight = metadata.height ?? height;
  const crop = captureCropFromDisplay(region, display);
  const extractRect = clampExtractRect(
    { x: crop.left, y: crop.top, width: crop.width, height: crop.height },
    imageWidth,
    imageHeight
  );
  const buffer = await sharp(capturedBuffer).extract(extractRect).png().toBuffer();
  const rawImage = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    buffer,
    raw: rawImage.data,
    width: rawImage.info.width,
    height: rawImage.info.height,
    channels: rawImage.info.channels
  };
}

function frameDifference(a: RegionFrame, b: RegionFrame) {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return Number.POSITIVE_INFINITY;
  const strideX = Math.max(1, Math.floor(a.width / 80));
  const strideY = Math.max(1, Math.floor(a.height / 80));
  let total = 0;
  let count = 0;
  for (let y = 0; y < a.height; y += strideY) {
    for (let x = 0; x < a.width; x += strideX) {
      const offset = (y * a.width + x) * a.channels;
      total += Math.abs(a.raw[offset] - b.raw[offset]);
      total += Math.abs(a.raw[offset + 1] - b.raw[offset + 1]);
      total += Math.abs(a.raw[offset + 2] - b.raw[offset + 2]);
      count += 3;
    }
  }
  return count ? total / count : Number.POSITIVE_INFINITY;
}

function overlapDifference(previous: RegionFrame, next: RegionFrame, overlap: number) {
  const width = Math.min(previous.width, next.width);
  const strideX = Math.max(1, Math.floor(width / 96));
  const strideY = Math.max(1, Math.floor(overlap / 48));
  let total = 0;
  let count = 0;
  for (let y = 0; y < overlap; y += strideY) {
    const previousY = previous.height - overlap + y;
    const nextY = y;
    for (let x = 0; x < width; x += strideX) {
      const previousOffset = (previousY * previous.width + x) * previous.channels;
      const nextOffset = (nextY * next.width + x) * next.channels;
      total += Math.abs(previous.raw[previousOffset] - next.raw[nextOffset]);
      total += Math.abs(previous.raw[previousOffset + 1] - next.raw[nextOffset + 1]);
      total += Math.abs(previous.raw[previousOffset + 2] - next.raw[nextOffset + 2]);
      count += 3;
    }
  }
  return count ? total / count : Number.POSITIVE_INFINITY;
}

function findScrollOverlap(previous: RegionFrame, next: RegionFrame) {
  if (previous.width !== next.width || previous.channels !== next.channels) return 0;
  const maxOverlap = Math.min(previous.height - 8, next.height - 8, Math.floor(previous.height * 0.9));
  const minOverlap = Math.max(24, Math.floor(previous.height * 0.12));
  if (maxOverlap <= minOverlap) return 0;
  const coarseStep = Math.max(4, Math.floor((maxOverlap - minOverlap) / 80));
  let bestOverlap = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let overlap = maxOverlap; overlap >= minOverlap; overlap -= coarseStep) {
    const score = overlapDifference(previous, next, overlap);
    if (score < bestScore) {
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  const refineStart = Math.min(maxOverlap, bestOverlap + coarseStep);
  const refineEnd = Math.max(minOverlap, bestOverlap - coarseStep);
  for (let overlap = refineStart; overlap >= refineEnd; overlap -= 1) {
    const score = overlapDifference(previous, next, overlap);
    if (score < bestScore) {
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  return bestScore <= 18 ? bestOverlap : 0;
}

function rowDifference(a: RegionFrame, b: RegionFrame, row: number) {
  const width = Math.min(a.width, b.width);
  const strideX = Math.max(1, Math.floor(width / 120));
  let total = 0;
  let count = 0;
  for (let x = 0; x < width; x += strideX) {
    const offsetA = (row * a.width + x) * a.channels;
    const offsetB = (row * b.width + x) * b.channels;
    total += Math.abs(a.raw[offsetA] - b.raw[offsetB]);
    total += Math.abs(a.raw[offsetA + 1] - b.raw[offsetB + 1]);
    total += Math.abs(a.raw[offsetA + 2] - b.raw[offsetB + 2]);
    count += 3;
  }
  return count ? total / count : Number.POSITIVE_INFINITY;
}

function findRepeatedTopHeight(first: RegionFrame, next: RegionFrame) {
  if (first.width !== next.width || first.channels !== next.channels) return 0;
  const maxTop = Math.min(first.height, next.height, Math.max(48, Math.floor(first.height * 0.28)), 260);
  let repeatedHeight = 0;
  let misses = 0;
  for (let y = 0; y < maxTop; y += 4) {
    const diff = rowDifference(first, next, y);
    if (diff <= 8) {
      repeatedHeight = y + 4;
      misses = 0;
      continue;
    }
    misses += 1;
    if (misses >= 3) break;
  }
  return repeatedHeight >= 24 ? repeatedHeight : 0;
}

async function sendWheelScrollAt(point: { x: number; y: number }, wheelDelta: number) {
  if (process.platform !== "win32") return;
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ScrollInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
"@
[ScrollInput]::SetCursorPos(${Math.round(point.x)}, ${Math.round(point.y)}) | Out-Null
Start-Sleep -Milliseconds 20
[ScrollInput]::mouse_event(0x0800, 0, 0, ${Math.round(wheelDelta)}, [UIntPtr]::Zero)
`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    timeout: 2000,
    maxBuffer: 16 * 1024
  });
}

async function stitchScrollFrames(frames: RegionFrame[]) {
  if (!frames.length) {
    throw new Error("没有可合成的滚动截图帧。");
  }
  const first = frames[0];
  const composites: sharp.OverlayOptions[] = [{ input: first.buffer, left: 0, top: 0 }];
  let totalHeight = first.height;
  let usedFrames = 1;
  const maxHeight = 60000;

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const frame = frames[index];
    const overlap = findScrollOverlap(previous, frame);
    const repeatedTop = findRepeatedTopHeight(first, frame);
    const appendTop = Math.max(0, overlap, repeatedTop);
    const appendHeight = frame.height - appendTop;
    if (appendHeight < 16 || totalHeight + appendHeight > maxHeight) {
      break;
    }
    const appendedBuffer = await sharp(frame.buffer)
      .extract({ left: 0, top: appendTop, width: frame.width, height: appendHeight })
      .png()
      .toBuffer();
    composites.push({ input: appendedBuffer, left: 0, top: totalHeight });
    totalHeight += appendHeight;
    usedFrames += 1;
  }

  return sharp({
    create: {
      width: first.width,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer()
    .then((buffer) => ({ buffer, usedFrames }));
}

async function captureScrollingBufferFromRegion(
  region: CaptureRegion,
  onProgress?: (message: string) => void
) {
  await delay(180);
  const scrollPoint = {
    x: Math.round(region.x + region.width / 2),
    y: Math.round(region.y + Math.min(region.height - 12, region.height * 0.72))
  };
  const frames: RegionFrame[] = [];
  const maxFrames = 24;
  const wheelDelta = -720;

  frames.push(await captureRegionFrame(region));
  for (let index = 1; index < maxFrames; index += 1) {
    await sendWheelScrollAt(scrollPoint, wheelDelta);
    await delay(420);
    const nextFrame = await captureRegionFrame(region);
    const diff = frameDifference(frames[frames.length - 1], nextFrame);
    if (diff < 1.2) {
      break;
    }
    frames.push(nextFrame);
    onProgress?.(`正在滚动截图：已捕获 ${frames.length} 帧`);
  }

  return stitchScrollFrames(frames);
}

async function saveCapturedBuffer(
  capturedBuffer: Buffer,
  options: CaptureOptions,
  copyAfterCapture = false,
  forcePin = false,
  savePath?: string
): Promise<ScreenshotRecord> {
  const metadata = await sharp(capturedBuffer).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const defaultExtension = appSettings.outputFormat === "jpg" ? "jpg" : "png";
  const filePath = savePath
    ? ensureImageFileExtension(savePath, outputExtensionFromPath(savePath, defaultExtension))
    : await buildScreenshotFilePath(now, defaultExtension);
  const extension = outputExtensionFromPath(filePath, defaultExtension);
  const imagePipeline = options.watermarkEnabled === false
    ? sharp(capturedBuffer)
    : sharp(capturedBuffer).composite([buildWatermarkSvg(options, timestamp, imageWidth, imageHeight)]);
  const outputBuffer =
    extension === "jpg"
      ? await imagePipeline.jpeg({ quality: 92 }).toBuffer()
      : await imagePipeline.png().toBuffer();

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, outputBuffer);

  const record: ScreenshotRecord = {
    id: crypto.randomUUID(),
    filePath,
    createdAt: now.toISOString(),
    location: options.location.trim(),
    project: options.project.trim(),
    note: options.note.trim(),
    watermarkPosition: options.watermarkPosition
  };

  const history = await readHistory();
  await writeHistory([record, ...history].slice(0, 500));
  clipboard.writeImage(nativeImage.createFromBuffer(outputBuffer));
  mainWindow?.webContents.send("app:capture-created", record);
  if (forcePin || appSettings.autoPinAfterCapture) {
    await createPinWindow(filePath);
  }
  return record;
}

async function capturePrimaryScreen(options: CaptureOptions, copyAfterCapture = false): Promise<ScreenshotRecord | null> {
  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  if (mainWindow) {
    mainWindow.hide();
    await delay(16);
  }

  try {
    const captureResult = await selectAndEditRegion();
    if (!captureResult) {
      return null;
    }
    return saveCapturedBuffer(
      captureResult.buffer,
      options,
      copyAfterCapture || captureResult.action === "copy",
      captureResult.action === "pin",
      captureResult.savePath
    );
  } finally {
    if (mainWindow && shouldRestoreWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

async function captureSelectedRegion(options: CaptureOptions, copyAfterCapture = false): Promise<ScreenshotRecord | null> {
  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  mainWindow?.hide();
  if (shouldRestoreWindow) {
    await delay(16);
  }

  try {
    const captureResult = await selectAndEditRegion();
    if (!captureResult) {
      return null;
    }
    return saveCapturedBuffer(
      captureResult.buffer,
      options,
      copyAfterCapture || captureResult.action === "copy",
      captureResult.action === "pin",
      captureResult.savePath
    );
  } finally {
    if (shouldRestoreWindow) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  }
}

async function captureScrollingRegion(options: CaptureOptions, copyAfterCapture = false): Promise<ScreenshotRecord | null> {
  await ensureStorage();
  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  mainWindow?.hide();
  await delay(32);

  try {
    mainWindow?.webContents.send("app:status", mt().status.scrollSelect);
    const region = await selectScreenRegionOnly(mt().status.scrollHint);
    if (!region) {
      return null;
    }

    mainWindow?.webContents.send("app:status", mt().status.scrollPreparing);
    const { buffer, usedFrames } = await captureScrollingBufferFromRegion(region, (message) =>
      mainWindow?.webContents.send("app:status", message)
    );
    mainWindow?.webContents.send("app:status", mt().status.scrollMerged(usedFrames));
    return saveCapturedBuffer(buffer, options, copyAfterCapture || appSettings.autoCopy);
  } finally {
    if (shouldRestoreWindow) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  }
}

function recorderHostPath() {
  const fileName = "ZhuagepingRecorderHost.exe";
  const packagedPath = path.join(process.resourcesPath, "recorder", fileName);
  if (app.isPackaged) return packagedPath;
  const builtPath = path.join(process.cwd(), "build", "recorder", fileName);
  return fsSync.existsSync(builtPath) ? builtPath : packagedPath;
}

function closeRecordingOverlay(overlay: BrowserWindow) {
  if (!overlay.isDestroyed()) {
    overlay.setIgnoreMouseEvents(false);
    overlay.close();
  }
  if (activeRecordingOverlay === overlay) activeRecordingOverlay = null;
  activeRecordingUsesNative = false;
  nativeRecordingSelectionCommitted = false;
}

async function runNativeRecordingOverlay(settings: AppSettings, mode: RecordingMode): Promise<NativeRecordingSelection | null> {
  const display = getCursorDisplay();
  const windowRegion = mode === "region" ? await detectCursorWindowRegion(display) : null;
  const localWindowRegion = windowRegion
    ? {
        x: Math.max(0, windowRegion.x - display.bounds.x),
        y: Math.max(0, windowRegion.y - display.bounds.y),
        width: Math.max(0, windowRegion.width),
        height: Math.max(0, windowRegion.height)
      }
    : null;

  return new Promise((resolve) => {
    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      show: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      focusable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: mt().dialog.recordingTitle,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });
    activeRecordingOverlay = overlay;
    activeRecordingUsesNative = true;
    nativeRecordingSelectionCommitted = false;
    let settled = false;

    const removeSelectionListeners = () => {
      ipcMain.removeListener("recording-region-selected", onSelected);
      ipcMain.removeListener("recording-cancel", onCancel);
      ipcMain.removeListener("overlay:ready", onReady);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      removeSelectionListeners();
      ipcMain.removeListener("recording-ignore-mouse", onIgnoreMouse);
      closeRecordingOverlay(overlay);
      resolve(null);
    };
    const showOverlay = () => {
      if (overlay.isDestroyed()) return;
      overlay.showInactive();
      overlay.moveTop();
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.focus();
    };
    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender.id === overlay.webContents.id) showOverlay();
    };
    const onCancel = (event: Electron.IpcMainEvent) => {
      if (event.sender.id === overlay.webContents.id) cancel();
    };
    const onIgnoreMouse = (event: Electron.IpcMainEvent, ignore: boolean) => {
      if (event.sender.id !== overlay.webContents.id || overlay.isDestroyed()) return;
      overlay.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    };
    const onSelected = (event: Electron.IpcMainEvent, region: CaptureRegion) => {
      if (settled || event.sender.id !== overlay.webContents.id) return;
      const width = Math.max(2, Math.min(display.bounds.width, Math.round(region.width)));
      const height = Math.max(2, Math.min(display.bounds.height, Math.round(region.height)));
      const x = Math.max(0, Math.min(display.bounds.width - width, Math.round(region.x)));
      const y = Math.max(0, Math.min(display.bounds.height - height, Math.round(region.y)));
      settled = true;
      nativeRecordingSelectionCommitted = true;
      removeSelectionListeners();
      resolve({ display, region: { x, y, width, height }, overlay });
    };

    overlay.setMenu(null);
    overlay.setMenuBarVisibility(false);
    overlay.setContentProtection(true);
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.once("ready-to-show", showOverlay);
    overlay.webContents.once("did-finish-load", showOverlay);
    overlay.on("closed", () => {
      ipcMain.removeListener("recording-ignore-mouse", onIgnoreMouse);
      if (!settled) cancel();
      if (activeRecordingOverlay === overlay) {
        activeRecordingOverlay = null;
        activeRecordingUsesNative = false;
        nativeRecordingSelectionCommitted = false;
      }
      if (activeNativeRecorderProcess?.stdin?.writable) activeNativeRecorderProcess.stdin.write("cancel\n");
    });

    ipcMain.on("recording-region-selected", onSelected);
    ipcMain.on("recording-cancel", onCancel);
    ipcMain.on("recording-ignore-mouse", onIgnoreMouse);
    ipcMain.on("overlay:ready", onReady);

    void overlay.loadFile(recorderHtmlPath(), {
      query: {
        nativeMode: "true",
        scaleFactor: String(display.scaleFactor || 1),
        offsetX: String(display.bounds.x),
        offsetY: String(display.bounds.y),
        displayWidth: String(display.bounds.width),
        displayHeight: String(display.bounds.height),
        displayPixelWidth: String(Math.round(display.size.width * (display.scaleFactor || 1))),
        displayPixelHeight: String(Math.round(display.size.height * (display.scaleFactor || 1))),
        fps: String(settings.recordingFps),
        countdown: String(settings.recordingCountdown),
        mode,
        windowX: String(localWindowRegion?.x ?? ""),
        windowY: String(localWindowRegion?.y ?? ""),
        windowWidth: String(localWindowRegion?.width ?? ""),
        windowHeight: String(localWindowRegion?.height ?? ""),
        language: settings.language
      }
    });
  });
}

type NativeRecorderResult = { filePath: string; canceled: boolean };

function runNativeRecorder(config: Record<string, unknown>): Promise<NativeRecorderResult> {
  const executablePath = recorderHostPath();
  if (!fsSync.existsSync(executablePath)) {
    return Promise.reject(new Error(`Native recorder host not found: ${executablePath}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    activeNativeRecorderProcess = child;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let settled = false;

    const finish = (error: Error | null, result?: NativeRecorderResult) => {
      if (settled) return;
      settled = true;
      if (activeNativeRecorderProcess === child) activeNativeRecorderProcess = null;
      if (error) reject(error);
      else resolve(result ?? { filePath: "", canceled: true });
    };
    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as { type?: string; payload?: { filePath?: string; message?: string; detail?: string } };
        if (event.type === "completed" && event.payload?.filePath) {
          finish(null, { filePath: event.payload.filePath, canceled: false });
        } else if (event.type === "canceled") {
          finish(null, { filePath: "", canceled: true });
        } else if (event.type === "error") {
          finish(new Error(event.payload?.message || event.payload?.detail || "Native recorder failed."));
        }
      } catch (error) {
        console.warn("Invalid native recorder event.", line, error);
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      lines.forEach(processLine);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      if (!settled) finish(new Error(stderrBuffer.trim() || `Native recorder exited with code ${code}.`));
    });
    child.stdin?.write(`${JSON.stringify(config)}\n`);
    if (pendingNativeRecorderCommand) {
      child.stdin?.write(`${pendingNativeRecorderCommand}\n`);
      pendingNativeRecorderCommand = null;
    }
  });
}

async function saveNativeRecordingRecord(
  filePath: string,
  startedAt: number,
  width: number,
  height: number
): Promise<RecordingRecord> {
  const stat = await fs.stat(filePath);
  if (stat.size < 1024) throw new Error("录屏文件为空，请稍后重试。");
  const createdAt = new Date();
  const record: RecordingRecord = {
    id: crypto.randomUUID(),
    filePath,
    createdAt: createdAt.toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt),
    width,
    height,
    format: "mp4"
  };
  const records = await readRecordingHistory();
  await writeRecordingHistory([record, ...records].slice(0, 200));
  mainWindow?.webContents.send("app:recording-created", record);
  mainWindow?.webContents.send("app:status", mt().status.recordingSaved(filePath));
  return record;
}

async function recordSelectedRegionNative(settings: AppSettings, mode: RecordingMode): Promise<RecordingRecord | null> {
  const selection = await runNativeRecordingOverlay(settings, mode);
  if (!selection) return null;

  const { display, region, overlay } = selection;
  const scaleFactor = display.scaleFactor || 1;
  const width = Math.max(2, Math.floor((region.width * scaleFactor) / 2) * 2);
  const height = Math.max(2, Math.floor((region.height * scaleFactor) / 2) * 2);
  const x = Math.max(0, Math.floor((region.x * scaleFactor) / 2) * 2);
  const y = Math.max(0, Math.floor((region.y * scaleFactor) / 2) * 2);
  const filePath = await buildRecordingFilePath(new Date(), "mp4");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const displayName = await detectCursorDisplayDeviceName();
  const startedAt = Date.now();

  try {
    const result = await runNativeRecorder({
      outputPath: filePath,
      displayName,
      x,
      y,
      width,
      height,
      framerate: settings.recordingFps,
      bitrate: recordingVideoBitsPerSecond(settings),
      captureSystemAudio: true,
      captureMicrophone: settings.recordingMic,
      showCursor: settings.recordingShowCursor,
      showClickHighlight: settings.recordingClickHighlight
    });
    if (result.canceled) {
      await fs.unlink(filePath).catch(() => undefined);
      return null;
    }
    return saveNativeRecordingRecord(result.filePath, startedAt, width, height);
  } finally {
    closeRecordingOverlay(overlay);
  }
}

async function runRecordingOverlay(settings: AppSettings, mode: RecordingMode): Promise<RecordingPayload | null> {
  const display = getCursorDisplay();
  const sourceId = await desktopSourceIdForDisplay(display);
  const windowRegion = mode === "region" ? await detectCursorWindowRegion(display) : null;
  const localWindowRegion = windowRegion
    ? {
        x: Math.max(0, windowRegion.x - display.bounds.x),
        y: Math.max(0, windowRegion.y - display.bounds.y),
        width: Math.max(0, windowRegion.width),
        height: Math.max(0, windowRegion.height)
      }
    : null;
  return new Promise((resolve) => {
    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      show: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      focusable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: mt().dialog.recordingTitle,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });
    activeRecordingOverlay = overlay;
    let resolved = false;

    const finish = (payload: RecordingPayload | null) => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener("recording-complete", onComplete);
      ipcMain.removeListener("recording-cancel", onCancel);
      ipcMain.removeListener("recording-error", onError);
      ipcMain.removeListener("recording-ignore-mouse", onIgnoreMouse);
      ipcMain.removeListener("overlay:ready", onReady);
      if (!overlay.isDestroyed()) {
        overlay.setIgnoreMouseEvents(false);
      }
      if (!overlay.isDestroyed()) overlay.close();
      if (activeRecordingOverlay === overlay) activeRecordingOverlay = null;
      resolve(payload);
    };

    const showOverlay = () => {
      if (overlay.isDestroyed()) return;
      overlay.showInactive();
      overlay.moveTop();
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.focus();
    };

    const onComplete = (_event: Electron.IpcMainEvent, payload: RecordingPayload) => finish(payload);
    const onCancel = () => finish(null);
    const onError = (_event: Electron.IpcMainEvent, message: string) => {
      console.warn(`Recording overlay error: ${message}`);
      finish(null);
    };
    const onIgnoreMouse = (event: Electron.IpcMainEvent, ignore: boolean) => {
      if (event.sender.id !== overlay.webContents.id || overlay.isDestroyed()) return;
      overlay.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    };
    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender.id === overlay.webContents.id) {
        showOverlay();
      }
    };

    overlay.setMenu(null);
    overlay.setMenuBarVisibility(false);
    overlay.setContentProtection(true);
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.once("ready-to-show", showOverlay);
    overlay.webContents.once("did-finish-load", showOverlay);
    overlay.on("closed", () => finish(null));

    ipcMain.once("recording-complete", onComplete);
    ipcMain.once("recording-cancel", onCancel);
    ipcMain.once("recording-error", onError);
    ipcMain.on("recording-ignore-mouse", onIgnoreMouse);
    ipcMain.on("overlay:ready", onReady);

    void overlay.loadFile(recorderHtmlPath(), {
      query: {
        sourceId,
        scaleFactor: String(display.scaleFactor || 1),
        offsetX: String(display.bounds.x),
        offsetY: String(display.bounds.y),
        displayWidth: String(display.bounds.width),
        displayHeight: String(display.bounds.height),
        displayPixelWidth: String(Math.round(display.size.width * (display.scaleFactor || 1))),
        displayPixelHeight: String(Math.round(display.size.height * (display.scaleFactor || 1))),
        fps: String(settings.recordingFps),
        bitsPerSecond: String(recordingVideoBitsPerSecond(settings)),
        mic: String(settings.recordingMic),
        countdown: String(settings.recordingCountdown),
        mode,
        windowX: String(localWindowRegion?.x ?? ""),
        windowY: String(localWindowRegion?.y ?? ""),
        windowWidth: String(localWindowRegion?.width ?? ""),
        windowHeight: String(localWindowRegion?.height ?? ""),
        showCursor: String(settings.recordingShowCursor),
        clickHighlight: String(settings.recordingClickHighlight),
        language: settings.language
      }
    });
  });
}

async function saveRecordingPayload(payload: RecordingPayload, settings: AppSettings): Promise<RecordingRecord> {
  const now = new Date();
  let buffer: Buffer;
  if (payload.dataBuffer) {
    if (Buffer.isBuffer(payload.dataBuffer)) {
      buffer = payload.dataBuffer;
    } else if (payload.dataBuffer instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(payload.dataBuffer));
    } else {
      buffer = Buffer.from(payload.dataBuffer);
    }
  } else if (payload.dataUrl) {
    const commaIndex = payload.dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error("无效的录屏数据。");
    }
    buffer = Buffer.from(payload.dataUrl.slice(commaIndex + 1), "base64");
  } else {
    throw new Error("无效的录屏数据。");
  }
  if (buffer.byteLength < 1024) {
    throw new Error("录屏数据为空，请稍后重试。");
  }
  const format: RecordingFormat = "mp4";
  const filePath = await buildRecordingFilePath(now, format);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const sourcePath = path.join(tempCaptureDir, `recording-${crypto.randomUUID()}.webm`);
  await fs.mkdir(tempCaptureDir, { recursive: true });
  await fs.writeFile(sourcePath, buffer);
  try {
    await transcodeRecordingToMp4(sourcePath, filePath, settings, payload);
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined);
    throw error;
  } finally {
    await fs.unlink(sourcePath).catch(() => undefined);
  }

  const record: RecordingRecord = {
    id: crypto.randomUUID(),
    filePath,
    createdAt: now.toISOString(),
    durationMs: Math.max(0, Math.round(payload.durationMs)),
    width: Math.max(1, Math.round(payload.width)),
    height: Math.max(1, Math.round(payload.height)),
    format
  };

  const records = await readRecordingHistory();
  await writeRecordingHistory([record, ...records].slice(0, 200));
  mainWindow?.webContents.send("app:recording-created", record);
  mainWindow?.webContents.send("app:status", mt().status.recordingSaved(filePath));
  return record;
}

async function recordSelectedRegion(settings: AppSettings, mode: RecordingMode = "region"): Promise<RecordingRecord | null> {
  await ensureStorage();
  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  mainWindow?.hide();
  await delay(32);

  try {
    mainWindow?.webContents.send("app:status", mode === "screen" ? mt().status.recordingPreparing : mt().status.recordingSelect);
    if (process.platform === "win32" && fsSync.existsSync(recorderHostPath())) {
      const nativeResult = await recordSelectedRegionNative(settings, mode);
      if (!nativeResult) mainWindow?.webContents.send("app:status", mt().status.recordingCanceled);
      return nativeResult;
    }

    const result = await runRecordingOverlay(settings, mode);
    if (!result) {
      mainWindow?.webContents.send("app:status", mt().status.recordingCanceled);
      return null;
    }
    return saveRecordingPayload(result, settings);
  } catch (error) {
    console.error("Recording failed.", error);
    mainWindow?.webContents.send("app:status", mt().status.recordingFailed);
    return null;
  } finally {
    if (shouldRestoreWindow) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  }
}

async function pinLatestScreenshot() {
  const history = await readHistory();
  const latest = history[0];
  if (!latest) {
    mainWindow?.webContents.send("app:status", mt().status.noPinSource);
    return;
  }
  await createPinWindow(latest.filePath);
}

async function createPinWindow(filePath: string) {
  if (!fsSync.existsSync(filePath)) {
    mainWindow?.webContents.send("app:status", mt().status.pinMissing);
    return;
  }

  const metadata = await sharp(filePath).metadata();
  const imageWidth = metadata.width ?? 420;
  const imageHeight = metadata.height ?? 260;
  const cursorPoint = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = targetDisplay.workArea;
  const maxWidth = Math.min(720, Math.round(workArea.width * 0.56));
  const maxHeight = Math.min(520, Math.round(workArea.height * 0.56));
  const ratio = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
  const width = Math.max(180, Math.round(imageWidth * ratio));
  const height = Math.max(120, Math.round(imageHeight * ratio));
  const offset = Math.min(pinWindows.length * 26, 156);
  const x = Math.round(Math.min(Math.max(cursorPoint.x + 24 + offset, workArea.x), workArea.x + workArea.width - width));
  const y = Math.round(Math.min(Math.max(cursorPoint.y + 24 + offset, workArea.y), workArea.y + workArea.height - height));

  const pinWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 120,
    minHeight: 80,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    title: `${APP_NAME} ${mt().dialog.pinTitle}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  pinWindow.setAlwaysOnTop(true, "screen-saver");
  pinWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pinWindow.setAspectRatio(imageWidth / imageHeight);
  pinWindows.push(pinWindow);
  const pinWebContentsId = pinWindow.webContents.id;
  pinWindowStates.set(pinWebContentsId, {
    filePath,
    naturalWidth: imageWidth,
    naturalHeight: imageHeight,
    initialWidth: width,
    initialHeight: height,
    locked: false,
    clickThrough: false,
    toolbarInteractive: false,
    topLevel: "screen",
    opacity: 1
  });
  pinWindow.on("closed", () => {
    pinWindows = pinWindows.filter((item) => item !== pinWindow);
    pinWindowStates.delete(pinWebContentsId);
  });

  await pinWindow.loadFile(pinViewerHtmlPath());
  if (pinWindow.isDestroyed()) {
    return;
  }
  pinWindow.webContents.send("pin:init", {
    filePath,
    fileUrl: pathToFileURL(filePath).toString(),
    title: path.basename(filePath)
  });
  sendPinState(pinWindow);
  if (!pinsVisible && !pinWindow.isDestroyed()) {
    pinWindow.hide();
  }
  mainWindow?.webContents.send("app:status", mt().status.pinned);
}

function togglePinWindows() {
  pinsVisible = !pinsVisible;
  for (const pinWindow of pinWindows) {
    if (pinWindow.isDestroyed()) {
      continue;
    }
    if (pinsVisible) {
      pinWindow.show();
    } else {
      pinWindow.hide();
    }
  }
  mainWindow?.webContents.send("app:status", pinsVisible ? mt().status.pinsShown : mt().status.pinsHidden);
}

function pinWindowFromEvent(event: Electron.IpcMainEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function pinFilePathFromEvent(event: Electron.IpcMainEvent, filePath?: string) {
  const state = pinWindowStates.get(event.sender.id);
  return filePath || state?.filePath;
}

function sendPinState(pinWindow: BrowserWindow | null | undefined) {
  if (!pinWindow || pinWindow.isDestroyed()) return;
  const state = pinWindowStates.get(pinWindow.webContents.id);
  if (!state) return;
  pinWindow.webContents.send("pin:state", {
    locked: state.locked,
    clickThrough: state.clickThrough,
    topLevel: state.topLevel,
    opacity: state.opacity
  });
}

function applyPinTopLevel(pinWindow: BrowserWindow, topLevel: PinWindowState["topLevel"]) {
  if (topLevel === "normal") {
    pinWindow.setAlwaysOnTop(false);
    return;
  }
  pinWindow.setAlwaysOnTop(true, topLevel === "screen" ? "screen-saver" : "floating");
}

function applyPinClickThrough(pinWindow: BrowserWindow, state: PinWindowState) {
  pinWindow.setIgnoreMouseEvents(state.clickThrough && !state.toolbarInteractive, { forward: true });
}

function resizePinWindow(pinWindow: BrowserWindow, ratio: number) {
  if (pinWindow.isDestroyed() || !Number.isFinite(ratio)) return;
  const state = pinWindowStates.get(pinWindow.webContents.id);
  if (state?.locked) {
    mainWindow?.webContents.send("app:status", mt().status.pinLockedResize);
    return;
  }
  const bounds = pinWindow.getBounds();
  const nextWidth = Math.max(120, Math.round(bounds.width * ratio));
  const nextHeight = Math.max(80, Math.round(bounds.height * ratio));
  pinWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - nextWidth) / 2),
    y: Math.round(bounds.y + (bounds.height - nextHeight) / 2),
    width: nextWidth,
    height: nextHeight
  });
}

async function savePinnedImageAs(sourcePath: string, owner?: BrowserWindow | null) {
  if (!fsSync.existsSync(sourcePath)) {
    mainWindow?.webContents.send("app:status", mt().status.pinMissing);
    return;
  }
  const parsed = path.parse(sourcePath);
  const result = owner && !owner.isDestroyed()
    ? await dialog.showSaveDialog(owner, {
        title: mt().dialog.savePin,
        defaultPath: path.join(app.getPath("pictures"), `${parsed.name}${parsed.ext}`),
        filters: [{ name: mt().dialog.imageFilter, extensions: [parsed.ext.replace(".", "") || "png"] }]
      })
    : await dialog.showSaveDialog({
        title: mt().dialog.savePin,
        defaultPath: path.join(app.getPath("pictures"), `${parsed.name}${parsed.ext}`),
        filters: [{ name: mt().dialog.imageFilter, extensions: [parsed.ext.replace(".", "") || "png"] }]
      });
  if (result.canceled || !result.filePath) return;
  if (path.resolve(result.filePath) !== path.resolve(sourcePath)) {
    await fs.copyFile(sourcePath, result.filePath);
  }
  mainWindow?.webContents.send("app:status", mt().status.pinSaved);
}

function registerPinWindowIpc() {
  ipcMain.on("pin:copy", (event, filePath?: string) => {
    const targetPath = pinFilePathFromEvent(event, filePath);
    if (targetPath && fsSync.existsSync(targetPath)) {
      clipboard.writeImage(nativeImage.createFromPath(targetPath));
      mainWindow?.webContents.send("app:status", mt().status.pinCopied);
    }
  });

  ipcMain.on("pin:open", (event, filePath?: string) => {
    const targetPath = pinFilePathFromEvent(event, filePath);
    if (targetPath && fsSync.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
    }
  });

  ipcMain.on("pin:resize", (event, ratio: number) => {
    const pinWindow = pinWindowFromEvent(event);
    if (!pinWindow) return;
    resizePinWindow(pinWindow, ratio);
  });

  ipcMain.on("pin:drag-start", (event, pointer: { x: number; y: number }) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state || state.locked) return;
    state.dragStart = {
      pointer,
      bounds: pinWindow.getBounds()
    };
  });

  ipcMain.on("pin:drag-move", (event, pointer: { x: number; y: number }) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state?.dragStart || state.locked) return;
    const dx = Math.round(pointer.x - state.dragStart.pointer.x);
    const dy = Math.round(pointer.y - state.dragStart.pointer.y);
    pinWindow.setBounds({
      ...state.dragStart.bounds,
      x: state.dragStart.bounds.x + dx,
      y: state.dragStart.bounds.y + dy
    });
  });

  ipcMain.on("pin:drag-end", (event) => {
    const state = pinWindowStates.get(event.sender.id);
    if (state) state.dragStart = undefined;
  });

  ipcMain.on("pin:reset-size", (event) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindowStates.get(event.sender.id);
    if (!pinWindow || pinWindow.isDestroyed() || !state) return;
    if (state.locked) {
      mainWindow?.webContents.send("app:status", mt().status.pinLockedReset);
      return;
    }
    const bounds = pinWindow.getBounds();
    pinWindow.setBounds({ ...bounds, width: state.initialWidth, height: state.initialHeight });
  });

  ipcMain.on("pin:opacity", (event, opacity: number) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state || !Number.isFinite(opacity)) return;
    state.opacity = Math.max(0.35, Math.min(1, opacity));
    pinWindow.setOpacity(state.opacity);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:opacity-step", (event, step: number) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state || !Number.isFinite(step)) return;
    state.opacity = Math.max(0.35, Math.min(1, state.opacity + step));
    pinWindow.setOpacity(state.opacity);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:lock", (event, locked: boolean) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state) return;
    state.locked = Boolean(locked);
    pinWindow.setResizable(!state.locked);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:top-level", (event, topLevel: PinWindowState["topLevel"]) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state) return;
    state.topLevel = topLevel === "normal" || topLevel === "floating" ? topLevel : "screen";
    applyPinTopLevel(pinWindow, state.topLevel);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:click-through", (event, enabled: boolean) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state) return;
    state.clickThrough = Boolean(enabled);
    state.toolbarInteractive = false;
    applyPinClickThrough(pinWindow, state);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:toolbar-interactive", (event, interactive: boolean) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed() || !state || !state.clickThrough) return;
    state.toolbarInteractive = Boolean(interactive);
    applyPinClickThrough(pinWindow, state);
    sendPinState(pinWindow);
  });

  ipcMain.on("pin:save-as", async (event, filePath?: string) => {
    const targetPath = pinFilePathFromEvent(event, filePath);
    if (targetPath) {
      await savePinnedImageAs(targetPath, pinWindowFromEvent(event));
    }
  });

  ipcMain.on("pin:destroy", (event) => {
    const pinWindow = pinWindowFromEvent(event);
    if (pinWindow && !pinWindow.isDestroyed()) {
      pinWindow.destroy();
    }
  });

  ipcMain.on("pin:context-menu", (event, filePath?: string) => {
    const pinWindow = pinWindowFromEvent(event);
    const targetPath = pinFilePathFromEvent(event, filePath);
    const state = pinWindow ? pinWindowStates.get(pinWindow.webContents.id) : undefined;
    if (!pinWindow || pinWindow.isDestroyed()) return;
    Menu.buildFromTemplate([
      {
        label: state?.locked ? mt().pinMenu.unlock : mt().pinMenu.lock,
        click: () => {
          if (!state || pinWindow.isDestroyed()) return;
          state.locked = !state.locked;
          pinWindow.setResizable(!state.locked);
          sendPinState(pinWindow);
        }
      },
      {
        label: mt().pinMenu.topLevel,
        submenu: [
          {
            label: mt().pinMenu.normal,
            type: "radio",
            checked: state?.topLevel === "normal",
            click: () => {
              if (!state || pinWindow.isDestroyed()) return;
              state.topLevel = "normal";
              applyPinTopLevel(pinWindow, state.topLevel);
              sendPinState(pinWindow);
            }
          },
          {
            label: mt().pinMenu.floating,
            type: "radio",
            checked: state?.topLevel === "floating",
            click: () => {
              if (!state || pinWindow.isDestroyed()) return;
              state.topLevel = "floating";
              applyPinTopLevel(pinWindow, state.topLevel);
              sendPinState(pinWindow);
            }
          },
          {
            label: mt().pinMenu.screen,
            type: "radio",
            checked: !state || state.topLevel === "screen",
            click: () => {
              if (!state || pinWindow.isDestroyed()) return;
              state.topLevel = "screen";
              applyPinTopLevel(pinWindow, state.topLevel);
              sendPinState(pinWindow);
            }
          }
        ]
      },
      {
        label: mt().pinMenu.opacity,
        submenu: [100, 85, 70, 55, 40].map((value) => ({
          label: `${value}%`,
          type: "radio",
          checked: Math.round((state?.opacity ?? 1) * 100) === value,
          click: () => {
            if (!state || pinWindow.isDestroyed()) return;
            state.opacity = value / 100;
            pinWindow.setOpacity(state.opacity);
            sendPinState(pinWindow);
          }
        }))
      },
      {
        label: state?.clickThrough ? mt().pinMenu.disableClickThrough : mt().pinMenu.enableClickThrough,
        click: () => {
          if (!state || pinWindow.isDestroyed()) return;
          state.clickThrough = !state.clickThrough;
          state.toolbarInteractive = false;
          applyPinClickThrough(pinWindow, state);
          sendPinState(pinWindow);
        }
      },
      { type: "separator" },
      {
        label: mt().pinMenu.saveImage,
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath) void savePinnedImageAs(targetPath, pinWindow);
        }
      },
      {
        label: mt().pinMenu.copyImage,
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath && fsSync.existsSync(targetPath)) {
            clipboard.writeImage(nativeImage.createFromPath(targetPath));
            mainWindow?.webContents.send("app:status", mt().status.pinCopied);
          }
        }
      },
      {
        label: mt().pinMenu.openFolder,
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath && fsSync.existsSync(targetPath)) shell.showItemInFolder(targetPath);
        }
      },
      { type: "separator" },
      {
        label: mt().pinMenu.destroy,
        click: () => {
          if (!pinWindow.isDestroyed()) pinWindow.destroy();
        }
      }
    ]).popup({ window: pinWindow });
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const protocolUrl = argv.find((argument) => argument.toLowerCase().startsWith(`${APP_PROTOCOL}://`));
  handleProtocolUrl(protocolUrl);
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }
  await readSettings();
  syncLoginItemSettings();
  await ensureStorage();
  registerProtocolHandler();
  createWindow();
  await createTray();
  registerGlobalShortcuts();
  startHotkeyGuard();
  registerPinWindowIpc();
  ipcMain.on("recording-native-command", (event, command: string) => {
    if (activeRecordingOverlay?.webContents.id !== event.sender.id) return;
    if (!["pause", "resume", "stop", "cancel"].includes(command)) return;
    if (activeNativeRecorderProcess?.stdin?.writable) {
      activeNativeRecorderProcess.stdin.write(`${command}\n`);
    } else if (activeRecordingUsesNative && (command === "stop" || command === "cancel")) {
      pendingNativeRecorderCommand = command;
    }
  });
  setupAutoUpdater();
  setTimeout(() => {
    void checkForAppUpdates(false);
  }, 2500);
  const initialProtocolUrl = process.argv.find((argument) => argument.toLowerCase().startsWith(`${APP_PROTOCOL}://`));
  if (initialProtocolUrl) {
    handleProtocolUrl(initialProtocolUrl);
  }

  ipcMain.handle("app:get-history", async () => readHistory());
  ipcMain.handle("app:get-recording-history", async () => readRecordingHistory());
  ipcMain.handle("app:get-settings", async () => readSettings());
  ipcMain.handle("app:get-version", async () => app.getVersion());
  ipcMain.handle("app:check-for-updates", async () => checkForAppUpdates(true));
  ipcMain.handle("app:install-update", async () => installDownloadedUpdate());
  ipcMain.handle("app:update-settings", async (_event, settings: AppSettings) => {
    await writeSettings(settings);
    mainWindow?.webContents.send("app:settings-updated", appSettings);
    return appSettings;
  });
  ipcMain.handle("app:capture-fullscreen", async (_event, options: CaptureOptions, copyAfterCapture?: boolean) =>
    capturePrimaryScreen(options, Boolean(copyAfterCapture) || appSettings.autoCopy)
  );
  ipcMain.handle("app:capture-region", async (_event, options: CaptureOptions, copyAfterCapture?: boolean) =>
    captureSelectedRegion(options, Boolean(copyAfterCapture) || appSettings.autoCopy)
  );
  ipcMain.handle("app:capture-scroll", async (_event, options: CaptureOptions, copyAfterCapture?: boolean) =>
    captureScrollingRegion(options, Boolean(copyAfterCapture) || appSettings.autoCopy)
  );
  ipcMain.handle("app:record-region", async (_event, settings: AppSettings, mode: RecordingMode = "region") =>
    startRegionRecording(settings, mode)
  );
  ipcMain.handle("app:pin-latest", async () => pinLatestScreenshot());
  ipcMain.handle("app:toggle-pins", async () => togglePinWindows());
  ipcMain.handle("app:minimize-preferences", async () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("app:close-preferences", async () => {
    mainWindow?.hide();
  });
  ipcMain.handle("app:restart-as-admin", async () => restartAsAdmin());
  ipcMain.handle("app:set-capture-options", async (_event, options: CaptureOptions) => {
    await writeSettings({ ...appSettings, ...options });
  });
  ipcMain.handle("app:clear-history", async () => {
    await writeHistory([]);
  });
  ipcMain.handle("app:choose-screenshot-dir", async () => {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: mt().dialog.chooseScreenshotDir,
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) {
      return appSettings;
    }
    await writeSettings({ ...appSettings, screenshotDir: result.filePaths[0] });
    mainWindow?.webContents.send("app:settings-updated", appSettings);
    return appSettings;
  });
  ipcMain.handle("app:open-in-folder", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle("app:open-path", async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
  });
  ipcMain.handle("app:open-recording-folder", async () => {
    await fs.mkdir(recordingDir(), { recursive: true });
    await shell.openPath(recordingDir());
  });
  ipcMain.handle("app:copy-image", async (_event, filePath: string) => {
    clipboard.writeImage(nativeImage.createFromPath(filePath));
  });
  ipcMain.handle("app:copy-data-url", async (_event, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  });
  ipcMain.handle("app:get-storage-paths", async () => ({ rootDir, dataDir, screenshotDir: appSettings.screenshotDir, backupDir }));
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("will-quit", () => {
  stopHotkeyGuard();
  globalShortcut.unregisterAll();
  resetOcrWorker();
});
