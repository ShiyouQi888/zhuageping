<p align="center">
  <strong>English</strong>
  ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="src/renderer/assets/app-logo.png" width="96" alt="Zhuageping Logo" />
</p>

<h1 align="center">Zhuageping</h1>

<p align="center">
  A local Windows screenshot, annotation, pinning, scrolling capture, watermark, and OCR tool.
</p>

<p align="center">
  <a href="https://github.com/ShiyouQi888/zhuageping/releases/latest">Download Latest</a>
  ·
  <a href="#core-features">Features</a>
  ·
  <a href="#default-shortcuts">Shortcuts</a>
  ·
  <a href="#privacy">Privacy</a>
</p>

Zhuageping is a local-first screenshot tool for Windows. It does not depend on cloud services. Screenshots, history, settings, pinned images, and OCR recognition all run on your own machine, making it useful for work records, project acceptance, customer support, remote collaboration, reference comparison, and daily screenshot annotation.

Author: Qi Shiyou  
Email: blacklaw@foxmail.com

## Download

Download the latest installer from GitHub Releases:

[Download Zhuageping for Windows](https://github.com/ShiyouQi888/zhuageping/releases/latest)

Current version:

- Version: `0.1.8`
- Platform: Windows x64
- Installer: `zhuageping-Setup-0.1.8-x64.exe`
- SHA256: `85967BED47FD9D07064B0F20062E79358F7897B4177371D961A4FA3DBDF4AE5E`
- Release: [Zhuageping v0.1.8](https://github.com/ShiyouQi888/zhuageping/releases/tag/v0.1.8)

Note: the current installer is not signed with a commercial code-signing certificate. Windows may show an unknown publisher warning during installation. This is expected for an unsigned installer and does not mean the app connects to the cloud or uploads your data.

## Latest Updates

Highlights in `v0.1.8`:

- GitHub Releases auto-update: packaged builds can check, download, and install new versions.
- Preferences update panel: shows the current version, latest version, update source, download progress, and restart-to-install action.
- Tray update entry: check for updates even when the preferences window is hidden.
- Multi-monitor capture isolation: pressing F1 only affects the display where the cursor is located.
- Capture toolbar polish: warmer brand styling and refined icons for a cleaner annotation workflow.
- Multilingual installer: choose Simplified Chinese or English before installation starts.
- Multilingual license agreement: the installer license follows the selected language.
- English UI layout improvements: preferences window, tabs, buttons, status bar, and long text are optimized to avoid truncation.
- F1 shortcut enhancement: a Windows hotkey guard gives Zhuageping priority over browser F1 help shortcuts.
- Packaging improvements: releases include OCR resources and the hotkey guard component.
- Existing OCR features remain available: current capture region OCR, auto-copy, result dialog, and bundled local models.

## Core Features

- Region capture: press `F1` to open the transparent capture overlay and drag to select a region.
- Window auto-detection: hover a window during capture to highlight it, then click to select it.
- Capture and copy: press `Ctrl+F1` to capture and copy the result to the clipboard.
- Custom capture: press `Shift+F1` to enter the region capture flow.
- Scrolling capture: press `Ctrl+Shift+F1` to select a scrollable area and stitch a long screenshot.
- OCR recognition: recognize text from the current capture region, copy it automatically, and show the result dialog.
- In-place editing: annotate directly inside the selected region without opening a separate editor window.
- Annotation tools: rectangle, ellipse, line, arrow, pen, text, numbered label, mosaic, blur block, and eraser.
- Object editing: select, move, resize, copy, delete, layer, and edit annotation objects again.
- Tool state bar: color presets, line width presets, text size, bold, text background, text outline, mosaic strength, and blur strength.
- Privacy tools: mosaic and blur blocks are merged into the final image, so save, copy, and pin results stay consistent.
- Pin images: press `F3` to pin the latest screenshot to the desktop for reference.
- Pin enhancements: mouse-wheel zoom, opacity, lock, always-on-top, mouse pass-through, copy, open file, and close.
- Show or hide all pins: press `Shift+F3` to toggle all pinned image windows.
- Time and location watermark: enable or disable it, configure location, project, note, and watermark position.
- Screenshot history: local screenshot history for previewing, copying, and opening the containing folder.
- File naming: screenshots are saved as `Zhuageping-YYYYMMDD-HHMMSS-###`, for example `Zhuageping-20260812-132746-001.png`.
- Tray menu: capture, pin, open preferences, restart, and quit from the system tray.
- Startup option: enable or disable launch at startup in preferences.
- Administrator restart: restart the app as administrator from inside the app.
- Local-first: no cloud account, no remote sync, no upload behavior.

## Screenshot Workflow

1. Press `F1` to enter capture mode.
2. Drag to select a region, or move the mouse over a window and click the auto-detected region.
3. The screenshot editing toolbar appears below the selection.
4. Add text, arrows, rectangles, mosaic, blur, and other annotations inside the current capture region.
5. To recognize text, click OCR or press `Ctrl+Shift+O`.
6. Click copy, pin, save, or finish.

Design rules:

- The selected region is the final crop boundary.
- Annotation objects are independent from the selected region.
- Resizing the selection does not stretch existing rectangles, text, or arrows.
- The final image is cropped from the current selection and merged with annotations, watermark, mosaic, and blur.
- OCR runs on the current capture region base image plus privacy processing, without treating arrows or red boxes as recognition targets.

## Default Shortcuts

| Action | Shortcut |
| --- | --- |
| Capture | `F1` |
| Capture and auto copy | `Ctrl+F1` |
| Custom capture | `Shift+F1` |
| Scrolling capture | `Ctrl+Shift+F1` |
| OCR current capture region | `Ctrl+Shift+O` |
| Pin latest screenshot | `F3` |
| Show or hide all pins | `Shift+F3` |
| Finish capture | `Enter` |
| Cancel capture | `Esc` |
| Copy screenshot | `Ctrl+C` |
| Save screenshot | `Ctrl+S` |

Screenshot editor shortcuts:

| Tool | Shortcut |
| --- | --- |
| Select | `V` |
| Rectangle | `R` |
| Ellipse | `O` |
| Line | `L` |
| Arrow | `A` |
| Pen | `B` |
| Text | `T` |
| Mosaic | `M` |
| Blur block | `U` |
| Eraser | `E` |
| Select all objects | `Ctrl+A` |
| Duplicate object | `Ctrl+D` |
| Delete selected object | `Delete` / `Backspace` |
| Undo | `Ctrl+Z` |

Shortcuts can be customized in the Controls page of Preferences.

## OCR

Zhuageping uses RapidOCR-json as the local OCR engine.

Supported:

- OCR for the current capture region.
- Automatic copy of recognition results to the clipboard.
- Result dialog inside the capture overlay.
- Bundled OCR executable and model files in the installer.
- No network connection, no account, and no image upload required.

Packaged OCR resource location:

```text
resources/ocr/RapidOCR-json/
  RapidOCR_json.exe
  models/
    ch_PP-OCRv3_det_infer.onnx
    ch_PP-OCRv3_rec_infer.onnx
    ch_ppocr_mobile_v2.0_cls_infer.onnx
    ppocr_keys_v1.txt
```

In development, the OCR engine can be placed at:

```text
.runtime/ocr-v0.1.0/RapidOCR-json/
```

Before packaging, run:

```bash
npm run prepare:ocr
```

The script copies the local OCR engine to `build/ocr`, which is then bundled by `electron-builder`.

## Pinned Images

Pinned image windows keep screenshots on the desktop. Common uses include comparing references, tracing UI, checking tables, and temporarily holding screenshot information.

Supported:

- Mouse-wheel zoom for pinned images.
- Hover toolbar.
- Lock and unlock pins.
- Always-on-top toggle.
- Mouse pass-through toggle.
- Opacity control.
- Save image from the context menu.
- Copy image from the context menu.
- Open containing folder from the context menu.
- Close pin.
- Shortcut to show or hide all pins.
- Optional auto-pin after capture.

## Watermark

The watermark records screenshot time, location, project, and note information.

Configurable options:

- Enable or disable watermark.
- Default location.
- Default project.
- Note.
- Watermark position: top left, top right, bottom left, bottom right, or bottom bar.

The watermark is merged into the final saved and copied image.

## Local Data

Zhuageping is a local app and does not require a cloud account.

Development data directory:

```text
E:\jietu-shiyou-2026\.runtime
```

Installed app data directory:

```text
%APPDATA%\抓个屏
```

Main contents:

```text
local\data\history.json
local\screenshots\
electron-profile\
temp-captures\
```

Details:

- `history.json` stores screenshot history metadata.
- `screenshots` stores screenshot images.
- `electron-profile` stores Electron local settings and cache.
- `temp-captures` stores temporary capture files.

## URL Protocol

The installed app registers:

```text
zhuageping://
zhuageping://capture
zhuageping://pin
```

Usage:

- `zhuageping://` opens the app.
- `zhuageping://capture` triggers capture.
- `zhuageping://pin` pins the latest screenshot.

## Development

Recommended environment:

- Windows 10 or Windows 11
- Node.js 20+
- npm
- Git

Install dependencies:

```bash
npm install
```

Start development mode:

```bash
npm run dev
```

Start plain Electron:

```bash
npm start
```

## Verification

Type check:

```bash
npm run typecheck
```

Unit tests:

```bash
npm test
```

Production build:

```bash
npm run build
```

Build the Windows installer:

```bash
npm run dist
```

Installer output directory:

```text
release/
```

## Project Structure

```text
src/
  main/
    main.ts               Electron main process
    overlay/              In-place screenshot editor
    pin/                  Desktop pinned image window
    assets/               Main-process assets
  preload/
    preload.ts            Secure bridge API
  renderer/
    App.tsx               Preferences and main UI
    components/           React components
    styles/               UI styles
    assets/               Logo and QR code assets
docs/
  PRD.md                  Product requirements document
build/
  icon.ico                Windows installer icon
  license_zh_CN.txt       Simplified Chinese installer license
  license_en_US.txt       English installer license
scripts/
  copy-overlay-assets.js  Build asset copy script
  generate-icons.js       Icon generation script
  prepare-ocr-engine.js   OCR engine preparation script
  build-hotkey-guard.js   Windows hotkey guard build script
native/
  hotkey-guard/           Windows F1 hotkey guard
```

## Tech Stack

- Electron
- React
- TypeScript
- electron-vite
- electron-builder
- Sharp
- RapidOCR-json
- .NET Windows hotkey guard
- Node.js test runner

## Packaging

The installer is generated by `electron-builder` and currently includes:

- Windows NSIS installer.
- Chinese and English language selection.
- Chinese and English installer license agreements.
- App icon.
- Desktop shortcut.
- Start menu shortcut.
- `zhuageping://` protocol registration.
- App name, copyright, and trademark metadata.
- Sharp native dependency unpacking.
- RapidOCR-json Node dependency unpacking.
- RapidOCR-json executable and model resources.
- Windows hotkey guard component.

Build command:

```bash
npm run dist
```

Generated files:

```text
release/zhuageping-Setup-0.1.8-x64.exe
release/zhuageping-Setup-0.1.8-x64.exe.blockmap
release/win-unpacked/
```

## FAQ

### F1 does not trigger capture

Possible causes:

- An older Zhuageping process is still running in the background.
- Another app has occupied `F1`.
- The current process is not the latest development or installed build.

Try:

- Quit Zhuageping from the tray and reopen it.
- Change the shortcut in Preferences.
- If the current browser or business app is running as administrator, restart Zhuageping as administrator too.
- Check whether the development and installed versions are running at the same time.

### OCR is unavailable

The installed version should include the OCR engine and models. Users do not need to download them manually.

If OCR still reports a missing engine, check whether the installation directory contains:

```text
resources/ocr/RapidOCR-json/RapidOCR_json.exe
resources/ocr/RapidOCR-json/models/
```

### The installer shows an unknown publisher warning

The current installer is not commercially code-signed. For commercial distribution, a Windows code-signing certificate is recommended to reduce SmartScreen and unknown publisher warnings.

### Capture has a short delay

Windows screen capture may briefly pause on some GPUs, remote desktop sessions, and multi-monitor scaling setups. The current version prioritizes Windows GDI capture to reduce the impact of Electron DXGI capture failures.

### Cropping is inaccurate on multi-monitor or high-DPI setups

The current version includes coordinate conversion tests for multi-monitor and high-DPI environments. If offset issues still occur, record:

- Windows scaling ratio.
- Monitor arrangement.
- Primary and secondary monitor resolutions.
- Whether the capture region crosses displays.

## Privacy

Zhuageping does not provide cloud sync and does not upload screenshot content.

Local data includes:

- Screenshot images.
- Screenshot history metadata.
- User settings.
- Electron local cache.
- Temporary OCR recognition images.

Temporary OCR images are only used for local recognition and are deleted after processing.

Users can open the screenshot folder from Preferences and can manually delete local data.

## Roadmap

Near-term directions:

- OCR result region selection and text block positioning.
- OCR recognition language settings.
- More complete object-level editing.
- Better text input and long-text layout.
- Enhanced mosaic, blur, and numbered annotation interactions.
- More capture modes.
- Update checking and release workflow.
- More real-interaction QA cases.

## Copyright

Copyright © 2026 Qi Shiyou. All rights reserved.

Reverse engineering, copying, modification, distribution, or commercial redistribution without written permission from the author is prohibited.
