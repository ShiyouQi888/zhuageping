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
export type AppTheme = "system" | "light" | "dark";
export type RecordingQuality = "standard" | "high" | "compact";
export type RecordingFormat = "mp4";

export type AppSettings = CaptureOptions & {
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

export type ScreenshotRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  location: string;
  project: string;
  note: string;
  watermarkPosition: WatermarkPosition;
};

export type RecordingRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  durationMs: number;
  width: number;
  height: number;
  format: RecordingFormat;
};

export type RecordingDisplay = {
  id: string;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
};

export type StoragePaths = {
  rootDir: string;
  dataDir: string;
  screenshotDir: string;
  backupDir: string;
};

export type AppUpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "disabled";
  message: string;
  currentVersion: string;
  latestVersion?: string;
  percent?: number;
};

declare global {
  interface Window {
    screenshotApp: {
      getHistory: () => Promise<ScreenshotRecord[]>;
      getRecordingHistory: () => Promise<RecordingRecord[]>;
      getRecordingDisplays: () => Promise<RecordingDisplay[]>;
      getSettings: () => Promise<AppSettings>;
      getVersion: () => Promise<string>;
      checkForUpdates: () => Promise<AppUpdateStatus>;
      installUpdate: () => Promise<void>;
      updateSettings: (settings: AppSettings) => Promise<AppSettings>;
      chooseScreenshotDir: () => Promise<AppSettings>;
      captureFullscreen: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      captureRegion: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      captureScroll: (options: CaptureOptions, copyAfterCapture?: boolean) => Promise<ScreenshotRecord | null>;
      recordRegion: (settings: AppSettings, mode?: "region" | "screen", displayId?: string) => Promise<RecordingRecord | null>;
      pinLatest: () => Promise<void>;
      togglePins: () => Promise<void>;
      minimizePreferences: () => Promise<void>;
      closePreferences: () => Promise<void>;
      restartAsAdmin: () => Promise<void>;
      setCaptureOptions: (options: CaptureOptions) => Promise<void>;
      clearHistory: () => Promise<void>;
      openInFolder: (filePath: string) => Promise<void>;
      openPath: (targetPath: string) => Promise<void>;
      openRecordingFolder: () => Promise<void>;
      copyImage: (filePath: string) => Promise<void>;
      getStoragePaths: () => Promise<StoragePaths>;
      onOpenPreferences: (callback: () => void) => () => void;
      onCaptureCreated: (callback: (record: ScreenshotRecord) => void) => () => void;
      onRecordingCreated: (callback: (record: RecordingRecord) => void) => () => void;
      onHistoryCleared: (callback: () => void) => () => void;
      onSettingsUpdated: (callback: (settings: AppSettings) => void) => () => void;
      onStatus: (callback: (message: string) => void) => () => void;
      onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;
    };
  }
}
