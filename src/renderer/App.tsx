import { useEffect, useState } from "react";
import { Camera, FolderOpen, HelpCircle, Minus, Pin, RotateCcw, ScrollText, Shield, X } from "lucide-react";
import appLogoUrl from "./assets/app-logo.png";
import wechatQrUrl from "./assets/weichat-qr.svg";
import { fallbackLanguage, formatShortcutForWindows, languageOptions, messages, normalizeLanguage, tabKeys, type TabKey } from "./i18n";
import type { AppLanguage, AppSettings, ScreenshotRecord, StoragePaths, WatermarkPosition } from "./types";

const shortcutKeys: Array<keyof AppSettings> = [
  "shortcutCapture",
  "shortcutCaptureCopy",
  "shortcutArea",
  "shortcutScrollCapture",
  "shortcutPin",
  "shortcutTogglePins"
];

const watermarkValues: WatermarkPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right", "bottom-bar"];

const defaultSettings: AppSettings = {
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
  language: fallbackLanguage,
  logLevel: "normal",
  screenshotDir: "",
  shortcutCapture: "F1",
  shortcutCaptureCopy: "Ctrl+F1",
  shortcutArea: "Shift+F1",
  shortcutScrollCapture: "Ctrl+Shift+F1",
  shortcutPin: "F3",
  shortcutTogglePins: "Shift+F3"
};

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [storagePaths, setStoragePaths] = useState<StoragePaths | null>(null);
  const [history, setHistory] = useState<ScreenshotRecord[]>([]);
  const [status, setStatus] = useState<string>(messages[fallbackLanguage].status.ready);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const language = normalizeLanguage(settings.language);
  const t = messages[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    void Promise.all([
      window.screenshotApp.getStoragePaths(),
      window.screenshotApp.getHistory(),
      window.screenshotApp.getSettings()
    ]).then(([paths, records, loadedSettings]) => {
      setStoragePaths(paths);
      setHistory(records);
      setSettings({ ...loadedSettings, language: normalizeLanguage(loadedSettings.language) });
    });
  }, []);

  useEffect(() => {
    const removeOpenPreferencesListener = window.screenshotApp.onOpenPreferences(() => setStatus(t.status.preferencesOpened));
    const removeCaptureCreatedListener = window.screenshotApp.onCaptureCreated((record) => {
      setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
      setStatus(t.status.saved(record.filePath));
    });
    const removeHistoryClearedListener = window.screenshotApp.onHistoryCleared(() => {
      setHistory([]);
      setStatus(t.status.historyCleared);
    });
    const removeSettingsUpdatedListener = window.screenshotApp.onSettingsUpdated((updatedSettings) => {
      setSettings({ ...updatedSettings, language: normalizeLanguage(updatedSettings.language) });
      setStoragePaths((current) =>
        current ? { ...current, screenshotDir: updatedSettings.screenshotDir } : current
      );
      setStatus(t.status.settingsUpdated);
    });
    const removeStatusListener = window.screenshotApp.onStatus((message) => setStatus(message));

    return () => {
      removeOpenPreferencesListener();
      removeCaptureCreatedListener();
      removeHistoryClearedListener();
      removeSettingsUpdatedListener();
      removeStatusListener();
    };
  }, [t]);

  async function saveSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    const savedSettings = await window.screenshotApp.updateSettings(nextSettings);
    const savedLanguage = normalizeLanguage(savedSettings.language);
    setSettings({ ...savedSettings, language: savedLanguage });
    setStoragePaths((current) => (current ? { ...current, screenshotDir: savedSettings.screenshotDir } : current));
    setStatus(messages[savedLanguage].status.settingsSaved);
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    void saveSettings({ ...settings, [key]: value });
  }

  function toggleSetting(key: keyof AppSettings) {
    const currentValue = settings[key];
    if (typeof currentValue === "boolean") {
      void saveSettings({ ...settings, [key]: !currentValue });
    }
  }

  async function captureNow(copyAfterCapture = false) {
    setStatus(t.status.capturing);
    const record = await window.screenshotApp.captureFullscreen(settings, copyAfterCapture || settings.autoCopy);
    if (!record) {
      setStatus(t.status.captureCanceled);
      return;
    }
    setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
    setStatus(t.status.captureSavedCopied);
  }

  async function captureArea(copyAfterCapture = false) {
    setStatus(t.status.selectingRegion);
    const record = await window.screenshotApp.captureRegion(settings, copyAfterCapture || settings.autoCopy);
    if (!record) {
      setStatus(t.status.regionCanceled);
      return;
    }
    setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
    setStatus(t.status.regionSavedCopied);
  }

  async function captureScroll(copyAfterCapture = false) {
    setStatus(t.status.selectingScroll);
    const record = await window.screenshotApp.captureScroll(settings, copyAfterCapture || settings.autoCopy);
    if (!record) {
      setStatus(t.status.scrollCanceled);
      return;
    }
    setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
    setStatus(t.status.scrollSavedCopied);
  }

  async function pinLatest() {
    await window.screenshotApp.pinLatest();
    setStatus(t.status.pinned);
  }

  async function clearHistory() {
    await window.screenshotApp.clearHistory();
    setHistory([]);
    setStatus(t.status.historyCleared);
  }

  async function openPath(targetPath?: string) {
    if (!targetPath) {
      setStatus(t.status.pathMissing);
      return;
    }
    await window.screenshotApp.openPath(targetPath);
  }

  async function chooseScreenshotDir() {
    const updatedSettings = await window.screenshotApp.chooseScreenshotDir();
    setSettings({ ...updatedSettings, language: normalizeLanguage(updatedSettings.language) });
    setStoragePaths((current) => (current ? { ...current, screenshotDir: updatedSettings.screenshotDir } : current));
    setStatus(t.status.screenshotDirUpdated);
  }

  async function restoreDefaults() {
    const screenshotDir = storagePaths?.screenshotDir ?? settings.screenshotDir;
    await saveSettings({ ...defaultSettings, language, screenshotDir });
  }

  async function restartAsAdmin() {
    setStatus(t.status.restartingAsAdmin);
    await window.screenshotApp.restartAsAdmin();
  }

  return (
    <main className="prefs-window">
      <header className="titlebar">
        <div className="titlebar-brand">
          <img src={appLogoUrl} alt="" aria-hidden="true" />
          <span>{t.appName}</span>
        </div>
        <div className="titlebar-controls">
          <button type="button" aria-label={t.titlebar.minimize} onClick={() => void window.screenshotApp.minimizePreferences()}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <button className="titlebar-close" type="button" aria-label={t.titlebar.close} onClick={() => void window.screenshotApp.closePreferences()}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label={t.control.shortcutsLabel}>
        {tabKeys.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {t.tabs[tab]}
          </button>
        ))}
      </nav>

      <section className="content">
        {activeTab === "general" ? (
          <>
            <label className="field-row">
              <span>{t.general.language}</span>
              <select value={language} onChange={(event) => updateSetting("language", event.target.value as AppLanguage)}>
                {languageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="checkbox-grid">
              <label>
                <input checked={settings.launchAtStartup} onChange={() => toggleSetting("launchAtStartup")} type="checkbox" />
                {t.general.launchAtStartup}
              </label>
              <label>
                <input checked={settings.runAsAdmin} onChange={() => toggleSetting("runAsAdmin")} type="checkbox" />
                {t.general.runAsAdmin}
              </label>
              <label>
                <input checked={settings.autoBackup} onChange={() => toggleSetting("autoBackup")} type="checkbox" />
                {t.general.autoBackup}
              </label>
              <label>
                <input checked={settings.keepResponsive} onChange={() => toggleSetting("keepResponsive")} type="checkbox" />
                {t.general.keepResponsive}
              </label>
              <label>
                <input checked={settings.trayMenu} onChange={() => toggleSetting("trayMenu")} type="checkbox" />
                {t.general.trayMenu}
              </label>
            </div>
            <label className="field-row">
              <span>{t.general.logLevel}</span>
              <select value={settings.logLevel} onChange={(event) => updateSetting("logLevel", event.target.value as AppSettings["logLevel"])}>
                <option value="normal">{t.general.logLevelOptions.normal}</option>
                <option value="verbose">{t.general.logLevelOptions.verbose}</option>
                <option value="silent">{t.general.logLevelOptions.silent}</option>
              </select>
            </label>
            <fieldset>
              <legend>{t.general.configLocation}</legend>
              <label className="field-row stacked">
                <span>{t.general.path}</span>
                <input readOnly value={storagePaths?.dataDir ?? t.common.loading} />
              </label>
              <div className="button-row">
                <button onClick={() => void openPath(storagePaths?.dataDir)}>{t.common.openFolder}</button>
                <button onClick={() => void openPath(storagePaths?.dataDir)}>{t.common.open}</button>
              </div>
            </fieldset>
            <div className="button-row">
              <button onClick={() => void restartAsAdmin()}>
                <Shield size={16} aria-hidden="true" />
                {t.general.restartAsAdmin}
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "interface" ? (
          <>
            <label className="field-row">
              <span>{t.interface.windowMode}</span>
              <select defaultValue="preferences">
                <option value="preferences">{t.interface.preferencesOnly}</option>
                <option value="tray">{t.interface.trayOnly}</option>
              </select>
            </label>
            <label className="field-row">
              <span>{t.interface.theme}</span>
              <select defaultValue="system">
                <option value="system">{t.interface.systemTheme}</option>
                <option value="light">{t.interface.lightTheme}</option>
              </select>
            </label>
          </>
        ) : null}

        {activeTab === "capture" ? (
          <>
            <div className="action-grid">
              <button className="primary" onClick={() => void captureNow(false)}>
                <Camera size={16} aria-hidden="true" />
                {t.capture.regionCapture}
              </button>
              <button onClick={() => void captureNow(true)}>{t.capture.regionCaptureCopy}</button>
              <button onClick={() => void captureArea(false)}>{t.capture.regionCapture}</button>
              <button onClick={() => void captureScroll(false)}>
                <ScrollText size={16} aria-hidden="true" />
                {t.capture.scrollCapture}
              </button>
              <button onClick={() => void pinLatest()}>
                <Pin size={16} aria-hidden="true" />
                {t.capture.pin}
              </button>
            </div>
            <label className="field-row">
              <span>{t.capture.location}</span>
              <input value={settings.location} onChange={(event) => updateSetting("location", event.target.value)} />
            </label>
            <label className="field-row">
              <span>{t.capture.project}</span>
              <input value={settings.project} onChange={(event) => updateSetting("project", event.target.value)} />
            </label>
            <label className="field-row">
              <span>{t.capture.note}</span>
              <input value={settings.note} onChange={(event) => updateSetting("note", event.target.value)} placeholder={t.capture.notePlaceholder} />
            </label>
            <label className="field-row">
              <span>{t.capture.watermarkPosition}</span>
              <select
                disabled={!settings.watermarkEnabled}
                value={settings.watermarkPosition}
                onChange={(event) => updateSetting("watermarkPosition", event.target.value as WatermarkPosition)}
              >
                {watermarkValues.map((value) => (
                  <option value={value} key={value}>
                    {t.watermark[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-line">
              <input checked={settings.watermarkEnabled} onChange={() => toggleSetting("watermarkEnabled")} type="checkbox" />
              {t.capture.watermarkEnabled}
            </label>
            <label className="checkbox-line">
              <input checked={settings.autoCopy} onChange={() => toggleSetting("autoCopy")} type="checkbox" />
              {t.capture.autoCopy}
            </label>
            <label className="checkbox-line">
              <input checked={settings.autoPinAfterCapture} onChange={() => toggleSetting("autoPinAfterCapture")} type="checkbox" />
              {t.capture.autoPin}
            </label>
          </>
        ) : null}

        {activeTab === "pin" ? (
          <>
            <div className="note-box">
              <strong>{t.pin.title}</strong>
              <span>{t.pin.line1}</span>
              <span>{t.pin.line2}</span>
            </div>
            <div className="button-row">
              <button onClick={() => void pinLatest()}>
                <Pin size={16} aria-hidden="true" />
                {t.pin.pinLatest}
              </button>
              <button onClick={() => void window.screenshotApp.togglePins()}>{t.pin.togglePins}</button>
            </div>
            <label className="checkbox-line">
              <input checked={settings.autoPinAfterCapture} onChange={() => toggleSetting("autoPinAfterCapture")} type="checkbox" />
              {t.pin.autoPin}
            </label>
          </>
        ) : null}

        {activeTab === "output" ? (
          <>
            <fieldset>
              <legend>{t.output.screenshotLocation}</legend>
              <label className="field-row stacked">
                <span>{t.output.path}</span>
                <input readOnly value={settings.screenshotDir || storagePaths?.screenshotDir || t.common.loading} />
              </label>
              <div className="button-row">
                <button onClick={() => void openPath(settings.screenshotDir || storagePaths?.screenshotDir)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  {t.common.openFolder}
                </button>
                <button onClick={() => void chooseScreenshotDir()}>{t.common.change}</button>
              </div>
            </fieldset>
            <label className="field-row">
              <span>{t.output.format}</span>
              <select value={settings.outputFormat} onChange={(event) => updateSetting("outputFormat", event.target.value as AppSettings["outputFormat"])}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </label>
            <p className="subtle">{t.output.historyCount(history.length)}</p>
          </>
        ) : null}

        {activeTab === "control" ? (
          <>
            <div className="shortcut-list">
              {shortcutKeys.map((key) => (
                <div className="shortcut-item editable" key={key}>
                  <span>{t.control.shortcuts[key as keyof typeof t.control.shortcuts]}</span>
                  <input
                    value={formatShortcutForWindows(String(settings[key]))}
                    onChange={(event) => updateSetting(key, formatShortcutForWindows(event.target.value))}
                  />
                </div>
              ))}
            </div>
            <button onClick={clearHistory}>{t.control.clearHistory}</button>
          </>
        ) : null}

        {activeTab === "about" ? (
          <div className="about-box">
            <div className="about-copy">
              <div className="about-brand">
                <img className="about-logo" src={appLogoUrl} alt={t.about.logoAlt} />
                <div>
                  <strong>{t.appName}</strong>
                  <span>{t.about.subtitle}</span>
                </div>
              </div>
              <span>{t.about.author}</span>
              <span>{t.about.email}</span>
              <span>{t.about.description}</span>
              <span>{t.about.privacy}</span>
            </div>
            <button className="about-qr-trigger" type="button" aria-label={t.about.qrLabel}>
              <img className="about-qr" src={wechatQrUrl} alt={t.about.qrAlt} />
              <img className="about-qr-preview" src={wechatQrUrl} alt="" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </section>

      <footer className="footer">
        <button className="help" title={t.common.help}>
          <HelpCircle size={16} aria-hidden="true" />
        </button>
        <span>{status}</span>
        <button onClick={() => void restoreDefaults()}>
          <RotateCcw size={16} aria-hidden="true" />
          {t.common.restoreDefaults}
        </button>
      </footer>
    </main>
  );
}
