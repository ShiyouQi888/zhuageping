import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const APP_NAME = "抓个屏";
const APP_PROTOCOL = "zhuageping";
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

type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-bar";

type CaptureOptions = {
  location: string;
  project: string;
  note: string;
  watermarkEnabled: boolean;
  watermarkPosition: WatermarkPosition;
};

type OutputFormat = "png" | "jpg";

type AppSettings = CaptureOptions & {
  launchAtStartup: boolean;
  runAsAdmin: boolean;
  autoBackup: boolean;
  keepResponsive: boolean;
  trayMenu: boolean;
  autoCopy: boolean;
  autoPinAfterCapture: boolean;
  outputFormat: OutputFormat;
  language: "zh-CN" | "en-US";
  logLevel: "normal" | "verbose" | "silent";
  screenshotDir: string;
  shortcutCapture: string;
  shortcutCaptureCopy: string;
  shortcutArea: string;
  shortcutPin: string;
  shortcutTogglePins: string;
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

type PrivacyRegion = CaptureRegion & {
  strength?: number;
};

type InlineCapturePayload = {
  region: CaptureRegion;
  annotationDataUrl: string;
  privacyDataUrl?: string | null;
  mosaicRegions: PrivacyRegion[];
  blurRegions: PrivacyRegion[];
};

type InlineCaptureResult = {
  buffer: Buffer;
  action: "save" | "copy" | "pin";
};

type DisplayLike = Pick<Electron.Display, "bounds" | "size" | "scaleFactor" | "id">;

type PinWindowState = {
  filePath: string;
  naturalWidth: number;
  naturalHeight: number;
  initialWidth: number;
  initialHeight: number;
  locked: boolean;
  clickThrough: boolean;
  topLevel: "normal" | "floating" | "screen";
  opacity: number;
};

const rootDir = app.isPackaged ? path.join(appRuntimeDir, "local") : path.resolve(app.getPath("userData"), "..", "jietu-shiyou-2026-local");
const dataDir = path.join(rootDir, "data");
const defaultScreenshotDir = path.join(rootDir, "screenshots");
const backupDir = path.join(rootDir, "backups");
const historyPath = path.join(dataDir, "history.json");
const settingsPath = path.join(dataDir, "settings.json");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pinWindows: BrowserWindow[] = [];
let pinWindowStates = new Map<number, PinWindowState>();
let pinsVisible = true;
let shortcutCaptureRunning = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let appSettings: AppSettings = {
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
  logLevel: "normal",
  screenshotDir: defaultScreenshotDir,
  shortcutCapture: "F1",
  shortcutCaptureCopy: "CommandOrControl+F1",
  shortcutArea: "Shift+F1",
  shortcutPin: "F3",
  shortcutTogglePins: "Shift+F3"
};

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 468,
    height: 476,
    minWidth: 468,
    minHeight: 476,
    maxWidth: 520,
    maxHeight: 600,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    title: `${APP_NAME} 首选项`,
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
    if (input.key === "F1") {
      event.preventDefault();
      runShortcutCapture(Boolean(input.control || input.meta) || appSettings.autoCopy);
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

  if (command === "pin") {
    void pinLatestScreenshot();
    return;
  }

  showPreferencesWindow();
  mainWindow?.webContents.send("app:status", `已通过 ${APP_PROTOCOL}:// 唤起`);
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
      label: "区域截图",
      accelerator: appSettings.shortcutCapture,
      click: () => {
        void capturePrimaryScreen(appSettings, appSettings.autoCopy);
      }
    },
    {
      label: "区域截图并自动复制",
      accelerator: appSettings.shortcutCaptureCopy,
      click: async () => {
        await capturePrimaryScreen(appSettings, true);
      }
    }
  ];

  const extendedItems: Electron.MenuItemConstructorOptions[] = appSettings.trayMenu
    ? [
        {
          label: "自定义截屏",
          accelerator: appSettings.shortcutArea,
          click: () => {
            void captureSelectedRegion(appSettings, appSettings.autoCopy);
          }
        },
        { type: "separator" },
        {
          label: "贴最近截图",
          accelerator: appSettings.shortcutPin,
          click: () => {
            void pinLatestScreenshot();
          }
        },
        {
          label: "隐藏/显示所有贴图",
          accelerator: appSettings.shortcutTogglePins,
          click: () => togglePinWindows()
        },
        { label: "切换到另一贴图组", accelerator: "Ctrl+F3", enabled: false },
        { type: "separator" },
        {
          label: "清空截屏历史",
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
        label: "首选项...",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send("app:open-preferences");
        }
      },
      { label: "帮助", enabled: false },
      { type: "separator" },
      {
        label: "重新启动",
        click: () => {
          isQuitting = true;
          app.relaunch();
          app.exit(0);
        }
      },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

async function ensureStorage() {
  await fs.mkdir(appRuntimeDir, { recursive: true });
  await fs.mkdir(appProfileDir, { recursive: true });
  await fs.mkdir(tempCaptureDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });

  try {
    await fs.access(historyPath);
  } catch {
    await fs.writeFile(historyPath, "[]", "utf8");
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
    appSettings = {
      ...appSettings,
      ...stored,
      screenshotDir: stored.screenshotDir || defaultScreenshotDir
    };
    await fs.writeFile(settingsPath, JSON.stringify(appSettings, null, 2), "utf8");
  } catch {
    await writeSettings(appSettings);
  }
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  return appSettings;
}

async function writeSettings(settings: AppSettings) {
  appSettings = settings;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(appSettings.screenshotDir, { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(appSettings, null, 2), "utf8");
  syncLoginItemSettings();
  registerGlobalShortcuts();
  updateTrayMenu();
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

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const registrations: Array<[string, () => void]> = [
    [appSettings.shortcutCapture, () => runShortcutCapture(appSettings.autoCopy)],
    [appSettings.shortcutCaptureCopy, () => runShortcutCapture(true)],
    [appSettings.shortcutArea, () => runShortcutCapture(appSettings.autoCopy)],
    [appSettings.shortcutPin, () => void pinLatestScreenshot()],
    [appSettings.shortcutTogglePins, () => togglePinWindows()]
  ];

  for (const [accelerator, handler] of registrations) {
    if (accelerator.trim()) {
      const registered = globalShortcut.register(accelerator, handler);
      if (!registered) {
        console.warn(`Global shortcut registration failed: ${accelerator}`);
        mainWindow?.webContents.send("app:status", `快捷键注册失败：${accelerator}`);
      } else if (!app.isPackaged) {
        console.info(`Global shortcut registered: ${accelerator}`);
      }
    }
  }
}

async function backupLocalData() {
  if (!appSettings.autoBackup) {
    return;
  }

  await fs.mkdir(backupDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  await fs.copyFile(historyPath, path.join(backupDir, `history-${today}.json`));
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

async function selectAndEditRegion(): Promise<InlineCaptureResult | null> {
  return new Promise((resolve) => {
    const editorPath = overlayEditorHtmlPath();
    const displays = screen.getAllDisplays();
    const captureDisplayDataUrl = async (display: DisplayLike) => {
      const displayScaleFactor = display.scaleFactor || 1;
      const width = Math.round(display.size.width * displayScaleFactor);
      const height = Math.round(display.size.height * displayScaleFactor);
      const capturedBuffer = await captureScreenBuffer(width, height, display);
      return `data:image/png;base64,${capturedBuffer.toString("base64")}`;
    };

    const previewCache = new Map<number, Promise<string | undefined>>(
      displays.map((display) => [
        display.id,
        captureDisplayDataUrl(display).catch((error) => {
          console.warn("Inline preview prewarm failed.", error);
          return undefined;
        })
      ])
    );

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
        title: "截图",
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
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
          offsetY: String(display.bounds.y)
        }
      });
      return { display, overlay };
    });
    const overlayDisplays = new Map(overlays.map(({ display, overlay }) => [overlay.webContents.id, display]));
    let resolved = false;
    let preparingCapture = false;
    let preparingPreview = false;

    const buildCompositeBuffer = async (payload: InlineCapturePayload) => {
      overlays.forEach(({ overlay }) => {
        if (!overlay.isDestroyed()) overlay.hide();
      });
      await delay(32);

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
      const extractWidth = Math.max(1, Math.min(crop.width, imageWidth - left));
      const extractHeight = Math.max(1, Math.min(crop.height, imageHeight - top));

      let baseBuffer = await sharp(capturedBuffer)
        .extract({ left, top, width: extractWidth, height: extractHeight })
        .png()
        .toBuffer();

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
          const blurred = await sharp(baseBuffer)
            .extract(blur)
            .blur(Math.max(8, 6 + (region.strength || 5) * 4))
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
      ipcMain.removeListener("inline-capture-copy", onCopy);
      ipcMain.removeListener("inline-capture-pin", onPin);
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

    const onCancel = () => finish(null);

    const onOverlayReady = (event: Electron.IpcMainEvent) => {
      if (resolved) return;
      showActiveOverlays();
      const readyOverlay = overlays.find(({ overlay }) => !overlay.isDestroyed() && overlay.webContents.id === event.sender.id)?.overlay;
      if (readyOverlay && !readyOverlay.isDestroyed()) {
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
        backgroundDataUrl = await previewCache.get(display.id);
        if (!backgroundDataUrl) {
          backgroundDataUrl = await captureDisplayPreviewDataUrl(display);
        }
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
    ipcMain.once("inline-capture-copy", onCopy);
    ipcMain.once("inline-capture-pin", onPin);
    ipcMain.once("inline-capture-cancel", onCancel);
    ipcMain.on("inline-region-selected", onRegionSelected);
    ipcMain.on("overlay:ready", onOverlayReady);
    overlays.forEach(({ overlay }) => {
      overlay.on("closed", () => finish(null));
    });
    showActiveOverlays();
  });
}

async function saveCapturedBuffer(
  capturedBuffer: Buffer,
  options: CaptureOptions,
  copyAfterCapture = false,
  forcePin = false
): Promise<ScreenshotRecord> {
  const metadata = await sharp(capturedBuffer).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const extension = appSettings.outputFormat === "jpg" ? "jpg" : "png";
  const filePath = await buildScreenshotFilePath(now, extension);
  const imagePipeline = options.watermarkEnabled === false
    ? sharp(capturedBuffer)
    : sharp(capturedBuffer).composite([buildWatermarkSvg(options, timestamp, imageWidth, imageHeight)]);
  const outputBuffer =
    extension === "jpg"
      ? await imagePipeline.jpeg({ quality: 92 }).toBuffer()
      : await imagePipeline.png().toBuffer();

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
  await ensureStorage();

  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  if (mainWindow) {
    mainWindow.hide();
    await delay(32);
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
      captureResult.action === "pin"
    );
  } finally {
    if (mainWindow && shouldRestoreWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

async function captureSelectedRegion(options: CaptureOptions, copyAfterCapture = false): Promise<ScreenshotRecord | null> {
  await ensureStorage();
  const shouldRestoreWindow = Boolean(mainWindow?.isVisible());
  mainWindow?.hide();
  await delay(32);

  try {
    const captureResult = await selectAndEditRegion();
    if (!captureResult) {
      return null;
    }
    return saveCapturedBuffer(
      captureResult.buffer,
      options,
      copyAfterCapture || captureResult.action === "copy",
      captureResult.action === "pin"
    );
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
    mainWindow?.webContents.send("app:status", "暂无可贴图的截图");
    return;
  }
  await createPinWindow(latest.filePath);
}

async function createPinWindow(filePath: string) {
  if (!fsSync.existsSync(filePath)) {
    mainWindow?.webContents.send("app:status", "贴图文件不存在");
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
    title: `${APP_NAME} 贴图`,
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
  mainWindow?.webContents.send("app:status", "截图已贴到桌面");
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
  mainWindow?.webContents.send("app:status", pinsVisible ? "已显示所有贴图" : "已隐藏所有贴图");
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

function resizePinWindow(pinWindow: BrowserWindow, ratio: number) {
  if (pinWindow.isDestroyed() || !Number.isFinite(ratio)) return;
  const state = pinWindowStates.get(pinWindow.webContents.id);
  if (state?.locked) {
    mainWindow?.webContents.send("app:status", "贴图已锁定，无法缩放");
    return;
  }
  const bounds = pinWindow.getBounds();
  const nextWidth = Math.max(120, Math.min(1400, Math.round(bounds.width * ratio)));
  const nextHeight = Math.max(80, Math.min(1000, Math.round(bounds.height * ratio)));
  pinWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - nextWidth) / 2),
    y: Math.round(bounds.y + (bounds.height - nextHeight) / 2),
    width: nextWidth,
    height: nextHeight
  });
}

async function savePinnedImageAs(sourcePath: string, owner?: BrowserWindow | null) {
  if (!fsSync.existsSync(sourcePath)) {
    mainWindow?.webContents.send("app:status", "贴图文件不存在");
    return;
  }
  const parsed = path.parse(sourcePath);
  const result = owner && !owner.isDestroyed()
    ? await dialog.showSaveDialog(owner, {
        title: "保存贴图",
        defaultPath: path.join(app.getPath("pictures"), `${parsed.name}${parsed.ext}`),
        filters: [{ name: "图片", extensions: [parsed.ext.replace(".", "") || "png"] }]
      })
    : await dialog.showSaveDialog({
        title: "保存贴图",
        defaultPath: path.join(app.getPath("pictures"), `${parsed.name}${parsed.ext}`),
        filters: [{ name: "图片", extensions: [parsed.ext.replace(".", "") || "png"] }]
      });
  if (result.canceled || !result.filePath) return;
  if (path.resolve(result.filePath) !== path.resolve(sourcePath)) {
    await fs.copyFile(sourcePath, result.filePath);
  }
  mainWindow?.webContents.send("app:status", "贴图已保存");
}

function registerPinWindowIpc() {
  ipcMain.on("pin:copy", (event, filePath?: string) => {
    const targetPath = pinFilePathFromEvent(event, filePath);
    if (targetPath && fsSync.existsSync(targetPath)) {
      clipboard.writeImage(nativeImage.createFromPath(targetPath));
      mainWindow?.webContents.send("app:status", "贴图已复制");
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

  ipcMain.on("pin:reset-size", (event) => {
    const pinWindow = pinWindowFromEvent(event);
    const state = pinWindowStates.get(event.sender.id);
    if (!pinWindow || pinWindow.isDestroyed() || !state) return;
    if (state.locked) {
      mainWindow?.webContents.send("app:status", "贴图已锁定，无法重置大小");
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
    pinWindow.setIgnoreMouseEvents(state.clickThrough, { forward: true });
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
        label: state?.locked ? "解除锁定" : "锁定贴图",
        click: () => {
          if (!state || pinWindow.isDestroyed()) return;
          state.locked = !state.locked;
          pinWindow.setResizable(!state.locked);
          sendPinState(pinWindow);
        }
      },
      {
        label: "置顶级别",
        submenu: [
          {
            label: "普通窗口",
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
            label: "浮层置顶",
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
            label: "最高置顶",
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
        label: "透明度",
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
        label: state?.clickThrough ? "关闭鼠标穿透" : "开启鼠标穿透",
        click: () => {
          if (!state || pinWindow.isDestroyed()) return;
          state.clickThrough = !state.clickThrough;
          pinWindow.setIgnoreMouseEvents(state.clickThrough, { forward: true });
          sendPinState(pinWindow);
        }
      },
      { type: "separator" },
      {
        label: "保存图片...",
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath) void savePinnedImageAs(targetPath, pinWindow);
        }
      },
      {
        label: "复制图片",
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath && fsSync.existsSync(targetPath)) {
            clipboard.writeImage(nativeImage.createFromPath(targetPath));
            mainWindow?.webContents.send("app:status", "贴图已复制");
          }
        }
      },
      {
        label: "打开所在文件夹",
        enabled: Boolean(targetPath),
        click: () => {
          if (targetPath && fsSync.existsSync(targetPath)) shell.showItemInFolder(targetPath);
        }
      },
      { type: "separator" },
      {
        label: "销毁贴图",
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
  await ensureStorage();
  registerProtocolHandler();
  createWindow();
  await createTray();
  registerGlobalShortcuts();
  registerPinWindowIpc();
  const initialProtocolUrl = process.argv.find((argument) => argument.toLowerCase().startsWith(`${APP_PROTOCOL}://`));
  if (initialProtocolUrl) {
    handleProtocolUrl(initialProtocolUrl);
  }

  ipcMain.handle("app:get-history", async () => readHistory());
  ipcMain.handle("app:get-settings", async () => readSettings());
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
      title: "选择截图保存目录",
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
  globalShortcut.unregisterAll();
});
