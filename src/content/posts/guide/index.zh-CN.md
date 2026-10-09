---
title: "Shirone 写作与使用指南"
published: 2026-08-26
updated: 2026-08-26
pinned: true
description: "关于文章创作、frontmatter 规范、Markdown 扩展、加密与媒体的完整指南。"
image: "./cover.jpeg"
tags: ["Shirone", "Guide", "Markdown", "M3E", "Blogging"]
category: Guides
draft: false
---

欢迎使用 **Shirone**（白音）——一个富有表现力的、以动漫为灵感的博客主题，围绕 **Astro 7**、**Svelte 5** 与 Material 3 Expressive（M3E）设计系统构建。

本指南带你了解文章创建、frontmatter 规范、目录结构，以及全套内置的 Markdown 与 MDX 扩展。

:::tip
Shirone 优先以服务端方式渲染内容（SSR-first）。站内导航时，Swup 会平滑替换主容器，同时保留外层应用外壳与连续播放的背景音乐。
:::

---

## 1. 创建新文章

使用内置的 CLI 命令，可以快速生成一篇带标准 frontmatter 的新文章：

```bash
# 创建单文件文章
pnpm new-post my-first-post

# 或在子目录中创建文章
pnpm new-post guides/getting-started
```

新创建的文件会放置在 `src/content/posts/` 下。

---

## 2. Frontmatter 规范

每篇 Markdown（`.md`）或 MDX（`.mdx`）文章都以一个 YAML frontmatter 块开头，用于定义其元信息。

### 示例

```yaml
---
title: "探索 Material 3 Expressive 设计"
published: 2026-08-26
updated: 2026-08-27
publishedAt: 2026-08-26T10:00:00+08:00
updatedAt: 2026-08-27T09:30:00+08:00
pinned: true
description: "深入解读 Shirone 中的动态 HCT 色彩科学与流式动效。"
image: "./cover.webp"
tags: [M3E, Design, Frontend]
category: Guides
draft: false
comment: true
---
```

### 支持的 Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `title` | `string` | **是** | 文章主标题。 |
| `published` | `Date` | **是** | 发布日期，`YYYY-MM-DD` 格式。 |
| `publishedAt` | `Date` | 否 | 精确发布时刻，用于对同一天发布的文章排序。必须落在 `published` 当天（按站点配置的时区）。 |
| `updated` | `Date` | 否 | 最后更新日期。提供后会显示更新提示徽标。 |
| `updatedAt` | `Date` | 否 | 精确更新时刻，供 feed 与机器可读元数据使用。必须与 `updated` 同时提供。 |
| `pinned` | `boolean` | 否 | 将文章置顶到文章列表顶部（默认：`false`）。 |
| `description` | `string` | 否 | 文章摘要，展示在文章卡片、搜索结果与 OpenGraph 元数据中。 |
| `image` | `string` | 否 | 封面图片路径。支持相对路径（`./cover.webp`）、public 路径（`/images/cover.jpg`）或远程 URL。 |
| `tags` | `string[]` | 否 | 标签名数组，用于分类过滤与标签云。 |
| `category` | `string` | 否 | 主分类名称，用于分类索引。 |
| `draft` | `boolean` | 否 | 标记为草稿。草稿文章在生产构建（`pnpm build`）中隐藏。 |
| `comment` | `boolean` | 否 | 针对本篇文章开关评论区（默认：`true`）。 |
| `lang` | `string` | 否 | 语言代码（如 `en`、`zh_CN`、`ja`），当与站点默认语言不同时提供。 |

---

## 3. 文章加密

Shirone 提供客户端文章加密。这是一个静态密码闸门，而不是服务端访问控制：加密负载与资源 URL 仍是公开可下载的，因此不要用它来保护真正机密的文件或受监管的秘密。对于私人日记或受限文章，可在 frontmatter 中指定密码：

```yaml
---
title: "私人研究笔记"
published: 2026-08-26
encrypted: true
password: "your-secret-passphrase"
passwordHint: "Favorite anime character"
hideHomeContent: true
---
```

- `encrypted`：设为 `true` 启用加密；
- `password`：解锁文章所需的口令字符串或数字；
- `passwordHint`：密码输入框上方显示的可选提示；
- `hideHomeContent`：在首页隐藏字数与内容预览，防止数据泄露。

---

## 4. 组织文章文件

Shirone 同时支持文件夹共置与单文件两种布局：

### 文件夹结构（推荐用于本地资源）

把文章与它的媒体文件放在一起，资源管理非常直观：

```text
src/content/posts/
├── my-great-post/
│   ├── index.md           <-- 文章内容
│   ├── cover.webp         <-- 封面图片（image: "./cover.webp"）
│   └── diagram.png        <-- 正文中引用的插图
```

### 单文件结构（轻量随笔）

```text
src/content/posts/
├── hello-world.md
└── quick-thoughts.md
```

---

## 5. 丰富的 Markdown 与 MDX 扩展

Shirone 开箱即用地包含现代 Markdown 扩展：

### 5.1 提示块（Admonition）

使用容器指令书写笔记、提示、警告与告警：

```markdown
:::tip
用提示容器突出关键要点或最佳实践。
:::

:::warning
用警告容器提示潜在陷阱或破坏性变更。
:::
```

### 5.2 GitHub 仓库卡片

使用指令语法嵌入实时渲染、样式精美的 GitHub 仓库卡片：

```markdown
::github{repo="LyraVoid/Shirone"}
```

::github{repo="LyraVoid/Shirone"}

### 5.3 表达式代码块

增强型代码块提供语法高亮、文件名徽标、行号与选择性行高亮：

```typescript title="src/utils/theme.ts" {2,4-5}
// Dynamic HCT color token derivation
import { argbFromHex, themeFromSourceColor } from "@material/material-color-utilities";

const theme = themeFromSourceColor(argbFromHex("#f472b6"));
console.log("Primary color token:", theme.schemes.light.primary);
```

### 5.4 数学排版（KaTeX）

直接在 Markdown 中书写优雅的 LaTeX 数学符号：

- **行内公式**：$E = mc^2$，或欧拉公式 $e^{i\pi} + 1 = 0$。
- **块级公式**：

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

### 5.5 Mermaid 图表

用纯文本绘制流程图、时序图与架构图：

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as Visitor
    participant Page as Shirone Page
    participant Swup as Swup Container
    participant Audio as Persistent Shell

    Visitor->>Page: Click Navigation Link
    Page->>Swup: Trigger Seamless Transition
    Swup->>Page: Replace #swup-container
    Note over Audio: Background music plays continuously
    Page-->>Visitor: New Page Rendered
```

### 5.6 图片画廊与 Fancybox 灯箱

图片会自动接入 Fancybox，支持无损缩放、手势平移与全屏预览：

```markdown
![封面预览](./cover.jpeg)
```

---

## 6. 下一步与自定义

- **站点配置**：在 `src/config/siteConfig.ts` 与 [`src/config/README.md`](https://github.com/LyraVoid/Shirone/blob/main/src/config/README.md) 了解全局设置。
- **设计令牌**：在 `DESIGN.md` 与 `docs/m3e-standard.md` 探索令牌与配色。
- **反馈与社区**：在 [GitHub Issues](https://github.com/LyraVoid/Shirone/issues) 分享你的想法与问题。
