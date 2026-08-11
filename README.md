# 抓个屏

Windows 本地截图、贴图与水印工具。

作者：齐世有  
邮箱：blacklaw@foxmail.com

## 当前能力

- Electron + React + TypeScript 桌面应用。
- 区域截图。
- 自动写入时间、地点、项目、备注水印。
- 水印位置支持左上、右上、左下、右下、底部横条。
- 截图保存为 PNG。
- 本地 JSON 历史记录。
- 图片预览、复制到剪贴板、打开所在文件夹。
- 不依赖云端服务。

## 开发启动

```bash
npm install
npm run dev
```

开发服务地址：

```text
http://localhost:5173/
```

Electron 会自动打开桌面窗口。

## 验证命令

```bash
npm run typecheck
npm run build
```

## Windows 安装包

```bash
npm run dist
```

安装包输出到：

```text
release/
```

协议唤起：

```text
zhuageping://
zhuageping://capture
zhuageping://pin
```

## 本地数据

应用运行时数据默认保存在 Electron 用户数据目录旁边的：

```text
jietu-shiyou-2026-local
```

其中包含：

```text
data/history.json
screenshots/*.png
```

## 下一阶段建议

- 实现区域截图透明选区。
- 实现当前窗口截图。
- 完善标注编辑器：箭头、矩形、文字、马赛克、模糊、贴图。
- 将 JSON 历史迁移到 SQLite。
- 增加托盘常驻和全局快捷键。
- 增加安装包构建。
