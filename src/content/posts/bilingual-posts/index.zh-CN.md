---
title: "Shirone 双语文章指南"
published: 2026-10-09
description: "index.en.md 与 index.zh-CN.md 如何变成两条 URL、如何互相链接，以及界面文案如何跟随页面语言。"
tags: ["Shirone", "指南", "i18n"]
category: Guides
draft: false
---

Shirone 的文章可以有多种**内容语言**版本。各语言版本并排放在同一个目录、
共用一个 slug 并自动互相链接；顶栏与页面文案跟随当前 URL 的语言，聚合列表
（归档、分类、标签）则始终只渲染默认语言。你正在阅读的这一页（以及它的
英文孪生页）就是可运行的演示。

## 1. 文件布局

把每个语言版本放进**同一个**文章目录，每种语言一个文件，命名为
`index.<locale>.md`：

```
src/content/posts/bilingual-posts/
├── index.en.md        ← 默认语言（英语）
└── index.zh-CN.md     ← 简体中文
```

语言由**文件名后缀**派生，不需要额外的 frontmatter 字段：

- `index.en.md` → 集合 id `bilingual-posts`
- `index.zh-CN.md` → 集合 id `zh-CN/bilingual-posts`

默认语言文件也可以沿用不带后缀的 `index.md`——没有后缀即默认语言。
两个文件之间的 `published`、`tags`、`category` 等结构性字段应保持一致，
而 `title` / `description` 各自使用本语言撰写。

## 2. URL 映射

每种语言版本有独立路由。非默认语言的前缀**取代** `posts/` 段，而不是叠加：

| | 默认语言（en） | zh-CN |
| --- | --- | --- |
| 集合 id | `bilingual-posts` | `zh-CN/bilingual-posts` |
| 路由 | `/posts/bilingual-posts/` | `/zh/bilingual-posts/` |
| 自定义 `permalink` | `/my-slug/` | `/zh/my-slug/` |

:::tip
前缀由主题唯一的 `[locale]` 路由拥有，它按 `contentI18n.locales`
（`src/config/contentI18nConfig.ts`）逐语言产出页面——增删语言只需改这张表。
请求规范化（大小写变体、多余的默认语言前缀）由主题中间件处理——上面每一条
映射的唯一真源都是 `src/utils/i18n-routing.ts`。
:::

## 3. 版本之间的互链

只要文章存在至少一个其它语言版本，正文前就会渲染**「本文还提供」**区块
（位于封面与元信息之后）。它把每种其它语言列成一个带 `hreflang` 标注的
链接胶囊——当前语言永远不会列出自己；单语文章则完全不渲染该区块，页面与
未启用 i18n 的站点逐字节一致。

## 4. 顶栏语言菜单

搜索与调色板之间的翻译按钮，下拉展示同一套语言集合：

- 在文章页上，菜单列出**本篇**文章的所有语言版本，点击即切换；
- 首页在每种配置语言下都有对版（`/` ↔ `/zh/`，点击即整页切换）；归档、
  订阅源等尚无对应语言版本的页面，缺失语言的条目呈禁用态。

菜单标签使用语言自称（endonym）——“English”、“简体中文”——不随站点
界面语言翻译。

## 5. 跟随页面语言与保持默认语言的部分

**界面文案跟随当前页面语言**：`/zh/*` 下的顶栏、侧栏、分页与搜索面板都
输出中文——本页即演示。跨语言的站内跳转走整页加载（Swup 的 `ignoreVisit`
守卫），持久外壳不会停留在旧语言上。

聚合内容则被刻意限定在**默认语言**：

- 归档、分类、标签、RSS/Atom 订阅源、`llms.txt` 与统计页始终只列出
  默认语言文章；中文首页（`/zh/`）只列出中文文章；
- 页面级元数据跟随文章语言：`<html lang>`、JSON-LD `inLanguage`、
  `og:url` 与 `Content-Language` 都与你正在阅读的语言一致。

现在就试试顶栏的翻译按钮，或打开上方的互链区块——本文的英文版只有一次
点击之遥。
