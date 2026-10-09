---
title: "Bilingual Posts in Shirone"
published: 2026-10-09
description: "How index.en.md and index.zh-CN.md pairs become two URLs, link to each other, and let UI copy follow the page language."
tags: ["Shirone", "Guide", "i18n"]
category: Guides
draft: false
---

Every post in Shirone can ship in more than one content language. Language
versions live side by side in a single folder, share one slug, and link to
each other automatically — while the top bar and page copy follow the
current URL's language and aggregate lists (archive, categories, tags) keep
rendering the default language only. This very page (and its Chinese twin)
is the working demo.

## 1. File layout

Put each language variant in the **same** post folder, one file per
language, named `index.<locale>.md`:

```
src/content/posts/bilingual-posts/
├── index.en.md        ← default language (English)
└── index.zh-CN.md     ← Simplified Chinese
```

The language is derived from the **file-name suffix** — no extra frontmatter
field is required:

- `index.en.md` → collection id `bilingual-posts`
- `index.zh-CN.md` → collection id `zh-CN/bilingual-posts`

The default-language file may keep the plain `index.md` name as well; a
suffix-less file simply maps to the default language. Keep `published`,
`tags`, `category` and other structural fields in sync between the two
files, and write `title` / `description` in the language of each file.

## 2. URL mapping

Each language version gets its own route. The non-default language prefix
**replaces** the `posts/` segment instead of stacking on top of it:

| | Default language (en) | zh-CN |
| --- | --- | --- |
| Collection id | `bilingual-posts` | `zh-CN/bilingual-posts` |
| Route | `/posts/bilingual-posts/` | `/zh/bilingual-posts/` |
| Custom `permalink` | `/my-slug/` | `/zh/my-slug/` |

:::tip
The prefix is owned by the theme's single `[locale]` route, which emits pages
for every language listed in `contentI18n.locales`
(`src/config/contentI18nConfig.ts`) — adding or removing a language there is
all it takes. Request normalization (case variants, stray default-language
prefixes) is handled by the theme middleware — see
`src/utils/i18n-routing.ts` for the single source of truth of every mapping
above.
:::

## 3. Cross links between versions

When a post has at least one other language version, an **“Also available
in / 本文还提供”** block is rendered above the body, right after the cover
and metadata. It lists every other language as a chip link annotated with
`hreflang` — the current language never lists itself, and a monolingual post
renders no block at all, so pages without translations stay byte-identical
to a site without i18n.

## 4. The top-bar language menu

The translate button between search and the palette opens the same
language set as a dropdown:

- On an article page it lists every language version of **this** post;
  picking one navigates to it.
- The home page has a counterpart in every configured language
  (`/` ↔ `/zh/`, a full-page switch). Pages without a version — archive,
  feeds, and the rest — show the missing language as a disabled entry.

Menu labels are endonyms (“English”, “简体中文”) and never translate.

## 5. What follows the page language, what stays default

**UI copy follows the current page language**: under `/zh/*` the top bar,
sidebar, pagination, and search panel all speak Chinese — this page is the
demo. Cross-language in-site jumps perform a full page load (Swup's
`ignoreVisit` guard), so the persistent shell never lingers in the old
language.

Aggregate content is deliberately scoped to the **default language**:

- Archive, categories, tags, RSS/Atom feeds, `llms.txt`, and stats pages
  always list the default-language posts; the Chinese home page (`/zh/`)
  lists Chinese posts only.
- Per-page metadata follows the article language: `<html lang>`, JSON-LD
  `inLanguage`, `og:url` and `Content-Language` all reflect the language you
  are reading.

To try it, use the translate button in the top bar, or open the link block
above — the Chinese version of this article is one click away.
