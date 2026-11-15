# 大肥鱼终端背景水印

[English](README.md)

把 electerm 自带的白色 `electerm` 字标换成**像素风大肥鱼（DeepSeek 鲸鱼娘）**。先把立绘像素化，再做成低对比度水印——不是细碎的线稿，也不是模糊的缩略图。

直接用浏览器打开 [`preview.html`](preview.html)，可以在六种终端主题下对比两种水印风格，还能看到第一步生成的 8 色像素画。

| | |
| --- | --- |
| 形态 | instance widget，一个开关 + 两个数值调节项 + 两种风格 |
| 需要 | 带 **设置 → Widgets** 的 electerm |
| 素材 | `assets/fatfish-pixel-art.png`（彩色）+ `assets/fatfish-watermark.png`（蒙版） |
| 单测 | `npm test`，10 条，零依赖，不用安装 |
| 重新生成 | `npm run build`，零依赖，不需要网络 |

## 安装

**设置 → Widgets → Import**，粘贴：

```text
electerm/electerm-widget-fatfish-watermark
```

也可以用 **Import folder** 指向本地克隆。

## 使用

**设置 → Widgets → Fatfish Terminal Watermark → Start widget**。保持 *Apply on launch* 开启，electerm 的自动运行列表会在每次启动时重新应用；在 *Running instances* 里点 **Stop** 即可撤掉。

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| Artwork style | 彩色像素画 | 8 色像素画，或跟随主题色的单色蒙版。 |
| Opacity (%) | 20 | 浓度，限制在 5–60；彩色风格会自动乘 1.4 倍。 |
| Height (%) | 78 | 相对终端面板的高度，宽度按图片比例自动计算。 |
| Apply on launch | 开 | 把插件放进 electerm 的自动运行列表。 |

## 两步生成

`tools/build-watermark.js` 是一个零依赖的 PNG 编解码器（node:zlib）加两遍 RGBA 运算，两张产物都是 510 × 680，可复现。

1. **像素化**：把 `assets/source-front.png`（MIT 授权的 Q 版立绘）降到 51 × 68 的网格。每格取合成到白底后的平均颜色，再吸附到 8 色调色板：深蓝头发、亮蓝发梢、白色头饰与围裙、深色描边、肤色、金色装饰。每格放大成 10px 实心方块，得到透明背景的清爽像素画 → `assets/fatfish-pixel-art.png`。
2. **水印化**：按每格颜色映射到 6 档墨色（`0 / .13 / .34 / .58 / .82 / .98`），用中性灰 `#8f8f8f` 画在透明底上，得到只靠 alpha 表达形状的蒙版 → `assets/fatfish-watermark.png`（约 7 KB）。

想换像素颗粒度：`npm run build -- --grid=64x85 --cell=8`。
`node tools/build-watermark.js --style=line` 会重建之前的 Sobel 线稿版本作对比（只覆盖蒙版）。

## 为什么能适配各种背景色

默认字标是一张固定的近白色 PNG，浅色主题下几乎看不见。这里提供两种解法：

- **彩色像素画（默认）**：墨色从白色头饰／围裙一路到接近黑色的描边，明度跨度大，所以深色、浅色、彩色终端背景下都至少有一部分能形成对比。透明度 28%，始终在文字后面。
- **主题色蒙版**：单色 PNG 作为 CSS `mask-image`，用 electerm 自己的主题变量 `var(--text, #dddddd)` 上色。文字色本来就必须和终端背景有对比度，水印因此严格跟随主题，不用靠 `mix-blend-mode` 碰运气。

单色 PNG 本身是中性灰，所以不装插件、直接在「设置 → 终端背景」里选这个文件，黑白背景下也都看得见。

### 不会覆盖你自己的背景设置

插件的 UI 是沙箱 iframe，碰不到应用 DOM；`main.js` 跑在主进程，用 `webContents.insertCSS()` 从外部给窗口注入样式。另一段很短的 renderer 脚本会读取 electerm 自己的 `#css-overwrite-terminal-backgrounds` 样式表，在 `<html>` 上写两个属性：`data-fatfish-style`（表单里选的风格）和 `data-fatfish-watermark`：

- 当前是自带默认字标 → `"on"`，我们的样式生效；
- 你自己设了背景图、文字水印、标签序号或「无背景」 → `"off"`，整段样式不再匹配。

这个开关是绑在该 `<style>` 标签上的 `MutationObserver`，改背景设置会立刻生效。注入的样式表只属于当前文档，因此每次窗口重载都会重新注入，之后新开的窗口也会覆盖到。

## 关于素材

这只鲸鱼娘是社区二创形象，**不是** DeepSeek 官方素材。来源、许可、修改说明和需要保留的署名都在 [NOTICE.md](NOTICE.md)。本仓库代码为 MIT，素材沿用上游 MIT 许可。

## 其他说明

- 独立工作：不读写内置的 **设置 → 通用 → 自定义 CSS**，也不改任何终端背景设置。electerm 只会保存插件自己的自动运行条目和表单值。
- **Stop 能干净移除**：每个窗口的 `insertCSS` key 都会保留，插入操作按窗口排队，不会因为两次并发插入留下删不掉的样式表。
- 两张 PNG 都以 data URL 内嵌，整份注入样式表约 22 KB——有限调色板比之前的线稿压缩率高得多。

## 许可

代码 MIT。素材的上游 MIT 许可与署名要求见 [NOTICE.md](NOTICE.md)。
