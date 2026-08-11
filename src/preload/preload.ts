import { contextBridge, ipcRenderer } from "electron";

type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-bar";

type CaptureOptions = {
  location: string;
  project: string;
  note: string;
  watermarkEnabled: boolean;
  watermarkPosition: WatermarkPosition;
};

contextBridge.exposeInMainWorld("screenshotApp", {
  getHistory: () => ipcRenderer.invoke("app:get-history"),
  getSettings: () => ipcRenderer.invoke("app:get-settings"),
  updateSettings: (settings: unknown) => ipcRenderer.invoke("app:update-settings", settings),
  chooseScreenshotDir: () => ipcRenderer.invoke("app:choose-screenshot-dir"),
  captureFullscreen: (options: CaptureOptions, copyAfterCapture?: boolean) =>
    ipcRenderer.invoke("app:capture-fullscreen", options, copyAfterCapture),
  captureRegion: (options: CaptureOptions, copyAfterCapture?: boolean) =>
    ipcRenderer.invoke("app:capture-region", options, copyAfterCapture),
  pinLatest: () => ipcRenderer.invoke("app:pin-latest"),
  togglePins: () => ipcRenderer.invoke("app:toggle-pins"),
  minimizePreferences: () => ipcRenderer.invoke("app:minimize-preferences"),
  closePreferences: () => ipcRenderer.invoke("app:close-preferences"),
  restartAsAdmin: () => ipcRenderer.invoke("app:restart-as-admin"),
  setCaptureOptions: (options: CaptureOptions) => ipcRenderer.invoke("app:set-capture-options", options),
  clearHistory: () => ipcRenderer.invoke("app:clear-history"),
  openInFolder: (filePath: string) => ipcRenderer.invoke("app:open-in-folder", filePath),
  openPath: (targetPath: string) => ipcRenderer.invoke("app:open-path", targetPath),
  copyImage: (filePath: string) => ipcRenderer.invoke("app:copy-image", filePath),
  getStoragePaths: () => ipcRenderer.invoke("app:get-storage-paths"),
  onOpenPreferences: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-preferences", listener);
    return () => ipcRenderer.removeListener("app:open-preferences", listener);
  },
  onCaptureCreated: (callback: (record: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, record: unknown) => callback(record);
    ipcRenderer.on("app:capture-created", listener);
    return () => ipcRenderer.removeListener("app:capture-created", listener);
  },
  onHistoryCleared: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:history-cleared", listener);
    return () => ipcRenderer.removeListener("app:history-cleared", listener);
  },
  onSettingsUpdated: (callback: (settings: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: unknown) => callback(settings);
    ipcRenderer.on("app:settings-updated", listener);
    return () => ipcRenderer.removeListener("app:settings-updated", listener);
  },
  onStatus: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("app:status", listener);
    return () => ipcRenderer.removeListener("app:status", listener);
  }
});
