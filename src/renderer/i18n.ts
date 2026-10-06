import type { AppLanguage, WatermarkPosition } from "./types";

export type TabKey = "general" | "capture" | "recording" | "pin" | "output" | "control" | "about";

export const fallbackLanguage: AppLanguage = "zh-CN";

export const languageOptions: Array<{ value: AppLanguage; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" }
];

export const tabKeys: TabKey[] = ["general", "capture", "recording", "pin", "output", "control", "about"];

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
      recording: "录屏",
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
      selectingRecording: "拖动选择录屏区域...",
      recordingCanceled: "录屏已取消",
      recordingSaved: (filePath: string) => `录屏已保存：${filePath}`,
      pinned: "已执行贴图",
      pathMissing: "路径还没有准备好",
      screenshotDirUpdated: "截图保存目录已更新",
      restartingAsAdmin: "正在请求管理员权限重启...",
      checkingUpdate: "正在检查更新..."
    },
    general: {
      runtime: "启动与运行",
      advanced: "高级设置",
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
      openConfigFolder: "打开配置目录",
      diagnostics: "诊断与日志",
      openDiagnostics: "打开日志目录",
      copyDiagnostics: "复制诊断信息",
      path: "路径:",
      restartAsAdmin: "以管理员身份重启"
    },
    update: {
      title: "软件更新",
      currentVersion: "当前版本",
      latestVersion: "最新版本",
      whatsNew: "本次更新内容",
      noReleaseNotes: "此版本暂未提供更新说明。",
      idle: "可手动检查新版本，正式安装版启动后也会自动静默检查。",
      disabled: "开发环境不检查更新，请在安装版中测试。",
      checking: "正在检查更新...",
      available: "发现新版本，正在自动下载。",
      notAvailable: "当前已是最新版本。",
      downloading: "正在下载更新",
      downloaded: "更新已下载完成，重启后自动安装。",
      error: "更新检查失败，请稍后再试。"
    },
    interface: {
      appearance: "语言与外观",
      windowBehavior: "窗口行为",
      language: "显示语言:",
      windowMode: "窗口模式:",
      preferencesOnly: "仅首选项小窗口",
      trayOnly: "仅托盘",
      theme: "主题:",
      systemTheme: "跟随系统",
      lightTheme: "浅色",
      darkTheme: "深色"
    },
    capture: {
      actions: "截图操作",
      details: "截图设置",
      fullscreenCapture: "全屏截图",
      fullscreenCopy: "全屏截图并复制",
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
    recording: {
      options: "录制设置",
      start: "区域录屏",
      screen: "录制所选显示器",
      hint: "支持区域录制、指定显示器录制、暂停继续和本地 MP4 保存。",
      display: "录制显示器:",
      displayOption: (index: number, width: number, height: number, isPrimary: boolean) =>
        `显示器 ${index} · ${width} x ${height}${isPrimary ? " · 主屏" : ""}`,
      fps: "帧率:",
      quality: "画质:",
      qualityOptions: {
        standard: "标准",
        high: "高清",
        compact: "高压缩"
      },
      mic: "录制麦克风",
      countdown: "开始前倒计时",
      showCursor: "显示鼠标指针",
      clickHighlight: "显示点击效果",
      historyCount: (count: number) => `当前录屏：${count} 个`,
      latest: "最近录屏",
      openLatest: "打开最近录屏",
      openFolder: "打开文件夹",
      recent: "录屏历史"
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
      files: "文件存储",
      screenshotLocation: "截图文件存储位置",
      recordingLocation: "录屏文件存储位置",
      path: "路径:",
      format: "输出格式:",
      formatAndHistory: "格式与历史",
      recordingFormat: "录屏格式:",
      historyCount: (count: number) => `截图历史：${count} 张`,
      recordingHistoryCount: (count: number) => `录屏历史：${count} 个`
    },
    control: {
      shortcutsLabel: "快捷键",
      clearHistory: "清空截屏历史",
      shortcuts: {
        shortcutCapture: "截屏",
        shortcutCaptureCopy: "截屏并自动复制",
        shortcutArea: "自定义截屏",
        shortcutScrollCapture: "滚动截图",
        shortcutRecord: "区域录屏",
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
      privacyPolicy: "隐私政策",
      effectiveDate: "生效日期：2026 年 10 月 6 日",
      privacyIntro: "抓个屏以本地处理为原则。除检查或下载软件更新外，截图、录屏、OCR 识别结果与设置均不会由本软件上传至开发者服务器。",
      viewOnlinePolicy: "查看在线政策",
      policySections: [
        {
          title: "我们处理的信息",
          body: "为提供截图、录屏、贴图、OCR 与水印功能，软件会在您的设备上处理您选择的屏幕内容、截图、录屏、可选麦克风音频，以及您填写的地点、项目、备注和偏好设置。这些内容可能包含个人信息，取决于您选择捕获或输入的内容。"
        },
        {
          title: "用途、存储与安全",
          body: "上述信息仅用于实现软件功能，并保存在您选择的本地输出目录及本地应用数据目录。软件不建立用户账户、不提供云同步、不投放广告，也不出售、出租或交易您的信息。文件安全由您的 Windows 账户、设备安全设置和您选择的存储位置共同保护。"
        },
        {
          title: "网络连接与第三方",
          body: "OCR 引擎在本机运行，不上传待识别图片或文字。软件仅在您检查更新、自动下载更新或打开在线政策时连接 GitHub Releases 或 GitHub；这些服务可能依其自身政策处理网络请求信息，例如 IP 地址。软件不集成分析、广告或第三方数据经纪服务。"
        },
        {
          title: "您的控制权",
          body: "您可随时更改截图与录屏保存位置、关闭麦克风录制、清空历史记录，并在文件资源管理器中查看、复制或删除已保存的截图、录屏、配置和备份。卸载软件不会自动删除您的本地文件；请在卸载前或卸载后按需删除这些内容。"
        },
        {
          title: "共享与第三方信息",
          body: "本软件不会主动向外部服务发布您的内容。若您自行复制、保存、分享截图或录屏，相关接收方及服务的处理规则由其自身政策决定。请在截取包含他人个人信息的内容前确认您拥有必要的授权。"
        },
        {
          title: "儿童与政策更新",
          body: "本软件不面向儿童，也不会主动收集儿童信息。我们可能随功能变化更新本政策，并在此页面及在线政策中更新生效日期。如有隐私问题、访问或删除请求，请通过 blacklaw@foxmail.com 联系我们。"
        }
      ],
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
      recording: "Record",
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
      selectingRecording: "Drag to select a recording region...",
      recordingCanceled: "Recording canceled",
      recordingSaved: (filePath: string) => `Recording saved: ${filePath}`,
      pinned: "Pin action completed",
      pathMissing: "Path is not ready yet",
      screenshotDirUpdated: "Screenshot folder updated",
      restartingAsAdmin: "Requesting administrator restart...",
      checkingUpdate: "Checking for updates..."
    },
    general: {
      runtime: "Startup & Runtime",
      advanced: "Advanced Settings",
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
      openConfigFolder: "Open Config Folder",
      diagnostics: "Diagnostics & Logs",
      openDiagnostics: "Open Log Folder",
      copyDiagnostics: "Copy Diagnostic Info",
      path: "Path:",
      restartAsAdmin: "Restart as administrator"
    },
    update: {
      title: "Software Update",
      currentVersion: "Current version",
      latestVersion: "Latest version",
      whatsNew: "What's new",
      noReleaseNotes: "No release notes were provided for this version.",
      idle: "You can check manually. Packaged builds also check quietly after launch.",
      disabled: "Update checks run in packaged builds only.",
      checking: "Checking for updates...",
      available: "A new version is available and downloading.",
      notAvailable: "You are on the latest version.",
      downloading: "Downloading update",
      downloaded: "Update downloaded. Restart to install.",
      error: "Update check failed. Please try again later."
    },
    interface: {
      appearance: "Language & Appearance",
      windowBehavior: "Window Behavior",
      language: "Language:",
      windowMode: "Window mode:",
      preferencesOnly: "Preferences window only",
      trayOnly: "Tray only",
      theme: "Theme:",
      systemTheme: "Follow system",
      lightTheme: "Light",
      darkTheme: "Dark"
    },
    capture: {
      actions: "Capture",
      details: "Capture Settings",
      fullscreenCapture: "Full Screen",
      fullscreenCopy: "Full Screen and Copy",
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
    recording: {
      options: "Recording Settings",
      start: "Region Recording",
      screen: "Record Selected Display",
      hint: "Record a region or selected display with pause/resume and local MP4 saving.",
      display: "Recording display:",
      displayOption: (index: number, width: number, height: number, isPrimary: boolean) =>
        `Display ${index} · ${width} x ${height}${isPrimary ? " · Primary" : ""}`,
      fps: "Frame rate:",
      quality: "Quality:",
      qualityOptions: {
        standard: "Standard",
        high: "High",
        compact: "Compact"
      },
      mic: "Record microphone",
      countdown: "Countdown before start",
      showCursor: "Show cursor",
      clickHighlight: "Show click highlight",
      historyCount: (count: number) => `${count} recording${count === 1 ? "" : "s"} in history`,
      latest: "Latest recording",
      openLatest: "Open latest recording",
      openFolder: "Open Folder",
      recent: "Recording History"
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
      files: "File Storage",
      screenshotLocation: "Screenshot Storage Location",
      recordingLocation: "Recording Storage Location",
      path: "Path:",
      format: "Output format:",
      formatAndHistory: "Formats & History",
      recordingFormat: "Recording format:",
      historyCount: (count: number) => `${count} screenshot${count === 1 ? "" : "s"} in history`,
      recordingHistoryCount: (count: number) => `${count} recording${count === 1 ? "" : "s"} in history`
    },
    control: {
      shortcutsLabel: "Shortcuts",
      clearHistory: "Clear Screenshot History",
      shortcuts: {
        shortcutCapture: "Capture",
        shortcutCaptureCopy: "Capture and auto copy",
        shortcutArea: "Custom capture",
        shortcutScrollCapture: "Scrolling capture",
        shortcutRecord: "Region recording",
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
      privacyPolicy: "Privacy Policy",
      effectiveDate: "Effective date: October 6, 2026",
      privacyIntro: "Zhuageping is local-first. Other than checking for or downloading software updates, screenshots, recordings, OCR results, and settings are not uploaded by the app to our servers.",
      viewOnlinePolicy: "View online policy",
      policySections: [
        {
          title: "Information we process",
          body: "To provide capture, recording, pinning, OCR, and watermark features, the app processes on your device the screen content you choose, screenshots, recordings, optional microphone audio, and the location, project, notes, and preferences you enter. This content may contain personal information depending on what you choose to capture or enter."
        },
        {
          title: "Use, storage, and security",
          body: "This information is used only to provide the app's features and is stored in the local output folders and local app-data folder that you choose or the app creates. The app does not create user accounts, provide cloud sync, serve ads, or sell, rent, or trade your information. Your Windows account, device security settings, and chosen storage location help protect local files."
        },
        {
          title: "Network connections and third parties",
          body: "The OCR engine runs locally and does not upload images or recognized text. The app connects to GitHub Releases or GitHub only when you check for updates, download an update, or open the online policy. Those services may process network-request information, such as an IP address, under their own policies. The app contains no analytics, advertising, or third-party data-broker service."
        },
        {
          title: "Your choices and controls",
          body: "You can change screenshot and recording locations, turn off microphone recording, clear history, and use File Explorer to view, copy, or delete saved screenshots, recordings, configuration, and backups. Uninstalling the app does not automatically remove local files; delete them before or after uninstalling if desired."
        },
        {
          title: "Sharing and other people's information",
          body: "The app does not proactively publish your content to external services. If you copy, save, or share screenshots or recordings yourself, the recipient and service's own policies apply. Please confirm that you have the necessary authorization before capturing content that contains another person's personal information."
        },
        {
          title: "Children and policy changes",
          body: "The app is not directed to children and does not intentionally collect children's information. We may update this policy when functionality changes and will update the effective date here and in the online policy. For privacy questions or access or deletion requests, contact blacklaw@foxmail.com."
        }
      ],
      qrLabel: "Enlarge WeChat QR code",
      qrAlt: "WeChat QR code"
    }
  }
} as const;
