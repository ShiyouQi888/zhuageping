import type { AppLanguage, WatermarkPosition } from "./types";

export type TabKey = "general" | "interface" | "capture" | "pin" | "output" | "control" | "about";

export const fallbackLanguage: AppLanguage = "zh-CN";

export const languageOptions: Array<{ value: AppLanguage; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" }
];

export const tabKeys: TabKey[] = ["general", "interface", "capture", "pin", "output", "control", "about"];

export function normalizeLanguage(language: string | undefined): AppLanguage {
  return language === "en-US" ? "en-US" : fallbackLanguage;
}

export function formatShortcutForWindows(shortcut: string) {
  return shortcut
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/CmdOrCtrl/gi, "Ctrl")
    .replace(/Control/gi, "Ctrl")
    .replace(/Command/gi, "Ctrl")
    .replace(/\s*\+\s*/g, "+")
    .trim();
}

export const messages = {
  "zh-CN": {
    appName: "抓个屏",
    titlebar: {
      minimize: "最小化",
      close: "关闭"
    },
    tabs: {
      general: "常规",
      interface: "界面",
      capture: "截屏",
      pin: "贴图",
      output: "输出",
      control: "控制",
      about: "关于"
    },
    common: {
      loading: "加载中...",
      open: "打开",
      openFolder: "打开所在文件夹",
      change: "更改",
      restoreDefaults: "恢复默认",
      help: "帮助",
      checkForUpdates: "检查更新",
      restartInstall: "重启安装"
    },
    status: {
      ready: "准备就绪",
      preferencesOpened: "首选项已打开",
      saved: (filePath: string) => `已保存：${filePath}`,
      historyCleared: "截图历史已清空",
      settingsUpdated: "设置已更新",
      settingsSaved: "设置已保存",
      capturing: "正在截屏...",
      captureCanceled: "截图已取消",
      captureSavedCopied: "截图已保存并复制",
      selectingRegion: "拖动选择截图区域...",
      regionCanceled: "区域截图已取消",
      regionSavedCopied: "区域截图已保存并复制",
      selectingScroll: "拖动选择长截图区域...",
      scrollCanceled: "滚动截图已取消",
      scrollSavedCopied: "长截图已保存并复制",
      pinned: "已执行贴图",
      pathMissing: "路径还没有准备好",
      screenshotDirUpdated: "截图保存目录已更新",
      restartingAsAdmin: "正在请求管理员权限重启...",
      checkingUpdate: "正在检查更新..."
    },
    general: {
      language: "显示语言:",
      launchAtStartup: "开机启动",
      runAsAdmin: "以管理员身份",
      autoBackup: "自动备份",
      keepResponsive: "保持快速响应",
      trayMenu: "增强版托盘菜单",
      logLevel: "日志级别:",
      logLevelOptions: {
        normal: "普通",
        verbose: "详细",
        silent: "静默"
      },
      configLocation: "配置文件存储位置",
      path: "路径:",
      restartAsAdmin: "以管理员身份重启"
    },
    update: {
      title: "软件更新",
      currentVersion: "当前版本",
      latestVersion: "最新版本",
      source: "更新源：GitHub Releases",
      idle: "可手动检查新版本，正式安装版启动后也会自动静默检查。",
      disabled: "开发环境不检查更新，请在安装版中测试。",
      checking: "正在检查 GitHub Releases...",
      available: "发现新版本，正在自动下载。",
      notAvailable: "当前已是最新版本。",
      downloading: "正在下载更新",
      downloaded: "更新已下载完成，重启后自动安装。",
      error: "更新检查失败，请稍后再试。"
    },
    interface: {
      windowMode: "窗口模式:",
      preferencesOnly: "仅首选项小窗口",
      trayOnly: "仅托盘",
      theme: "主题:",
      systemTheme: "跟随系统",
      lightTheme: "浅色"
    },
    capture: {
      regionCapture: "区域截图",
      regionCaptureCopy: "区域截图并复制",
      scrollCapture: "滚动截图",
      pin: "贴图",
      location: "默认地点:",
      project: "默认项目:",
      note: "备注:",
      notePlaceholder: "可选备注",
      watermarkPosition: "水印位置:",
      watermarkEnabled: "开启时间地点水印",
      autoCopy: "截屏后自动复制",
      autoPin: "截图完成后自动贴图"
    },
    watermark: {
      "top-left": "左上",
      "top-right": "右上",
      "bottom-left": "左下",
      "bottom-right": "右下",
      "bottom-bar": "底部横条"
    } satisfies Record<WatermarkPosition, string>,
    pin: {
      title: "贴图",
      line1: "F3 贴最近截图，Shift+F3 隐藏或显示所有贴图。",
      line2: "贴图窗口可拖动、缩放、调透明度、复制、打开源文件，Esc 关闭。",
      pinLatest: "贴最近截图",
      togglePins: "隐藏/显示所有贴图",
      autoPin: "截图完成后自动贴到桌面"
    },
    output: {
      screenshotLocation: "截图文件存储位置",
      path: "路径:",
      format: "输出格式:",
      historyCount: (count: number) => `当前历史：${count} 张`
    },
    control: {
      shortcutsLabel: "快捷键",
      clearHistory: "清空截屏历史",
      shortcuts: {
        shortcutCapture: "截屏",
        shortcutCaptureCopy: "截屏并自动复制",
        shortcutArea: "自定义截屏",
        shortcutScrollCapture: "滚动截图",
        shortcutPin: "贴图",
        shortcutTogglePins: "隐藏/显示所有贴图"
      }
    },
    about: {
      logoAlt: "抓个屏 logo",
      subtitle: "Windows 本地截图工具",
      author: "作者：齐世有",
      email: "邮箱：blacklaw@foxmail.com",
      description: "纯本地截图、贴图、时间戳与地点水印工具。",
      privacy: "无云端、无账号、无上传。",
      qrLabel: "放大微信二维码",
      qrAlt: "微信二维码"
    }
  },
  "en-US": {
    appName: "Zhuageping",
    titlebar: {
      minimize: "Minimize",
      close: "Close"
    },
    tabs: {
      general: "General",
      interface: "Interface",
      capture: "Capture",
      pin: "Pin",
      output: "Output",
      control: "Controls",
      about: "About"
    },
    common: {
      loading: "Loading...",
      open: "Open",
      openFolder: "Open Folder",
      change: "Change",
      restoreDefaults: "Reset",
      help: "Help",
      checkForUpdates: "Check for Updates",
      restartInstall: "Restart to Install"
    },
    status: {
      ready: "Ready",
      preferencesOpened: "Preferences opened",
      saved: (filePath: string) => `Saved: ${filePath}`,
      historyCleared: "Screenshot history cleared",
      settingsUpdated: "Settings updated",
      settingsSaved: "Settings saved",
      capturing: "Capturing...",
      captureCanceled: "Capture canceled",
      captureSavedCopied: "Capture saved and copied",
      selectingRegion: "Drag to select a capture region...",
      regionCanceled: "Region capture canceled",
      regionSavedCopied: "Region capture saved and copied",
      selectingScroll: "Drag to select a scrolling capture region...",
      scrollCanceled: "Scrolling capture canceled",
      scrollSavedCopied: "Scrolling capture saved and copied",
      pinned: "Pin action completed",
      pathMissing: "Path is not ready yet",
      screenshotDirUpdated: "Screenshot folder updated",
      restartingAsAdmin: "Requesting administrator restart...",
      checkingUpdate: "Checking for updates..."
    },
    general: {
      language: "Language:",
      launchAtStartup: "Launch at startup",
      runAsAdmin: "Run as administrator",
      autoBackup: "Auto backup",
      keepResponsive: "Keep responsive",
      trayMenu: "Enhanced tray menu",
      logLevel: "Log level:",
      logLevelOptions: {
        normal: "Normal",
        verbose: "Verbose",
        silent: "Silent"
      },
      configLocation: "Configuration Storage Location",
      path: "Path:",
      restartAsAdmin: "Restart as administrator"
    },
    update: {
      title: "Software Update",
      currentVersion: "Current version",
      latestVersion: "Latest version",
      source: "Update source: GitHub Releases",
      idle: "You can check manually. Packaged builds also check quietly after launch.",
      disabled: "Update checks run in packaged builds only.",
      checking: "Checking GitHub Releases...",
      available: "A new version is available and downloading.",
      notAvailable: "You are on the latest version.",
      downloading: "Downloading update",
      downloaded: "Update downloaded. Restart to install.",
      error: "Update check failed. Please try again later."
    },
    interface: {
      windowMode: "Window mode:",
      preferencesOnly: "Preferences window only",
      trayOnly: "Tray only",
      theme: "Theme:",
      systemTheme: "Follow system",
      lightTheme: "Light"
    },
    capture: {
      regionCapture: "Region Capture",
      regionCaptureCopy: "Capture and Copy",
      scrollCapture: "Scrolling Capture",
      pin: "Pin",
      location: "Default location:",
      project: "Default project:",
      note: "Note:",
      notePlaceholder: "Optional note",
      watermarkPosition: "Watermark position:",
      watermarkEnabled: "Enable time and location watermark",
      autoCopy: "Auto copy after capture",
      autoPin: "Auto pin after capture"
    },
    watermark: {
      "top-left": "Top Left",
      "top-right": "Top Right",
      "bottom-left": "Bottom Left",
      "bottom-right": "Bottom Right",
      "bottom-bar": "Bottom Bar"
    } satisfies Record<WatermarkPosition, string>,
    pin: {
      title: "Pin",
      line1: "F3 pins the latest screenshot. Shift+F3 shows or hides all pins.",
      line2: "Move, resize, fade, copy, open, or close pins with Esc.",
      pinLatest: "Pin Latest",
      togglePins: "Show/Hide All Pins",
      autoPin: "Auto pin captures to desktop"
    },
    output: {
      screenshotLocation: "Screenshot Storage Location",
      path: "Path:",
      format: "Output format:",
      historyCount: (count: number) => `${count} item${count === 1 ? "" : "s"} in history`
    },
    control: {
      shortcutsLabel: "Shortcuts",
      clearHistory: "Clear Screenshot History",
      shortcuts: {
        shortcutCapture: "Capture",
        shortcutCaptureCopy: "Capture and auto copy",
        shortcutArea: "Custom capture",
        shortcutScrollCapture: "Scrolling capture",
        shortcutPin: "Pin",
        shortcutTogglePins: "Show/hide all pins"
      }
    },
    about: {
      logoAlt: "Zhuageping logo",
      subtitle: "Windows local screenshot tool",
      author: "Author: Qi Shiyou",
      email: "Email: blacklaw@foxmail.com",
      description: "A local screenshot, pin, timestamp, and location watermark tool.",
      privacy: "No cloud, no account, no uploads.",
      qrLabel: "Enlarge WeChat QR code",
      qrAlt: "WeChat QR code"
    }
  }
} as const;
