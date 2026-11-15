# 大肥鱼终端背景水印

[English](README.md)

把 electerm 自带的白色 `electerm` 字标换成**大肥鱼（DeepSeek 鲸鱼娘）线稿水印**。水印颜色跟随主题文字色，深色、浅色、彩色终端背景下都能看见，又不会抢文字。

直接用浏览器打开 [`preview.html`](preview.html)，可以在六种背景色上对比「主题色水印 / 直接用 PNG / 无水印」三种状态。

| | |
| --- | --- |
| 形态 | instance widget，一个开关 + 两个数值调节项 |
| 需要 | 带 **设置 → Widgets** 的 electerm |
| 附带素材 | `assets/fatfish-watermark.png`（510 × 680，透明 RGBA） |
| 单测 | `npm test`，零依赖，不用安装 |
| 重新生成图片 | `npm run build`，零依赖，不需要网络 |

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
| Opacity (%) | 20 | 水印浓度，限制在 5–60。 |
| Height (%) | 78 | 相对终端面板的高度，宽度按图片比例自动计算。 |
| Apply on launch | 开 | 把插件放进 electerm 的自动运行列表。 |

## 为什么能适配各种背景色

默认字标是一张固定的近白色 PNG，浅色主题下几乎看不见。这里的做法是把**形状**和**颜色**拆开：

- `assets/fatfish-watermark.png` 只提供形状：由开源 Q 版立绘经 `tools/build-watermark.js` 转成透明底线稿；
- 注入的 CSS 把它当作 `mask-image`，再用 electerm 自己的主题变量 `var(--text, #dddddd)` 给蒙版上色。文字色本来就必须和终端背景有对比度，水印因此自动获得同样的对比度，不需要靠 `mix-blend-mode` 碰运气；
- PNG 本身的墨色是中性灰 `#8f8f8f`，所以即使不装插件、直接在「设置 → 终端背景」里选这张图当背景，黑白背景下也都看得见。

核心样式（省略 `-webkit-` 前缀，占位符由 `main.js` 填充）：

```css
:root[data-fatfish-watermark="on"] #container .session-batch-active .xterm-screen::before {
  background-image: none !important;
  background-color: var(--text, #dddddd) !important;
  mask-image: url("…png data URL…");
  mask-size: auto 78%;
  mask-position: center;
  mask-repeat: no-repeat;
  opacity: 0.2;
}
```

### 不会覆盖你自己的背景设置

插件的 UI 是沙箱 iframe，碰不到应用 DOM；`main.js` 跑在主进程，用 `webContents.insertCSS()` 从外部给 electerm 窗口注入样式。另一段很短的 renderer 脚本会读取 electerm 自己的 `#css-overwrite-terminal-backgrounds` 样式表，只在 `<html>` 上写一个属性：

- 当前是自带默认字标 → `data-fatfish-watermark="on"`，我们的样式生效；
- 你自己设了背景图、文字水印、标签序号或「无背景」 → `"off"`，整段样式不再匹配。

这个开关是绑在该 `<style>` 标签上的 `MutationObserver`，所以在设置里改背景会立刻生效，不用重启插件。注入的样式表只属于当前文档，因此每次窗口重载都会重新注入，之后新开的窗口也会覆盖到。

## 关于素材

这只鲸鱼娘是社区二创形象，**不是** DeepSeek 官方素材。来源、许可、修改说明和需要保留的署名都在 [NOTICE.md](NOTICE.md)。本仓库代码为 MIT，素材沿用上游 MIT 许可。

## 其他说明

- 独立工作：不读写内置的 **设置 → 通用 → 自定义 CSS**，也不改任何终端背景设置。electerm 只会保存插件自己的自动运行条目和表单值。
- **Stop 能干净移除**：每个窗口的 `insertCSS` key 都会保留，插入操作按窗口排队，不会因为两次并发插入留下删不掉的样式表。
- 想复现 PNG 就跑 `npm run build`。`tools/build-watermark.js` 是一个零依赖的 PNG 编解码器（node:zlib）+ 2 倍放大 + Sobel 线稿提取 + alpha 量化，读取 `assets/source-front.png`，确定性地重建 `assets/fatfish-watermark.png`。

## 许可

代码 MIT。素材的上游 MIT 许可与署名要求见 [NOTICE.md](NOTICE.md)。
