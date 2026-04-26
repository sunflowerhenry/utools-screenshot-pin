# uTools 截图贴图插件

一个轻量的 uTools 截图工具插件，支持截图后编辑、复制、保存，以及将截图悬浮为贴图窗口。

## 功能

- 截图后编辑：画笔、直线、箭头、矩形、圆形、打码、数字标注、文字。
- 自建截图选择层：拖选区域、调整选区、实时显示像素尺寸。
- 贴图：直接读取剪贴板图片或文本悬浮，也可在编辑后点击贴图按钮悬浮。
- 贴图窗口：置顶、拖动、缩放、透明度调节、复制、关闭。
- 关键词精简：`截图`、`贴图`、`截图工具设置`。

## 调试

1. 打开 uTools 开发者工具。
2. 选择当前目录导入插件。
3. 在 uTools 输入框中使用 `截图` 或 `贴图`。
4. 如需快捷键，在 uTools 设置的全局功能中给对应关键词绑定快捷键。

## 文件结构

- `plugin.json`：uTools 插件配置。
- `launcher.html` / `launcher.css` / `launcher.js`：uTools 小入口窗口。
- `index.html`：兼容入口，避免旧配置继续打开编辑主面板。
- `selection.html` / `selection.css` / `selection.js` / `selection-preload.js`：自建截图选择层。
- `editor.html` / `editor.css` / `editor.js`：独立截图编辑窗口。
- `preload.js`：截图、保存、复制、剪贴板贴图、窗口创建等 uTools/Electron 能力。
- `pin.html` / `pin.css` / `pin.js` / `pin-preload.js`：贴图悬浮窗口。
- `logo.png`：插件图标，尺寸为 256 x 256 PNG。
