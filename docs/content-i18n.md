# 内容多语言（Content i18n）

> 配套文档：`src/i18n/AGENTS.md`（文案规范与 UI 语言解析链的 agent 规则，本文引用其结论）、`src/config/README.md`（配置契约）、`docs/packaging-contract.md`（包模式的 generateId / middleware 同步点）、`docs/m3e-standard.md`（`LanguageMenu`、`PostLanguageAlternates` 组件条目）。

本文是内容多语言特性的架构总览：一套 Markdown 内容产出两种语言的页面，页面 UI 文案跟随**页面语言**，语言菜单与跨语言导航集中在此语义下。改动路由、请求期语言、首页列表语言范围之前先读本文。

## 1. 目标与 URL 形态

唯一真源是 `src/config/contentI18nConfig.ts` 的 `contentI18n`（内容语言 ↔ 路由段 ↔ 展示标签）与派生的 `astroI18n`（注入 Astro `i18n` 配置）。默认语言无前缀，其余按语言表逐语言加前缀：

| 内容语言 | 文件形态 | 路由段 | 首页 | 文章详情 | 列表分页 |
|---|---|---|---|---|---|
| `en`（默认） | `slug.md` 或目录内 `index.en.md` | `en`（**不进 URL**） | `/` | `/posts/<slug>/` | `/2/`、`/3/` … |
| `zh-CN` | `slug.zh-CN.md` 或目录内 `index.zh-CN.md` | `zh` | `/zh/` | `/zh/<slug>/` | `/zh/2/`、`/zh/3/` … |

- 三套命名刻意分开：**路由段**（`en`/`zh`）是 URL 首段与 `i18n.locales` 条目；**内容语言**（`en`/`zh-CN`）是文件后缀、`hreflang`、`Content-Language` 用的 BCP 47 标签；**展示标签**（`English` / `简体中文`）是语言自称（endonym），语言菜单、徽标与桥接页提示直接显示，不随站点 UI 语言翻译。互译只发生在 `src/utils/i18n-routing.ts`。
- `astroI18n.routing` 固定为 `prefixDefaultLocale: false`（默认语言无前缀）；`redirectToDefaultLocale`/`fallbackType` 是为满足 Astro 7 类型而补齐的无操作值（前者在 prefix=false 时运行时强制为 `false`，后者只在配置 fallback 映射时参与）。
- 同一文章的两个语言版本共享无前缀 slug，互为「同组」——这是首页 `languageScope: "all"` 分组（§6）与语言互链（§5）的基础。

## 2. 内容层

- **id 编码**：`generatePostId`（`src/utils/i18n-routing.ts`）作为 posts 集合的 `generateId`，把 `index.zh-CN.md` / `slug.zh-CN.md` 编码成 `zh-CN/<slug>`，默认语言为 `<slug>`。接线在 `src/content.config.ts` 与 `src/integration/collections.ts`（包模式镜像；`docs/packaging-contract.md` 的 “Multi-language content” 行记录了 shirones 流水线的待办）。
- **派生工具**（同在 `i18n-routing.ts`）：`getPostLocale(id)` 取条目语言、`splitPostId(id)` 取无前缀 slug（分组键）、`postPathFor` / `rootPathFor` / `routePrefixFor` 生成语言对应路径、`contentLanguageLabel(locale)` 取展示标签。
- **数据源口径**：`getSortedPosts(locale)`（`src/utils/content-utils.ts`）过滤为单一语言并写入详情页上下篇（`prevSlug/nextSlug/…`）；序号表（`%post_id%`）、系列默认分类回退等全量准备逻辑抽在 `prepareAllPosts()`，与语言无关，按语言过滤与混合列表共用。归档、分类、标签、feed、llms 等聚合口径保持按语言过滤，**不受** `languageScope` 影响。

## 3. 路由层

| 文件 | 职责 |
|---|---|
| `src/pages/[...page].astro` | 默认语言首页列表（Astro `paginate` + `postListConfig.pageSize`） |
| `src/pages/posts/[...slug].astro` | 默认语言文章详情；缺默认语言版本的前缀语言文章在此渲染**桥接页**（见 §6a） |
| `src/pages/[...permalink].astro` | 默认语言站根 permalink |
| `src/pages/[locale]/[...slug].astro` | **全部非默认语言**的四分流路由：文章详情、列表分页、站根 permalink、**数据驱动 shell 页面**（`SHELL_PAGE_ROUTES` 清单见 `src/utils/shell-routes.ts`，如 `/zh/friends/`、`/zh/moments/`——数据语言中立，前缀版差异只在 UI 文案与 `lang` / 对版）；按 `contentI18n.locales` 逐语言产出静态路径（`enable: false` 的 shell 页不产出 = 404），缺本语言版本的其它语言文章渲染**桥接页**（见 §6a）。static build 只按各语言的 getStaticPaths 产出路径；dev 下它先于根路由匹配 `/2/` 但因 `NoMatchingStaticPathFound` 被 `matchAllRoutes` 跳过，落到 `[...page].astro`（Astro 7 dev 穿透机制，static 无此问题） |
| `src/pages/_PostDetail.astro` | 两个详情路由共享的真实文章 body（`_` 前缀 → 非路由） |
| `src/pages/_PostFallback.astro` | 两个详情路由共享的桥接页 body（同为 `_` 前缀非路由） |

- 路由数据装配集中在 `src/utils/post-routes.ts`：`collectPostRoutePaths()`（slug + permalink 汇集）、`assemblePostRouteData()`（discovery / series 上下文）、`toSlugPaths()`（按值去重，撞车时**文章优先**）、`withFallbackSlugs(primary, fallback)`（主路由 slug + 其它语言 slug 合并，追加条目标记 `fallback: true`，供路由模板分流到 `_PostFallback`）。
- **列表分页不能走 Astro `paginate()`**：其页码参数名硬编码为 `page`，与 `[locale]` 路由的 `slug` rest 键冲突。`buildListPagePaths()` 按 paginate 源码复刻同形 `Page` 对象（首页参数值缺省、后续页 `/zh/2/`，URL 带尾斜杠），产出与根 `[...page]` 对称。
- URL 一律由 `url-utils`（`getPostUrl(entry)` 按**条目语言**生成、`getPostUrlBySlug`）与 `permalink-utils` 产出，链接与实际页面路径始终一致。

## 4. 请求期语言与 UI 文案

- **中间件**：`src/middleware.ts` → `src/utils/middleware.ts` 用 `AsyncLocalStorage` 安装请求语言（`locals.locale` + `globalThis.__shirone_request_ui_locale__` 兜底），SSG 构建期每页渲染同样经过它；包模式经 `addMiddleware()` 注入（入口是 `src/utils/middleware.ts`，随包发布）。
- **`i18n(key)` 三级解析链**：(1) 请求上下文（`src/i18n/requestLocale.ts` 的 `readRequestUiLocale()`）→ (2) `<html data-ui-locale>` → (3) `siteConfig.lang`。`i18n(key, { lang })` 显式语言跳过整条链。
- **归一化陷阱**：词典 map 的 key 是下划线形式（`zh_cn`），请求链产出 BCP 47 连字符（`zh-CN`）；任何查表必须先过 `getTranslation()` / `normalizeLang()`（`src/i18n/translation.ts`），否则**静默回落英文**（曾使全部 `/zh/*` UI 文案变英文，而请求语言全程正确）。规则细节与禁止事项见 `src/i18n/AGENTS.md`。
- **模块顶层禁调 `i18n()`**：配置求值期没有请求上下文，值会冻在加载期语言。延迟文案存 `"$t:<key>"`（`I18N_REFERENCE_PREFIX`，`src/utils/i18n-utils.ts`），渲染期 `resolveI18nText()` 解析——`navBarConfig` 与 TopAppBar / SiteNavigationDrawer 即此模式。
- **SSR 输出的语言属性**：

| 属性 | 位置 | 消费方 |
|---|---|---|
| `data-ui-locale` / `data-ui-lang-map` | `<html>`（`Layout.astro`） | 客户端解析链第 2 级；Swup `ignoreVisit` 前缀比较 |
| `data-page-locale` | `#swup-container` | 页面语言（跨语言 reload 兜底与调试） |
| `data-page-languages` | `#swup-container` | 语言菜单 Swup 换页后的对版同步 |
| `data-current-page` | `#swup-container` | 侧栏页面过滤（见 `docs/sidebar-system.md`） |

## 5. 语言切换与跨语言导航

- **对版数据**：文章页由 `_PostDetail` 组装 `getPostLanguageAlternates()`（`content-utils`）的互链；其余页面由 `shellPageLanguageVersions(pathname, locale)`（`i18n-routing.ts`）兜底推导。`MainGridLayout` 恒定输出 `data-page-languages`，因此持久 shell 不随 Swup 重渲染也能对版。
- **`LanguageMenu`**（organisms）：顶栏语言切换，SSR 输出全量 endonym 条目 + `aria-current` + 禁用态；站内导航后从 `data-page-languages` 重建。文章内的「本文还提供」互链是 `PostLanguageAlternates`（molecules），只在存在其它语言版本时渲染，零额外 DOM。
- **跨语言必须整页导航**：持久 shell（顶栏、抽屉）位于 `#swup-container` 之外，Swup 换页不会重渲染它。`Layout.astro` 的 Swup `ignoreVisit` 守卫比较目标 URL 的语言前缀（来自 `data-ui-lang-map`）与当前语言，不同则放弃接管、走浏览器原生整页加载；`content:replace` 上再挂一层前后退导航的 reload 兜底。**不得**移除该守卫或绕开它做同文档跨语言切换。

## 6. 首页列表的语言范围（`languageScope`）

`postListConfig.languageScope`（类型 `PostListLanguageScope`，见 `src/types/postListConfig.ts`；用户可在 `config/post-list.yaml` 覆盖）：

| 值 | 行为 |
|---|---|
| `"language"`（默认） | 只渲染当前页面语言的文章：`/` 只列 `en`，`/zh/` 只列 `zh-CN`（与改动前行为一致） |
| `"all"` | 渲染**全部文章组**，每组取一个代表 |

- 消费方是 `getSortedPostsForHome(locale)`（`src/utils/content-utils.ts`），仅接线两个首页路由（`[...page].astro` 与 `[locale]/[...slug].astro` 的列表分支）；非 `"all"` 直接委托 `getSortedPosts(locale)`，零行为变化。
- **组代表选择链**（`"all"`）：按 `splitPostId` 的无前缀 slug 归组 → ① 当前页面语言版本 → ② 默认语言版本（"无对应语言的文章以默认语言显示"）→ ③ 组内任一版本；随后按代表条目的发布时间统一排序。
- **卡片链接策略 = 页面语言前缀**：代表条目语言与页面语言相同 → `getPostUrl(entry)`（尊重 permalink / alias）；不同 → `getPostUrlBySlug(entry.id, pageLocale)`（链到该 slug 在当前前缀下的桥接页）。因此 `/zh/` 列表全为 `/zh/…` 链接、`/` 列表全为 `/posts/…` 链接，点卡片不会在语言间横跳（桥接页承接后再由读者主动选版）。
- **语言徽标**：代表条目语言 ≠ 页面语言时，卡片标题行渲染 endonym 徽标（"仅有 {lang} 版"，`I18nKey.postLanguageOnlyBadge`），可见文本取文章自身语言的 endonym，`title` 属性为页面语言文案；`postListConfig.languageFallbackBadge: false` 可整体关闭（此时卡片仍链桥接页，只是不渲染徽标）。徽标由 `PostPage`（计算）→ `organisms/PostCard`（透传）→ `atoms/blog/PostCard`（渲染）三层传递，`aria-hidden` + 折入标题读屏文案，与置顶/加密徽标同模式。
- **混合模式不写 `prevSlug/nextSlug/prevUrl/nextUrl`**：首页不消费这些字段，而写入会与详情路由装配的「语言内序」落在同一个 `entry.data` 上，SSG 并发渲染时互相覆盖；详情页上下篇必须始终由详情自己的装配写入。
- 切换到 `"all"` 后页数按组数重算（`buildListPagePaths` / `paginate` 自动处理）；详情页、聚合页不受影响。

## 6a. 语言回退桥接页（`_PostFallback`）

缺当前页面语言版本的文章（跨语言卡片链接、或直接访问 `/<route>/<en-only-slug>/`）不再 404，而是在该 slug 的当前前缀下渲染桥接页：

- **分流**：`[locale]/[...slug].astro` 与 `posts/[...slug].astro` 用 `withFallbackSlugs()` 把「本前缀真实 slug + permalink」与「**其它所有语言** slug 的并集」合并产出静态路径（多语言同名 slug 按语言表顺序首条优先），模板按 `props.fallback` 渲染 `_PostDetail` 或 `_PostFallback`。permalink（frontmatter 显式覆盖）**无**回退形态，仍 404。
- **页面语言**：中间件按路径前缀解析 `locals.locale`，桥接页的顶栏 / 侧栏 / 文案全部跟随**页面路由语言**；正文标题 / 摘要按原文语言展示并标 `lang` 属性。
- **互链**：正文复用 `PostLanguageAlternates`（"本文还提供"），原文自身版本排首位（推荐阅读），其余真实版本随后；桥接页自身不进入互链列表。顶栏语言菜单把页面语言标为 `current`（URL 即桥接页自身），点击其它条目整页跳到真实版本。
- **SEO / 搜索**：桥接页与原文内容重复，`pagefindIgnore` prop 透传至 `<html data-pagefind-ignore>`，且无 `data-pagefind-body`（pagefind 双重排除，不入索引）；Layout 不为桥接页输出 `rel=canonical`（canonicalUrl 仅用于 og:url）。

## 7. 验证

改动本特性域后按 `AGENTS.md` 的 Validation 段执行，另加产物核对：

1. `npx.cmd astro check` → 0 errors 0 warnings。
2. `npm run build` → 页面数符合预期（默认 `"language"` 模式 51 页；`"all"` 模式另加桥接页——本仓库 19 篇 en-only → 72 页）。
3. dist 产物核对要点（可写成临时脚本批量断言）：
   - `<html lang>` 与 `data-ui-locale` 各语言正确；`data-ui-lang-map` 含前缀映射；
   - `/zh/*` 页面导航/抽屉/category-bar 为中文，且**没有**可见英文残留；en 页面无非默认语言文案；
   - 列表过滤：`language` 模式 zh 首页无 `/posts/` 卡片；`"all"` 模式每组只出一个代表（另一语言版本链接缺席）、分页页数精确；
   - 卡片链接全部为页面语言前缀（zh 列表无 `/posts/` 卡片链接）；跨语言代表卡片带 `m3-blog-postcard__lang` 徽标（endonym 可见、`title` 为页面语言文案）；`languageFallbackBadge: false` 时零徽标 DOM；
   - 桥接页：notice 文案正确（endonym 替换）、原文标题 `lang` 属性、互链含真实版本、`data-pagefind-ignore` 且无 `data-pagefind-body`、`data-page-languages` 中页面语言 `current` 指向桥接页自身；真实版页面无 `post-language-fallback` UI 元素；
   - `data-page-languages` 对版（首页互指、文章页 2 条互链且当前项正确）；跨语言 `ignoreVisit` 守卫与语言菜单同步脚本进 bundle；
   - sitemap 含 `/zh/`；`rss.xml` / `atom.xml` 无 `/zh/` `<link>` 泄漏。
4. 聚焦测试：`npx.cmd playwright test tests/site/a11y.spec.ts` + 相关页面片段（涉及持久 shell 时加 Swup 导航断言）。
5. pagefind 构建期自动发现 `zh-cn` / `en` 两套索引，无需额外配置；桥接页因无 `data-pagefind-body` 天然不入索引（`pagefindIgnore` 是第二重保险）。

## 8. 增删语言（配置驱动）

展示哪些内容语言、加新语言，只需改 `src/config/contentI18nConfig.ts` 的语言表（数组顺序即语言菜单与互链的顺序），**无需改源码或新建路由目录**：

```ts
locales: [
	{ locale: "en", route: "en", label: "English" },
	{ locale: "zh-CN", route: "zh", label: "简体中文" },
	{ locale: "ja", route: "ja", label: "日本語" }, // 新增
],
```

- `locale`：BCP 47 形态的内容语言标签，决定内容文件后缀（`slug.ja.md` / `index.ja.md`）与 `lang` / `hreflang`；`route`：URL 首段（小写 slug，不得与 `src/pages/` 顶层具名段重名）；`label`：endonym（语言菜单与徽标直接显示）。
- 语言表驱动一切派生：`astroI18n` 注入、`i18n-routing` 的全部映射、`[locale]` 路由的静态路径与桥接页、语言菜单 / 徽标 / 互链。
- 写错形态（纯数字 route、保留段、重复键、空 label、defaultLocale 不在表内等）由 `validateContentI18n()` 在模块加载时 fail-fast 报错；`tests/content-i18n-config.test.mjs` 对保留段清单与 `src/pages/` 顶层做防漂移对账。
- 包模式：用户在 `shirones/config/contentI18nConfig.ts` 放同名文件覆盖（`loadConfigModule()` + Vite overlay 用户优先探测）。**不要**把语言表放回 `integrationsConfig.ts`——它在包模式被静态打进 `dist/index.js`、没有覆盖层，语言改动落不进去（split-brain）。
- 内容分离模式：内容仓的 `config/*.yaml` 覆盖层**不包含**语言表（YAML 走 `withUserConfig()` 深合并链，而语言表需保留 `as const` 字面量类型）；要增删语言直接改主题侧 `src/config/contentI18nConfig.ts`，见 `docs/content-separation/config-overlay.md`。

## 9. 已知限制

- 未输出 `<link rel="alternate" hreflang>` head 标签；页内语言互链由 `PostLanguageAlternates` 承担。
- 归档、分类、标签、系列等**文章聚合页**只有默认语言路由（`/archive/` 等；聚合语义绑定默认语言的文章列表，不适合复制多份前缀版本）；它们的语言菜单对版依赖 `shellPageLanguageVersions` 的兜底推导。数据驱动 shell 页面（`SHELL_PAGE_ROUTES`：about / albums / anime / compass / devices / friends / games / moments / projects / skills / timeline）已有前缀版本，如 `/zh/friends/`。
- `new-post` 脚手架不生成语言配对文件。
- 包模式下 posts 集合的 `generateId` 仍依赖 shirones 流水线跟进（`docs/packaging-contract.md` 对应行 + 其 dry run 检查）。

## 10. 相关文件索引

| 文件 | 角色 |
|---|---|
| `src/config/contentI18nConfig.ts` | `contentI18n` / `astroI18n` 唯一真源（含语言表与增删语言指南） |
| `src/utils/i18n-routing.ts` | id 编码、路径/前缀派生、`shellPageLanguageVersions`、请求语言解析 |
| `src/utils/shell-routes.ts` | 数据驱动 shell 页面清单（`SHELL_PAGE_ROUTES`）与按 slug 反查（对版推导用；零外部依赖） |
| `src/utils/post-routes.ts` | 详情/列表路由数据装配、`buildListPagePaths` |
| `src/utils/content-utils.ts` | `prepareAllPosts` / `getSortedPosts(locale)` / `getSortedPostsForHome(locale)`、`getPostLanguageAlternates` |
| `src/utils/url-utils.ts`、`src/utils/permalink-utils.ts` | 语言感知 URL / permalink 生成 |
| `src/middleware.ts`、`src/utils/middleware.ts`、`src/i18n/requestLocale.ts` | 请求期语言（ALS）与读取 |
| `src/i18n/translation.ts`、`src/utils/i18n-utils.ts` | 归一化查表、`i18n()` 解析链、`$t:` 惰性引用 |
| `src/layouts/Layout.astro` | `data-ui-locale` / `data-ui-lang-map` 注入、Swup `ignoreVisit` 守卫 |
| `src/layouts/MainGridLayout.astro` | `data-page-languages` 恒定输出 |
| `src/components/organisms/LanguageMenu.astro`、`src/components/molecules/PostLanguageAlternates.astro` | 语言切换 UI |
| `src/pages/[locale]/[...slug].astro`、`src/pages/posts/[...slug].astro`、`src/pages/_PostDetail.astro`、`src/pages/_PostFallback.astro` | 前缀语言分流、共享详情 body 与桥接页 body |
| `src/pages/_<Name>.astro`（如 `_Friends.astro`） | shell 页面共享主体：顶层薄壳路由与 `[locale]` 分流共用同一实现（薄壳保留 `enable` → 404 行为） |
| `src/config/postListConfig.ts`、`src/types/postListConfig.ts` | `languageScope` / `languageFallbackBadge` 配置 |
