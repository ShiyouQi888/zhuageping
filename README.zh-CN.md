<p align="center">
  <a href="README.md">English</a>
  ·
  <strong>简体中文</strong>
</p>

<p align="center">
  <img src="src/renderer/assets/app-logo.png" width="96" alt="抓个屏 Logo" />
</p>

<h1 align="center">抓个屏</h1>

<p align="center">
  Windows 本地截图、标注、贴图、原生录屏、滚动长截图、水印与 OCR 识别工具。
</p>

<p align="center">
  <a href="https://github.com/ShiyouQi888/zhuageping/releases/latest">下载最新版</a>
  ·
  <a href="#核心功能">功能</a>
  ·
  <a href="#界面截图">截图</a>
  ·
  <a href="#默认快捷键">快捷键</a>
  ·
  <a href="#隐私说明">隐私说明</a>
</p>

抓个屏是一款面向 Windows 的本地截图与录屏工具。软件不依赖云端服务，截图、录屏、历史记录、配置、贴图和 OCR 识别都保留在本机，适合工作留痕、项目验收、客服沟通、远程协作、资料对照和日常截图标注。

作者：齐世有  
邮箱：blacklaw@foxmail.com

## 下载

最新版安装包请在 GitHub Releases 下载：

[下载抓个屏 Windows 安装包](https://github.com/ShiyouQi888/zhuageping/releases/latest)

当前版本：

- 版本：`0.1.18`
- 平台：Windows x64
- 安装包：`zhuageping-Setup-0.1.18-x64.exe`
- SHA256：`BEB2D91B64CE8175A1580B67C2C1D199F6DC8EEB759794550E0DC4DC5CA6F20B`
- Release：[抓个屏 v0.1.18](https://github.com/ShiyouQi888/zhuageping/releases/tag/v0.1.18)

说明：当前安装包暂未购买商业代码签名证书。安装时 Windows 可能提示未知发布者，这是未签名安装包的正常现象，不代表软件连接云端或上传数据。

## 最新功能

`v0.1.18` 重点更新：

- 首选项重新归类为“启动与运行”“软件更新”“高级设置”“语言与外观”和“窗口行为”，信息层级更清晰。
- 缩小首选项窗口的左右宽度，同时保证中英文标签和滚动内容完整显示。
- 将截图目录、录屏目录、输出格式和历史数量统一归入“输出”页。
- 移除录屏页重复的文件夹入口，让录制页只保留录制操作和质量设置。
- 软件更新不再显示“更新源”，检测到新版本后会直接展示 GitHub Release 的更新内容。
- 重启安装提示同步展示版本说明，安装前即可了解本次更新。
- 修复手动检查更新完成后仍可能显示“正在检查更新”的状态竞争。
- 修复窗口高度不足时设置卡片被压缩、内容被截断的问题。

## 界面截图

### 首选项

<table>
  <tr>
    <td width="50%"><img src="docs/readme-assets/preferences-general.png" alt="常规设置与软件更新" /></td>
    <td width="50%"><img src="docs/readme-assets/preferences-interface.png" alt="界面设置与主题设置" /></td>
  </tr>
  <tr>
    <td align="center"><strong>常规与软件更新</strong></td>
    <td align="center"><strong>界面与主题</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/readme-assets/preferences-capture.png" alt="截图设置与水印设置" /></td>
    <td width="50%"><img src="docs/readme-assets/preferences-pin.png" alt="贴图设置" /></td>
  </tr>
  <tr>
    <td align="center"><strong>截图设置</strong></td>
    <td align="center"><strong>贴图设置</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/readme-assets/preferences-output.png" alt="输出设置与截图存储位置" /></td>
    <td width="50%"><img src="docs/readme-assets/preferences-controls.png" alt="控制设置与快捷键设置" /></td>
  </tr>
  <tr>
    <td align="center"><strong>输出设置</strong></td>
    <td align="center"><strong>快捷键控制</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/readme-assets/preferences-about.png" alt="关于页面、作者信息和二维码" /></td>
    <td width="50%"><img src="docs/readme-assets/capture-editor-toolbar.png" alt="原地截图编辑器与标注工具栏" /></td>
  </tr>
  <tr>
    <td align="center"><strong>关于</strong></td>
    <td align="center"><strong>原地截图编辑器</strong></td>
  </tr>
</table>

## 核心功能

- 区域截图：按 `F1` 进入透明截图层，拖拽框选截图区域。
- 窗口自动识别：截图模式下鼠标悬停窗口区域，可自动高亮并单击选中。
- 截图并复制：按 `Ctrl+F1` 截图完成后写入剪贴板。
- 自定义截图：按 `Shift+F1` 进入区域截图流程。
- 滚动截图：按 `Ctrl+Shift+F1` 选择可滚动区域，自动滚动并拼接成长图。
- Windows 原生录屏：支持框选区域或录制当前屏幕，直接保存为 MP4/H.264。
- 录屏声音：默认录入电脑声音，可选择同时录入麦克风。
- 录屏控制：区域外控制条、`F2`、`Esc` 和托盘菜单均可用于安全结束录制。
- OCR 文字识别：识别当前截图区域文字，自动复制并弹窗展示结果。
- 原地编辑：截图后直接在选区内添加标注，不打开独立编辑窗口。
- 标注工具：矩形、圆形、直线、箭头、画笔、文字、编号、马赛克、模糊块、橡皮擦。
- 对象编辑：标注对象可选中、移动、缩放、复制、删除、调整层级和二次编辑。
- 工具状态栏：支持颜色预设、线宽预设、文字大小、文字加粗、文字背景、文字描边、马赛克/模糊强度。
- 隐私处理：马赛克和模糊块会合成到最终截图中，保存、复制、贴图效果一致。
- 贴图：按 `F3` 将截图固定到桌面，方便对照资料。
- 贴图增强：支持鼠标滚轮缩放、透明度调节、锁定、置顶、鼠标穿透、复制、打开文件、关闭。
- 隐藏/显示贴图：按 `Shift+F3` 快速切换所有贴图窗口。
- 时间地点水印：可开启/关闭，可配置地点、项目、备注和水印位置。
- 截图历史：本地保存截图历史，便于预览、复制和打开所在文件夹。
- 文件命名：截图保存为 `Zhuageping-年月日-时间-编号`，例如 `Zhuageping-20260812-132746-001.png`。
- 托盘菜单：支持从系统托盘快速截图、贴图、打开首选项、重启和退出。
- 开机自启：可在首选项中开启或关闭。
- 管理员重启：可从软件内以管理员身份重启。
- 本地运行：无云端账号、无远程同步、无上传行为。

## 截图工作流

1. 按 `F1` 进入截图模式。
2. 拖拽选择区域，或把鼠标放到窗口上单击自动识别区域。
3. 选区下方出现截图编辑工具栏。
4. 在当前截图区域内添加文字、箭头、矩形、马赛克、模糊等标注。
5. 需要识别文字时，点击 OCR 或按 `Ctrl+Shift+O`。
6. 点击复制、贴图、保存或完成。

设计原则：

- 选区代表最终裁剪边界。
- 标注对象独立于选区保存。
- 调整选区大小时，不会把已经画好的矩形、文字、箭头拉伸变形。
- 最终保存时，会按当前选区裁剪并合成标注、水印、马赛克和模糊效果。
- OCR 识别默认基于当前截图区域的底图和隐私处理效果，不把箭头、红框等批注内容作为识别目标。

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 截图 | `F1` |
| 截图并自动复制 | `Ctrl+F1` |
| 自定义截图 | `Shift+F1` |
| 滚动截图（长图） | `Ctrl+Shift+F1` |
| 开始区域录屏 / 停止录屏 | `F2` |
| 停止或取消录屏备用键 | `Esc` |
| OCR 识别当前截图区域 | `Ctrl+Shift+O` |
| 贴图 | `F3` |
| 隐藏/显示所有贴图 | `Shift+F3` |
| 完成截图 | `Enter` |
| 取消截图 | `Esc` |
| 复制截图 | `Ctrl+C` |
| 保存截图 | `Ctrl+S` |

截图编辑工具快捷键：

| 工具 | 快捷键 |
| --- | --- |
| 选择 | `V` |
| 矩形 | `R` |
| 圆形 | `O` |
| 直线 | `L` |
| 箭头 | `A` |
| 画笔 | `B` |
| 文字 | `T` |
| 马赛克 | `M` |
| 模糊块 | `U` |
| 橡皮擦 | `E` |
| 全选对象 | `Ctrl+A` |
| 复制对象 | `Ctrl+D` |
| 删除选中对象 | `Delete` / `Backspace` |
| 撤销 | `Ctrl+Z` |

快捷键可在首选项的“控制”页面中调整。

## OCR 说明

抓个屏使用 RapidOCR-json 作为本地 OCR 引擎。

已支持：

- 当前截图区域 OCR。
- 识别结果自动复制到剪贴板。
- 识别结果弹窗展示。
- 安装包内置 OCR exe 和模型。
- 无需联网、无需账号、无需上传图片。

打包后的 OCR 资源位置：

```text
resources/ocr/RapidOCR-json/
  RapidOCR_json.exe
  models/
    ch_PP-OCRv3_det_infer.onnx
    ch_PP-OCRv3_rec_infer.onnx
    ch_ppocr_mobile_v2.0_cls_infer.onnx
    ppocr_keys_v1.txt
```

开发环境中，OCR 引擎可放在：

```text
.runtime/ocr-v0.1.0/RapidOCR-json/
```

打包前会执行：

```bash
npm run prepare:ocr
```

该脚本会把本机 OCR 引擎复制到 `build/ocr`，再由 `electron-builder` 打进安装包。

## 录屏功能

Windows 下的录屏由安装包内置的 `ZhuagepingRecorderHost` 原生进程完成。视频通过 Microsoft Media Foundation 编码，电脑声音和麦克风通过 ScreenRecorderLib 调用 WASAPI 采集。

已支持：

- 区域录屏和当前屏幕录制。
- 直接输出 H.264 视频与 AAC 音频的 MP4 文件。
- Windows 电脑声音和可选麦克风录入。
- 15、30、60 FPS，以及精简、标准、高清三档画质。
- 鼠标指针与点击提示。
- 多屏显示设备识别和单屏高 DPI 坐标换算。
- 区域外空间足够时，在录制范围外显示控制条。
- `F2` 开始或停止、全局 `Esc` 备用结束键，以及托盘“停止录屏”。
- 本地录屏历史与打开录屏文件夹功能。

录屏默认保存在当前截图目录下：

```text
screenshots/recordings/Zhuageping-年月日-时间-编号.mp4
```

全屏录制时，同一屏幕不存在录制范围外区域，因此会隐藏悬浮控制条。请使用 `F2`、`Esc` 或托盘菜单结束录制。

## 贴图功能

贴图窗口用于把截图固定在桌面上，常见用途包括对照资料、临摹 UI、核对表格、暂存截图信息。

已支持：

- 鼠标滚轮缩放贴图。
- 悬浮显示贴图菜单。
- 锁定/解锁贴图。
- 置顶/取消置顶。
- 鼠标穿透/取消穿透。
- 透明度调节。
- 右键菜单保存图片。
- 右键菜单复制图片。
- 右键菜单打开所在文件夹。
- 关闭贴图。
- 快捷键隐藏/显示所有贴图。
- 截图完成后可自动贴图。

## 水印功能

水印用于保留截图时间、地点、项目和备注信息。

可配置项：

- 开启或关闭水印。
- 默认地点。
- 默认项目。
- 备注。
- 水印位置：左上、右上、左下、右下、底部横条。

水印会在最终保存和复制的图片中合成。

## 本地数据

抓个屏是本地软件，不需要云端账号。

开发版默认数据目录：

```text
E:\jietu-shiyou-2026\.runtime
```

安装版默认数据目录：

```text
%APPDATA%\抓个屏
```

主要内容：

```text
local\data\history.json
local\data\recordings.json
local\screenshots\
local\screenshots\recordings\
electron-profile\
temp-captures\
```

其中：

- `history.json` 保存截图历史元数据。
- `recordings.json` 保存本地录屏历史元数据。
- `screenshots` 保存截图图片。
- `screenshots/recordings` 默认保存 MP4 录屏文件。
- `electron-profile` 保存 Electron 本地配置和缓存。
- `temp-captures` 保存临时捕获文件。

## URL 协议

安装版会注册以下协议：

```text
zhuageping://
zhuageping://capture
zhuageping://pin
```

用途：

- `zhuageping://` 打开软件。
- `zhuageping://capture` 触发截图。
- `zhuageping://pin` 贴出最近一张截图。

## 开发环境

推荐环境：

- Windows 10 或 Windows 11
- Node.js 20+
- npm
- Git

安装依赖：

```bash
npm install
```

开发启动：

```bash
npm run dev
```

普通 Electron 启动：

```bash
npm start
```

## 验证命令

类型检查：

```bash
npm run typecheck
```

单元测试：

```bash
npm test
```

生产构建：

```bash
npm run build
```

生成 Windows 安装包：

```bash
npm run dist
```

安装包输出目录：

```text
release/
```

## 项目结构

```text
src/
  main/
    main.ts               Electron 主进程
    overlay/              原地截图编辑器与录屏覆盖层
    pin/                  桌面贴图窗口
    assets/               主进程资源
  preload/
    preload.ts            安全桥接 API
  renderer/
    App.tsx               首选项与主界面
    components/           React 组件
    styles/               UI 样式
    assets/               Logo 与二维码资源
docs/
  PRD.md                  产品需求文档
build/
  icon.ico                Windows 安装包图标
  license_zh_CN.txt       简体中文安装协议
  license_en_US.txt       英文安装协议
scripts/
  copy-overlay-assets.js  构建资源复制脚本
  generate-icons.js       图标生成脚本
  prepare-ocr-engine.js   OCR 引擎准备脚本
  build-hotkey-guard.js   Windows 热键守护构建脚本
  build-recorder-host.js  Windows 原生录屏宿主构建脚本
native/
  hotkey-guard/           Windows F1 热键守护
  recorder-host/          Media Foundation/WASAPI 录屏进程
```

## 技术栈

- Electron
- React
- TypeScript
- electron-vite
- electron-builder
- Sharp
- RapidOCR-json
- .NET Windows 热键守护
- ScreenRecorderLib、Microsoft Media Foundation 与 WASAPI
- Node.js test runner

## 打包说明

安装包由 `electron-builder` 生成，当前配置包含：

- Windows NSIS 安装器。
- 安装器中英文语言选择。
- 中英文安装许可协议。
- 应用图标。
- 桌面快捷方式。
- 开始菜单快捷方式。
- `zhuageping://` 协议注册。
- 应用名称、版权和商标信息。
- Sharp 原生依赖解包配置。
- RapidOCR-json Node 依赖解包配置。
- RapidOCR-json exe 和模型资源打包配置。
- Windows 热键守护组件打包配置。
- 自包含 Windows 原生录屏进程及第三方许可说明。

打包命令：

```bash
npm run dist
```

生成文件示例：

```text
release/zhuageping-Setup-0.1.15-x64.exe
release/zhuageping-Setup-0.1.15-x64.exe.blockmap
release/win-unpacked/
```

## 常见问题

### F1 快捷键没有反应

可能原因：

- 旧版本抓个屏还在后台运行。
- 其他软件占用了 `F1`。
- 当前进程不是最新开发版或安装版。

可尝试：

- 退出托盘中的抓个屏后重新打开。
- 在首选项中修改快捷键。
- 如果当前浏览器或业务软件以管理员身份运行，请在抓个屏中使用“以管理员身份重启”。
- 检查是否同时运行了开发版和安装版。

### OCR 无法使用

安装版正常情况下已内置 OCR 引擎和模型，不需要用户下载。

如果仍提示未找到 OCR 引擎，请检查安装目录中是否存在：

```text
resources/ocr/RapidOCR-json/RapidOCR_json.exe
resources/ocr/RapidOCR-json/models/
```

### 安装包提示未知发布者

当前安装包未进行商业代码签名。正式商用分发时建议购买 Windows 代码签名证书，以减少 SmartScreen 或未知发布者提示。

### 全屏录制无法结束

- 再按一次 `F2` 停止并保存。
- 使用临时全局备用键 `Esc`。
- 右键托盘图标，选择“停止录屏”。
- 如果安装版和开发版同时运行，请退出旧进程，避免多个实例争抢快捷键。

### 截图出现短暂停顿

Windows 屏幕捕获在部分显卡、远程桌面、多屏缩放环境下可能出现短暂延迟。当前版本优先使用 Windows GDI 捕获，降低 Electron DXGI 捕获失败对体验的影响。

### 双屏或高 DPI 下裁剪不准

当前版本已加入跨屏和高 DPI 坐标转换测试。如果仍然出现偏移，请记录：

- Windows 缩放比例。
- 显示器排列方式。
- 主屏和副屏分辨率。
- 截图区域是否跨屏。

## 隐私说明

抓个屏不提供云端同步，也不会主动上传截图内容。

本地保存内容包括：

- 截图图片。
- MP4 录屏文件和录屏历史元数据。
- 截图历史元数据。
- 用户配置。
- Electron 本地缓存。
- OCR 临时识别图片。

OCR 临时识别图片仅用于本机识别流程，处理后会自动删除。
电脑声音与麦克风数据只会写入本地录屏文件，不会上传。

用户可以在首选项中打开截图保存目录，也可以手动删除本地数据。

## 版本计划

近期方向：

- OCR 结果区域反选与文本块定位。
- OCR 识别语言配置。
- 完善对象级编辑能力。
- 优化文字输入和长文本排版。
- 增强马赛克、模糊、编号标注体验。
- 增加更多截图模式。
- 增加更新检查和版本发布流程。
- 补充更多真实交互 QA 用例。

## 版权

Copyright © 2026 齐世有. All rights reserved.

未经作者书面许可，不得反向工程、复制、修改、分发或用于其他商业再发布用途。
