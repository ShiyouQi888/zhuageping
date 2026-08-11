import { useEffect, useState } from "react";
import { Camera, FolderOpen, HelpCircle, Minus, Pin, RotateCcw, Shield, X } from "lucide-react";
import appLogoUrl from "./assets/app-logo.png";
import wechatQrUrl from "./assets/weichat-qr.svg";
import type { AppSettings, ScreenshotRecord, StoragePaths, WatermarkPosition } from "./types";

const tabs = ["常规", "界面", "截屏", "贴图", "输出", "控制", "关于"] as const;
type Tab = (typeof tabs)[number];

const shortcutFields: Array<[keyof AppSettings, string]> = [
  ["shortcutCapture", "截屏"],
  ["shortcutCaptureCopy", "截屏并自动复制"],
  ["shortcutArea", "自定义截屏"],
  ["shortcutPin", "贴图"],
  ["shortcutTogglePins", "隐藏/显示所有贴图"]
];

const watermarkOptions: Array<{ label: string; value: WatermarkPosition }> = [
  { label: "左上", value: "top-left" },
  { label: "右上", value: "top-right" },
  { label: "左下", value: "bottom-left" },
  { label: "右下", value: "bottom-right" },
  { label: "底部横条", value: "bottom-bar" }
];

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
  language: "zh-CN",
  logLevel: "normal",
  screenshotDir: "",
  shortcutCapture: "F1",
  shortcutCaptureCopy: "CommandOrControl+F1",
  shortcutArea: "Shift+F1",
  shortcutPin: "F3",
  shortcutTogglePins: "Shift+F3"
};

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("常规");
  const [storagePaths, setStoragePaths] = useState<StoragePaths | null>(null);
  const [history, setHistory] = useState<ScreenshotRecord[]>([]);
  const [status, setStatus] = useState("准备就绪");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    void Promise.all([
      window.screenshotApp.getStoragePaths(),
      window.screenshotApp.getHistory(),
      window.screenshotApp.getSettings()
    ]).then(([paths, records, loadedSettings]) => {
      setStoragePaths(paths);
      setHistory(records);
      setSettings(loadedSettings);
    });

    const removeOpenPreferencesListener = window.screenshotApp.onOpenPreferences(() => setStatus("首选项已打开"));
    const removeCaptureCreatedListener = window.screenshotApp.onCaptureCreated((record) => {
      setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
      setStatus(`已保存：${record.filePath}`);
    });
    const removeHistoryClearedListener = window.screenshotApp.onHistoryCleared(() => {
      setHistory([]);
      setStatus("截图历史已清空");
    });
    const removeSettingsUpdatedListener = window.screenshotApp.onSettingsUpdated((updatedSettings) => {
      setSettings(updatedSettings);
      setStoragePaths((current) =>
        current ? { ...current, screenshotDir: updatedSettings.screenshotDir } : current
      );
      setStatus("设置已更新");
    });
    const removeStatusListener = window.screenshotApp.onStatus((message) => setStatus(message));

    return () => {
      removeOpenPreferencesListener();
      removeCaptureCreatedListener();
      removeHistoryClearedListener();
      removeSettingsUpdatedListener();
      removeStatusListener();
    };
  }, []);

  async function saveSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    const savedSettings = await window.screenshotApp.updateSettings(nextSettings);
    setSettings(savedSettings);
    setStoragePaths((current) => (current ? { ...current, screenshotDir: savedSettings.screenshotDir } : current));
    setStatus("设置已保存");
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
    setStatus("正在截屏...");
    const record = await window.screenshotApp.captureFullscreen(settings, copyAfterCapture || settings.autoCopy);
    if (!record) {
      setStatus("截图已取消");
      return;
    }
    setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
    setStatus("截图已保存并复制");
  }

  async function captureArea(copyAfterCapture = false) {
    setStatus("拖动选择截图区域...");
    const record = await window.screenshotApp.captureRegion(settings, copyAfterCapture || settings.autoCopy);
    if (!record) {
      setStatus("区域截图已取消");
      return;
    }
    setHistory((current) => (current.some((item) => item.id === record.id) ? current : [record, ...current]));
    setStatus("区域截图已保存并复制");
  }

  async function pinLatest() {
    await window.screenshotApp.pinLatest();
    setStatus("已执行贴图");
  }

  async function clearHistory() {
    await window.screenshotApp.clearHistory();
    setHistory([]);
    setStatus("截图历史已清空");
  }

  async function openPath(targetPath?: string) {
    if (!targetPath) {
      setStatus("路径还没有准备好");
      return;
    }
    await window.screenshotApp.openPath(targetPath);
  }

  async function chooseScreenshotDir() {
    const updatedSettings = await window.screenshotApp.chooseScreenshotDir();
    setSettings(updatedSettings);
    setStoragePaths((current) => (current ? { ...current, screenshotDir: updatedSettings.screenshotDir } : current));
    setStatus("截图保存目录已更新");
  }

  async function restoreDefaults() {
    const screenshotDir = storagePaths?.screenshotDir ?? settings.screenshotDir;
    await saveSettings({ ...defaultSettings, screenshotDir });
  }

  async function restartAsAdmin() {
    setStatus("正在请求管理员权限重启...");
    await window.screenshotApp.restartAsAdmin();
  }

  return (
    <main className="prefs-window">
      <header className="titlebar">
        <div className="titlebar-brand">
          <img src={appLogoUrl} alt="" aria-hidden="true" />
          <span>抓个屏</span>
        </div>
        <div className="titlebar-controls">
          <button type="button" aria-label="最小化" onClick={() => void window.screenshotApp.minimizePreferences()}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <button className="titlebar-close" type="button" aria-label="关闭" onClick={() => void window.screenshotApp.closePreferences()}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="首选项分类">
        {tabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      <section className="content">
        {activeTab === "常规" ? (
          <>
            <label className="field-row">
              <span>显示语言:</span>
              <select value={settings.language} onChange={(event) => updateSetting("language", event.target.value as AppSettings["language"])}>
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </label>
            <div className="checkbox-grid">
              <label>
                <input checked={settings.launchAtStartup} onChange={() => toggleSetting("launchAtStartup")} type="checkbox" />
                开机启动
              </label>
              <label>
                <input checked={settings.runAsAdmin} onChange={() => toggleSetting("runAsAdmin")} type="checkbox" />
                以管理员身份
              </label>
              <label>
                <input checked={settings.autoBackup} onChange={() => toggleSetting("autoBackup")} type="checkbox" />
                自动备份
              </label>
              <label>
                <input checked={settings.keepResponsive} onChange={() => toggleSetting("keepResponsive")} type="checkbox" />
                保持快速响应
              </label>
              <label>
                <input checked={settings.trayMenu} onChange={() => toggleSetting("trayMenu")} type="checkbox" />
                增强版托盘菜单
              </label>
            </div>
            <label className="field-row">
              <span>日志级别:</span>
              <select value={settings.logLevel} onChange={(event) => updateSetting("logLevel", event.target.value as AppSettings["logLevel"])}>
                <option value="normal">普通</option>
                <option value="verbose">详细</option>
                <option value="silent">静默</option>
              </select>
            </label>
            <fieldset>
              <legend>配置文件存储位置</legend>
              <label className="field-row stacked">
                <span>路径:</span>
                <input readOnly value={storagePaths?.dataDir ?? "加载中..."} />
              </label>
              <div className="button-row">
                <button onClick={() => void openPath(storagePaths?.dataDir)}>打开所在文件夹</button>
                <button onClick={() => void openPath(storagePaths?.dataDir)}>打开</button>
              </div>
            </fieldset>
            <div className="button-row">
              <button onClick={() => void restartAsAdmin()}>
                <Shield size={16} aria-hidden="true" />
                以管理员身份重启
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "界面" ? (
          <>
            <label className="field-row">
              <span>窗口模式:</span>
              <select defaultValue="preferences">
                <option value="preferences">仅首选项小窗口</option>
                <option value="tray">仅托盘</option>
              </select>
            </label>
            <label className="field-row">
              <span>主题:</span>
              <select defaultValue="system">
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
              </select>
            </label>
          </>
        ) : null}

        {activeTab === "截屏" ? (
          <>
            <div className="action-grid">
              <button className="primary" onClick={() => void captureNow(false)}>
                <Camera size={16} aria-hidden="true" />
                区域截图
              </button>
              <button onClick={() => void captureNow(true)}>区域截图并复制</button>
              <button onClick={() => void captureArea(false)}>区域截图</button>
              <button onClick={() => void pinLatest()}>
                <Pin size={16} aria-hidden="true" />
                贴图
              </button>
            </div>
            <label className="field-row">
              <span>默认地点:</span>
              <input value={settings.location} onChange={(event) => updateSetting("location", event.target.value)} />
            </label>
            <label className="field-row">
              <span>默认项目:</span>
              <input value={settings.project} onChange={(event) => updateSetting("project", event.target.value)} />
            </label>
            <label className="field-row">
              <span>备注:</span>
              <input value={settings.note} onChange={(event) => updateSetting("note", event.target.value)} placeholder="可选备注" />
            </label>
            <label className="field-row">
              <span>水印位置:</span>
              <select
                disabled={!settings.watermarkEnabled}
                value={settings.watermarkPosition}
                onChange={(event) => updateSetting("watermarkPosition", event.target.value as WatermarkPosition)}
              >
                {watermarkOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-line">
              <input checked={settings.watermarkEnabled} onChange={() => toggleSetting("watermarkEnabled")} type="checkbox" />
              开启时间地点水印
            </label>
            <label className="checkbox-line">
              <input checked={settings.autoCopy} onChange={() => toggleSetting("autoCopy")} type="checkbox" />
              截屏后自动复制
            </label>
            <label className="checkbox-line">
              <input checked={settings.autoPinAfterCapture} onChange={() => toggleSetting("autoPinAfterCapture")} type="checkbox" />
              截图完成后自动贴图
            </label>
          </>
        ) : null}

        {activeTab === "贴图" ? (
          <>
            <div className="note-box">
              <strong>贴图</strong>
              <span>F3 贴最近截图，Shift+F3 隐藏或显示所有贴图。</span>
              <span>贴图窗口可拖动、缩放、调透明度、复制、打开源文件，Esc 关闭。</span>
            </div>
            <div className="button-row">
              <button onClick={() => void pinLatest()}>
                <Pin size={16} aria-hidden="true" />
                贴最近截图
              </button>
              <button onClick={() => void window.screenshotApp.togglePins()}>隐藏/显示所有贴图</button>
            </div>
            <label className="checkbox-line">
              <input checked={settings.autoPinAfterCapture} onChange={() => toggleSetting("autoPinAfterCapture")} type="checkbox" />
              截图完成后自动贴到桌面
            </label>
          </>
        ) : null}

        {activeTab === "输出" ? (
          <>
            <fieldset>
              <legend>截图文件存储位置</legend>
              <label className="field-row stacked">
                <span>路径:</span>
                <input readOnly value={settings.screenshotDir || storagePaths?.screenshotDir || "加载中..."} />
              </label>
              <div className="button-row">
                <button onClick={() => void openPath(settings.screenshotDir || storagePaths?.screenshotDir)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  打开所在文件夹
                </button>
                <button onClick={() => void chooseScreenshotDir()}>更改</button>
              </div>
            </fieldset>
            <label className="field-row">
              <span>输出格式:</span>
              <select value={settings.outputFormat} onChange={(event) => updateSetting("outputFormat", event.target.value as AppSettings["outputFormat"])}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </label>
            <p className="subtle">当前历史：{history.length} 张</p>
          </>
        ) : null}

        {activeTab === "控制" ? (
          <>
            <div className="shortcut-list">
              {shortcutFields.map(([key, name]) => (
                <div className="shortcut-item editable" key={key}>
                  <span>{name}</span>
                  <input value={String(settings[key])} onChange={(event) => updateSetting(key, event.target.value)} />
                </div>
              ))}
            </div>
            <button onClick={clearHistory}>清空截屏历史</button>
          </>
        ) : null}

        {activeTab === "关于" ? (
          <div className="about-box">
            <div className="about-copy">
              <div className="about-brand">
                <img className="about-logo" src={appLogoUrl} alt="抓个屏 logo" />
                <div>
                  <strong>抓个屏</strong>
                  <span>Windows 本地截图工具</span>
                </div>
              </div>
              <span>作者：齐世有</span>
              <span>邮箱：blacklaw@foxmail.com</span>
              <span>纯本地截图、贴图、时间戳与地点水印工具。</span>
              <span>无云端、无账号、无上传。</span>
            </div>
            <button className="about-qr-trigger" type="button" aria-label="放大微信二维码">
              <img className="about-qr" src={wechatQrUrl} alt="微信二维码" />
              <img className="about-qr-preview" src={wechatQrUrl} alt="" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </section>

      <footer className="footer">
        <button className="help" title="帮助">
          <HelpCircle size={16} aria-hidden="true" />
        </button>
        <span>{status}</span>
        <button onClick={() => void restoreDefaults()}>
          <RotateCcw size={16} aria-hidden="true" />
          恢复默认
        </button>
      </footer>
    </main>
  );
}
