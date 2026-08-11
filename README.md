# 抓个屏

抓个屏是一款面向 Windows 的本地截图、标注、贴图与时间地点水印工具。软件不依赖云端服务，截图、历史记录、配置和贴图都保存在本机，适合工作留痕、项目验收、客服沟通、远程协作和日常截图标注。

作者：齐世有  
邮箱：blacklaw@foxmail.com

## 下载

最新版安装包请在 GitHub Releases 下载：

[下载抓个屏 Windows 安装包](https://github.com/ShiyouQi888/zhuageping/releases/latest)

当前版本：

- 版本：`0.1.0`
- 平台：Windows x64
- 安装包：`zhuageping-Setup-0.1.0-x64.exe`
- SHA256：`6C2857069D50FE4B98755F3421428269CD0BBE27A0C614B004358A8590BE19D9`

说明：当前安装包暂未购买代码签名证书。安装时 Windows 可能提示未知发布者，这是未签名安装包的正常现象，不代表软件连接云端或上传数据。

## 核心功能

- 区域截图：按 `F1` 进入透明截图层，拖拽框选截图区域。
- 截图并复制：按 `Ctrl+F1` 截图完成后自动写入剪贴板。
- 自定义截图：按 `Shift+F1` 进入区域截图流程。
- 贴图：按 `F3` 将截图固定到桌面，方便对照资料。
- 隐藏/显示贴图：按 `Shift+F3` 快速切换所有贴图窗口。
- 原地编辑：截图后直接在选区内添加标注，不打开独立编辑窗口。
- 标注工具：矩形、圆形、直线、箭头、画笔、文字、编号、马赛克、模糊块、橡皮擦。
- 对象编辑：标注对象可选中、移动、缩放和二次编辑。
- 隐私处理：马赛克和模糊块会合成到最终截图中。
- 保存与复制：截图完成后默认保存到本地，并写入系统剪贴板。
- 时间地点水印：可开启/关闭，可配置地点、项目、备注和水印位置。
- 截图历史：本地保存截图历史，便于预览、复制和打开所在文件夹。
- 托盘菜单：支持从系统托盘快速截图、贴图、打开首选项、重启和退出。
- 开机自启：可在首选项中开启或关闭。
- 管理员重启：可从软件内以管理员身份重启。
- 本地运行：无云端账号、无远程同步、无上传行为。

## 截图工作流

1. 按 `F1` 进入截图模式。
2. 在当前屏幕上拖拽选择截图区域。
3. 选区下方出现编辑工具栏。
4. 在截图区域内添加文字、箭头、矩形、马赛克、模糊等标注。
5. 可继续拖拽选区边缘调整裁剪范围。
6. 点击复制、贴图、保存或完成。

设计原则：

- 选区代表最终裁剪边界。
- 标注对象独立于选区保存。
- 调整选区大小时，不会把已经画好的矩形、文字、箭头拉伸变形。
- 最终保存时，会按当前选区裁剪并合成标注、水印、马赛克和模糊效果。

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 截图 | `F1` |
| 截图并自动复制 | `Ctrl+F1` |
| 自定义截图 | `Shift+F1` |
| 贴图 | `F3` |
| 隐藏/显示所有贴图 | `Shift+F3` |
| 完成截图 | `Enter` |
| 取消截图 | `Esc` |
| 复制截图 | `Ctrl+C` |

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
| 删除选中对象 | `Delete` / `Backspace` |

快捷键可在首选项的“控制”页面中调整。

## 贴图功能

贴图窗口用于把截图固定在桌面上，常见用途包括对照资料、临摹 UI、核对表格、暂存截图信息。

已支持：

- 鼠标滚轮缩放贴图。
- 右键菜单保存图片。
- 右键菜单复制图片。
- 右键菜单打开所在文件夹。
- 右键菜单关闭贴图。
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
local\screenshots\
electron-profile\
temp-captures\
```

其中：

- `history.json` 保存截图历史元数据。
- `screenshots` 保存截图图片。
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
    overlay/              原地截图编辑器
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
  license.txt             安装协议
scripts/
  copy-overlay-assets.js  构建资源复制脚本
  generate-icons.js       图标生成脚本
```

## 技术栈

- Electron
- React
- TypeScript
- electron-vite
- electron-builder
- Sharp
- Node.js test runner

## 打包说明

安装包由 `electron-builder` 生成，当前配置包含：

- Windows NSIS 安装器。
- 应用图标。
- 安装协议。
- 桌面快捷方式。
- 开始菜单快捷方式。
- `zhuageping://` 协议注册。
- 应用名称、版权和商标信息。
- Sharp 原生依赖解包配置。

打包命令：

```bash
npm run dist
```

生成文件示例：

```text
release/zhuageping-Setup-0.1.0-x64.exe
release/zhuageping-Setup-0.1.0-x64.exe.blockmap
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
- 检查是否同时运行了开发版和安装版。

### 安装包提示未知发布者

当前安装包未进行商业代码签名。正式商用分发时建议购买 Windows 代码签名证书，以减少 SmartScreen 或未知发布者提示。

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
- 截图历史元数据。
- 用户配置。
- Electron 本地缓存。

用户可以在首选项中打开截图保存目录，也可以手动删除本地数据。

## 版本计划

近期方向：

- 完善对象级编辑能力。
- 优化文字输入和长文本排版。
- 增强马赛克、模糊、编号标注体验。
- 增加更多截图模式。
- 增加更新检查和版本发布流程。
- 补充更多真实交互 QA 用例。

## 版权

Copyright © 2026 齐世有. All rights reserved.

未经作者书面许可，不得反向工程、复制、修改、分发或用于其他商业再发布用途。
