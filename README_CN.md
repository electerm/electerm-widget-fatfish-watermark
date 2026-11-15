# 大肥鱼终端背景水印

[English](README.md)

把 electerm 自带的白色 `electerm` 字标换成**大肥鱼（DeepSeek 鲸鱼娘）**水印。两种风格：原始立绘（默认）和它的 8 色像素版。

直接用浏览器打开 [`preview.html`](preview.html)，可以在六种终端主题下对比两种风格和无水印基线。

| | |
| --- | --- |
| 形态 | instance widget，一个开关 + 两个数值调节项 + 两种风格 |
| 需要 | 带 **设置 → Widgets** 的 electerm |
| 素材 | `assets/source-front.png`（原始立绘，默认）+ `assets/fatfish-pixel-art.png`（像素画） |
| 单测 | `npm test`，11 条，零依赖，不用安装 |
| 重新生成 | `npm run build`，零依赖，不需要网络 |

## 安装

在 electerm 里打开 **设置 → Widgets → Online**，在列表里安装 *Fatfish Terminal
Watermark*。注册表固定了某个 commit，应用会在复制前逐个文件校验哈希。

也可以用 **设置 → Widgets → Import** 粘贴：

```text
electerm/electerm-widget-fatfish-watermark
```

或用 **Import folder** 指向本地克隆。

## 使用

**设置 → Widgets → Fatfish Terminal Watermark → Start widget**。保持 *Apply on launch* 开启，electerm 的自动运行列表会在每次启动时重新应用；在 *Running instances* 里点 **Stop** 即可撤掉。

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| Artwork style | Original PNG | 原始立绘，或它的 8 色像素版。 |
| Opacity (%) | 20 | 浓度，限制在 5–60；实际按 1.4 倍绘制，观感与之前的蒙版方案一致。 |
| Height (%) | 78 | 相对终端面板的高度，宽度按图片比例自动计算。 |
| Apply on launch | 开 | 把插件放进 electerm 的自动运行列表。 |

## 素材怎么来的

`tools/build-watermark.js` 是一个零依赖的 PNG 编解码器（node:zlib）加一遍 RGBA 运算。它只生成像素版，原始立绘直接按原样随仓库发布。

**像素化**：把 `assets/source-front.png`（MIT 授权的 Q 版立绘）降到 51 × 68 的网格。每格取合成到白底后的平均颜色，再吸附到 8 色调色板：深蓝头发、亮蓝发梢、白色头饰与围裙、深色描边、肤色、金色装饰。每格放大成 10px 实心方块，得到透明背景的清爽像素画 → `assets/fatfish-pixel-art.png`（510 × 680，约 7.6 KB）。

想换像素颗粒度：`npm run build -- --grid=64x85 --cell=8`。

### 原始 PNG（默认）

`Original PNG` 跳过像素化，直接画 `assets/source-front.png` 本身（255 × 340），高度上限就是它自己的 340px——终端窗口再高也不会把这张位图放大糊。

两种风格都是彩色图，因此都不使用 CSS 蒙版：立绘本身从白色头饰／围裙一路到接近黑色的描边，这个明度跨度就是它在各种背景下都看得清的原因。样式表只内嵌当前选中的那一张，所以注入体积是像素版 **12 KB**、原始版 **201 KB**，而不是每个窗口都塞 213 KB。

## 为什么能适配各种背景色

默认字标是一张固定的近白色 PNG，浅色主题下几乎看不见。两种风格解决方式是同一个：立绘里本来就有白色和接近黑色的部分，所以深色、浅色、彩色终端背景下都至少有一部分能形成对比。透明度 28%，始终在文字后面，并保留应用自己给这一层设的 `background-color: transparent !important`。

想要更块状、更扁平的外观，或者在意注入体积（12 KB），选像素版；默认选原始版，因为它就是那张画本身。

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
- 一种风格一张图，替换发生在拼装样式表之前：改表单只会读一个文件、重建一次样式表，窗口里不会带着它没在显示的那张图。

## 许可

代码 MIT。素材的上游 MIT 许可与署名要求见 [NOTICE.md](NOTICE.md)。
