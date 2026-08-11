import { useState } from "react";
import { FolderOpen, RotateCcw, X } from "lucide-react";
import type { StoragePaths } from "../types";

type PreferencesDialogProps = {
  isOpen: boolean;
  storagePaths: StoragePaths | null;
  onClose: () => void;
};

const tabs = ["常规", "界面", "截屏", "贴图", "输出", "控制", "关于"] as const;
type PreferenceTab = (typeof tabs)[number];

const shortcuts = [
  ["截屏", "F1"],
  ["截屏并自动复制", "Ctrl+F1"],
  ["自定义截屏", "Shift+F1"],
  ["贴图", "F3"],
  ["隐藏/显示所有贴图", "Shift+F3"],
  ["切换到另一贴图组", "Ctrl+F3"]
];

export function PreferencesDialog({ isOpen, storagePaths, onClose }: PreferencesDialogProps) {
  const [activeTab, setActiveTab] = useState<PreferenceTab>("常规");
  const [settings, setSettings] = useState({
    launchAtStartup: true,
    runAsAdmin: false,
    autoBackup: true,
    keepResponsive: true,
    trayMenu: true,
    autoCopy: true,
    autoPinAfterCapture: false,
    showCursor: false,
    savePng: true
  });

  if (!isOpen) {
    return null;
  }

  function toggle(key: keyof typeof settings) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
        <header className="preferences-titlebar">
          <div>
            <h2 id="preferences-title">首选项</h2>
            <p>参考 Snipaste 的设置结构，保持本地优先。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭首选项">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="preferences-tabs" aria-label="首选项分类">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        <div className="preferences-body">
          {activeTab === "常规" ? (
            <div className="settings-grid">
              <label className="check-row">
                <input checked={settings.launchAtStartup} onChange={() => toggle("launchAtStartup")} type="checkbox" />
                <span>开机启动</span>
              </label>
              <label className="check-row">
                <input checked={settings.runAsAdmin} onChange={() => toggle("runAsAdmin")} type="checkbox" />
                <span>以管理员身份运行</span>
              </label>
              <label className="check-row">
                <input checked={settings.autoBackup} onChange={() => toggle("autoBackup")} type="checkbox" />
                <span>自动备份</span>
              </label>
              <label className="check-row">
                <input checked={settings.keepResponsive} onChange={() => toggle("keepResponsive")} type="checkbox" />
                <span>保持快速响应</span>
              </label>
              <label className="check-row">
                <input checked={settings.trayMenu} onChange={() => toggle("trayMenu")} type="checkbox" />
                <span>增强版托盘菜单</span>
              </label>
              <label className="field">
                <span>日志级别</span>
                <select defaultValue="normal">
                  <option value="normal">普通</option>
                  <option value="verbose">详细</option>
                  <option value="silent">静默</option>
                </select>
              </label>
            </div>
          ) : null}

          {activeTab === "界面" ? (
            <div className="settings-grid">
              <label className="field">
                <span>显示语言</span>
                <select defaultValue="zh-CN">
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </label>
              <label className="field">
                <span>界面密度</span>
                <select defaultValue="comfortable">
                  <option value="compact">紧凑</option>
                  <option value="comfortable">舒适</option>
                </select>
              </label>
            </div>
          ) : null}

          {activeTab === "截屏" ? (
            <div className="settings-grid">
              <label className="check-row">
                <input checked={settings.autoCopy} onChange={() => toggle("autoCopy")} type="checkbox" />
                <span>截屏后自动复制</span>
              </label>
              <label className="check-row">
                <input checked={settings.autoPinAfterCapture} onChange={() => toggle("autoPinAfterCapture")} type="checkbox" />
                <span>截图完成后自动贴图</span>
              </label>
              <label className="check-row">
                <input checked={settings.showCursor} onChange={() => toggle("showCursor")} type="checkbox" />
                <span>截屏时显示鼠标指针</span>
              </label>
              <label className="field">
                <span>延时截屏</span>
                <select defaultValue="0">
                  <option value="0">无延时</option>
                  <option value="3">3 秒</option>
                  <option value="5">5 秒</option>
                  <option value="10">10 秒</option>
                </select>
              </label>
            </div>
          ) : null}

          {activeTab === "贴图" ? (
            <div className="placeholder-panel">
              <strong>贴图功能</strong>
              <p>F3 贴最近截图，Shift+F3 隐藏或显示所有贴图。贴图窗口支持拖动、缩放、透明度、复制和关闭。</p>
            </div>
          ) : null}

          {activeTab === "输出" ? (
            <div className="settings-grid">
              <label className="check-row">
                <input checked={settings.savePng} onChange={() => toggle("savePng")} type="checkbox" />
                <span>保存为 PNG</span>
              </label>
              <label className="field wide">
                <span>截图保存目录</span>
                <input readOnly value={storagePaths?.screenshotDir ?? "加载中..."} />
              </label>
              <button className="secondary-button" type="button">
                <FolderOpen size={18} aria-hidden="true" />
                更改目录
              </button>
            </div>
          ) : null}

          {activeTab === "控制" ? (
            <div className="shortcut-table" role="table" aria-label="快捷键">
              {shortcuts.map(([name, key]) => (
                <div className="shortcut-row" role="row" key={name}>
                  <span role="cell">{name}</span>
                  <kbd role="cell">{key}</kbd>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "关于" ? (
            <div className="placeholder-panel">
              <strong>抓个屏</strong>
              <p>作者：齐世有<br />邮箱：blacklaw@foxmail.com</p>
              <p>纯本地截图、贴图、时间戳、地点水印工具。</p>
            </div>
          ) : null}
        </div>

        <footer className="preferences-footer">
          <button className="secondary-button" type="button">
            <RotateCcw size={18} aria-hidden="true" />
            恢复默认
          </button>
          <button className="primary-button" onClick={onClose} type="button">
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
