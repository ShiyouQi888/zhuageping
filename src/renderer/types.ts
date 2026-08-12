export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-bar";

export type CaptureOptions = {
  location: string;
  project: string;
  note: string;
  watermarkEnabled: boolean;
  watermarkPosition: WatermarkPosition;
};

export type OutputFormat = "png" | "jpg";
export type AppLanguage = "zh-CN" | "en-US";

export type AppSettings = CaptureOptions & {
  launchAtStartup: boolean;
  runAsAdmin: boolean;
  autoBackup: boolean;
  keepResponsive: boolean;
  trayMenu: boolean;
  autoCopy: boolean;
  autoPinAfterCapture: boolean;
  outputFormat: OutputFormat;
  language: AppLanguage;
  logLevel: "normal" | "verbose" | "silent";
  screenshotDir: string;
  shortcutCapture: string;
  shortcutCaptureCopy: string;
  shortcutArea: string;
  shortcutScrollCapture: string;
  shortcutPin: string;
  shortcutTogglePins: string;
};

export type ScreenshotRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  location: string;
  project: string;
  note: string;
  watermarkPosition: WatermarkPosition;
};

export type StoragePaths = {
  rootDir: string;
  dataDir: string;
  screenshotDir: string;
  backupDir: string;
};

declare global {
  interface Window {
    screenshotApp: {
      getHistory: () => Promise<ScreenshotRecord[]>;
      getSettings: () => Promise<AppSettings>;
      updateSettings: (settings: AppSettings) => Promise<AppSettings>;
      chooseScreenshotDir: () => Promise<AppSettings>;
      captureFullscreen: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      captureRegion: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      captureScroll: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      pinLatest: () => Promise<void>;
      togglePins: () => Promise<void>;
      minimizePreferences: () => Promise<void>;
      closePreferences: () => Promise<void>;
      restartAsAdmin: () => Promise<void>;
      setCaptureOptions: (options: CaptureOptions) => Promise<void>;
      clearHistory: () => Promise<void>;
      openInFolder: (filePath: string) => Promise<void>;
      openPath: (targetPath: string) => Promise<void>;
      copyImage: (filePath: string) => Promise<void>;
      getStoragePaths: () => Promise<StoragePaths>;
      onOpenPreferences: (callback: () => void) => () => void;
      onCaptureCreated: (callback: (record: ScreenshotRecord) => void) => () => void;
      onHistoryCleared: (callback: () => void) => () => void;
      onSettingsUpdated: (callback: (settings: AppSettings) => void) => () => void;
      onStatus: (callback: (message: string) => void) => () => void;
    };
  }
}
