import { contentI18n } from "../config/contentI18nConfig.ts";
import { shellPageForSlug } from "./shell-routes.ts";

/**
 * 内容 i18n 路由：语言表、URL 前缀与文章 id 编码的唯一入口。
 *
 * 路由表本身在 `src/config/contentI18nConfig.ts`（`contentI18n`）——它是注入
 * Astro `i18n` 配置的选项值；本文件只做**派生**：Astro 不认识的那半套语义
 * （内容语言 `zh-CN` ↔ 路由段 `zh`、URL 前缀、内容文件的语言后缀、文章 id
 * 的语言前缀、语言自称标签）全部在这里定义，消费方如下：
 *
 * - `src/content.config.ts` —— `glob({ generateId })`，决定集合 id；
 * - `src/utils/middleware.ts` —— 请求期解析首段并归一化为规范前缀；
 * - `src/utils/url-utils.ts` —— 把 id/别名/permalink 变成带前缀的站内 URL；
 * - `src/utils/content-utils.ts` —— 按语言过滤集合条目、算语言互链。
 *
 * id 编码规则（向后兼容的半边）：
 * - 默认语言沿用既有 id（`guide`、`markdown`），URL 仍是 `/posts/<id>/`；
 * - 非默认语言为 `<内容语言>/<slug>`（如 `zh-CN/guide`），URL 为 `/zh/<slug>/`。
 *
 * 这样 `getPostLocale()` / `getPostSlug()` 只看 id 就能还原语言与语言中立
 * slug，链接生成不依赖请求上下文（列表页、feed、JSON-LD 都拿不到 route 状态）。
 *
 * 本模块保持零第三方依赖（只读配置常量），content.config 与中间件都会导入它。
 */

/** 路由段形态：小写字母开头的短横线分段——URL 首段，同时也是参数值。 */
const ROUTE_SEGMENT_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** 内容语言标签形态：与文件语言后缀识别（LOCALE_SUFFIX）同一套 BCP 47 约束。 */
const LOCALE_TAG_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/;

/**
 * `src/pages/` 顶层的具名段：路由段与它们重名时，静态路由优先级高于
 * `[locale]` 动态段，该语言的分页列表页会被同名页面遮蔽。清单与
 * `src/pages` 顶层保持同步；`tests/content-i18n-config.test.mjs` 拿真实
 * 目录对这份清单做防漂移断言。带点号的端点段（`atom.xml`、`robots.txt`…）
 * 不必列出——路由段形态本身不含点号。
 */
export const RESERVED_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
	"404",
	"about",
	"albums",
	"anime",
	"archive",
	"atom",
	"categories",
	"compass",
	"devices",
	"friends",
	"games",
	"moments",
	"posts",
	"projects",
	"rss",
	"series",
	"skills",
	"tags",
	"timeline",
]);

/**
 * 语言表 fail-fast 校验：配置写错时在内容同步 / 构建入口直接报错，而不是
 * 产出一批 404、互相遮蔽的页面，或把前缀 308 指向不存在的规范形态。
 *
 * 用户在包模式改的是自己的 `shirones/config/contentI18nConfig.ts`，跑的
 * 不是本仓的 `astro check`——类型层兜不住，必须有运行时这道闸。
 */
export function validateContentI18n(config: {
	defaultLocale: string;
	locales: readonly { locale: string; route: string; label: string }[];
}): void {
	const problems: string[] = [];
	const seenLocales = new Set<string>();
	const seenRoutes = new Set<string>();
	// URL 首段前缀键（路由段 + 语言标签的小写/下划线变体）跨条目不得撞键，
	// 否则请求期 `resolveRequestLocale` 的归一映射会互相覆盖。
	const prefixOwners = new Map<string, string>();

	for (const entry of config.locales) {
		const where = `locale "${entry.locale}"`;

		if (!LOCALE_TAG_RE.test(entry.locale)) {
			problems.push(
				`${where}: locale must be a BCP 47-shaped tag such as "zh-CN" — ` +
					"only tags of that shape are recognised in content file suffixes",
			);
		}
		if (!ROUTE_SEGMENT_RE.test(entry.route)) {
			problems.push(
				`${where}: route "${entry.route}" must be a lowercase slug starting ` +
					"with a letter (it is the URL first segment; pure numbers would " +
					"collide with list pagination)",
			);
		} else if (RESERVED_ROUTE_SEGMENTS.has(entry.route)) {
			problems.push(
				`${where}: route "${entry.route}" is reserved by a top-level page ` +
					"under src/pages/ and its list page would be shadowed",
			);
		}
		if (typeof entry.label !== "string" || entry.label.trim() === "") {
			problems.push(
				`${where}: label must be a non-empty endonym (shown in the language ` +
					"menu, badges and fallback notices)",
			);
		}
		if (seenLocales.has(entry.locale)) {
			problems.push(`${where}: duplicate locale entry`);
		}
		if (seenRoutes.has(entry.route)) {
			problems.push(
				`${where}: route "${entry.route}" is already claimed by another locale`,
			);
		}
		seenLocales.add(entry.locale);
		seenRoutes.add(entry.route);

		const variantKeys = [
			entry.route,
			entry.locale.toLowerCase(),
			entry.locale.toLowerCase().replace(/-/g, "_"),
		];
		for (const key of variantKeys) {
			const owner = prefixOwners.get(key);
			if (owner !== undefined && owner !== entry.locale) {
				problems.push(
					`URL prefix "${key}" is claimed by both "${owner}" and ` +
						`"${entry.locale}"`,
				);
			}
			prefixOwners.set(key, entry.locale);
		}
	}

	if (!seenLocales.has(config.defaultLocale)) {
		problems.push(
			`defaultLocale "${config.defaultLocale}" is not listed in locales`,
		);
	}
	if (problems.length > 0) {
		throw new Error(
			"[shirones] Invalid contentI18n " +
				"(src/config/contentI18nConfig.ts):\n  - " +
				problems.join("\n  - "),
		);
	}
}

validateContentI18n(contentI18n);

/** 内容语言：内容文件后缀、frontmatter `lang`、`hreflang` 用的 BCP 47 标签。 */
export type ContentLocale = (typeof contentI18n.locales)[number]["locale"];

/** 默认语言：无 URL 前缀，集合 id 不带语言前缀。 */
// `satisfies ContentLocale` 校验它确在 locales 里；显式注解取
// `typeof contentI18n.defaultLocale` 而不是 union 的 `: ContentLocale`——
// union 会把 DEFAULT_LOCALE 拓宽成 `"en" | "zh-CN"`，消费方的 computed-key
// 表就无法把它识别为 `"en"` 键；字面量注解同时满足 `--isolatedDeclarations`
// 对导出变量必须显式标注的要求。
export const DEFAULT_LOCALE: typeof contentI18n.defaultLocale =
	contentI18n.defaultLocale satisfies ContentLocale;

/** 全部内容语言，顺序与路由表一致。 */
export const CONTENT_LOCALES: readonly ContentLocale[] =
	contentI18n.locales.map((entry) => entry.locale);

const LABEL_BY_LOCALE = new Map<ContentLocale, string>(
	contentI18n.locales.map((entry) => [entry.locale, entry.label]),
);

/**
 * 内容语言 → 展示标签（语言自称 endonym，来自 `contentI18n.locales[].label`）。
 *
 * 顶栏语言菜单、「本文还提供」互链、语言徽标与桥接页提示直接显示它。
 * 不经 `i18n()`：语言名描述的是「那个语言本身」，不随站点 UI 语言翻译，
 * 所以不占 `I18nKey` 词典、十个 locale 模块也不必登记同值副本。
 */
export function contentLanguageLabel(locale: ContentLocale): string {
	return LABEL_BY_LOCALE.get(locale) ?? String(locale);
}

const ROUTE_BY_LOCALE = new Map<ContentLocale, string>(
	contentI18n.locales.map((entry) => [entry.locale, entry.route]),
);

/**
 * 集合 id 的语言前缀 → 内容语言。
 *
 * 与路由段分开：id 用完整 BCP 47 标签（`zh-CN/guide`），URL 用路由段
 * （`/zh/guide/`）。默认语言不登记——它的 id 永远不带前缀，这样内容目录里
 * 真有个 `en/` 文件夹时（`en/guide/index.md` → id `en/guide`）才会被当成
 * 完整 slug 而不是语言标记。
 */
const LOCALE_BY_ID_PREFIX = new Map<string, ContentLocale>(
	contentI18n.locales
		.filter((entry) => entry.locale !== contentI18n.defaultLocale)
		.map((entry) => [entry.locale, entry.locale as ContentLocale]),
);

/**
 * 请求路径首段（小写）→ 内容语言。
 *
 * 只登记**非默认**语言：`/en/...` 由 Astro 自己的 i18n 中间件按
 * `prefixDefaultLocale: false` 的策略 404 掉，这里再认一次会把
 * 「默认语言无前缀」的约定搅浑。
 *
 * 同时登记 `zh-cn` / `zh_cn` 这类大小写与下划线变体：它们不是合法前缀，
 * 但值得 308 到规范形态，而不是留一个 404。
 */
const LOCALE_BY_PREFIX_SEGMENT = new Map<string, ContentLocale>(
	contentI18n.locales
		.filter((entry) => entry.locale !== contentI18n.defaultLocale)
		.flatMap((entry) => {
			const locale = entry.locale as ContentLocale;
			return [
				[entry.route, locale],
				[locale.toLowerCase(), locale],
				[locale.toLowerCase().replace(/-/g, "_"), locale],
			];
		}),
);

/** 内容语言 → 路由段（URL 首段 = `i18n.locales` 条目 = `[locale]` 参数值）。 */
export function routeSegmentFor(locale: ContentLocale): string {
	return ROUTE_BY_LOCALE.get(locale) ?? String(locale);
}

/** 内容语言 → URL 前缀（默认语言为空串）。 */
export function routePrefixFor(locale: ContentLocale): string {
	return locale === DEFAULT_LOCALE ? "" : `/${routeSegmentFor(locale)}`;
}

/**
 * 文章详情页 URL（集合 id 或语言中立 slug）。
 *
 * 默认语言沿用既有形态 `/posts/<slug>/`；非默认语言按内容语言路由方案走
 * `/<route>/<slug>/`（如 `/zh/guide/`）——前缀**取代** `posts/` 段而不是
 * 叠在它前面，这是既定的 URL 方案，`postPathFor` 与 `rootPathFor` 是它在
 * 「文章段」和「站根段」两处的唯一实现。
 */
export function postPathFor(slug: string, locale: ContentLocale): string {
	return locale === DEFAULT_LOCALE
		? `/posts/${slug}/`
		: `${routePrefixFor(locale)}/${slug}/`;
}

/**
 * 站根级路径（frontmatter `permalink` 与全局 permalink 模板产物）。
 * 默认语言落根 `/…/`（由 `src/pages/[...permalink].astro` 承接），
 * 其余落到前缀之下 `/zh/…/`（由 `src/pages/[locale]/[...slug].astro` 承接）。
 */
export function rootPathFor(slug: string, locale: ContentLocale): string {
	return `${routePrefixFor(locale)}/${slug}/`;
}

/**
 * 一篇文章各语言版本的顶栏语言菜单数据。
 *
 * 由 `_PostDetail` 组装（当前版本 + `getPostLanguageAlternates()` 的其它
 * 版本），经 `MainGridLayout` 同时输出到两处：顶栏菜单的 SSR 渲染，
 * 以及 `#swup-container` 的 `data-page-languages` 属性——Swup 替换容器
 * 时属性随元素整体换新，顶栏据此在站内导航后重新同步菜单状态。
 */
export type PostLanguageVersion = {
	locale: ContentLocale;
	/** 该语言版本的站内 URL（已含 base 与语言前缀）。 */
	url: string;
	/** 当前页面所属版本：菜单标记 `aria-current` 且不渲染 href。 */
	current?: boolean;
};

/**
 * 语言 URL 前缀 → 内容语言映射，键含 `BASE_URL`（`/` base 下即
 * `{ "": "en", "/zh": "zh-CN" }`）。
 *
 * 渲染进 `<html data-ui-lang-map>`，是客户端跨语言导航判定的**唯一**
 * 数据来源（Layout 的 Swup `ignoreVisit` 读它）：URL 前缀与语言的对应
 * 属于路由配置，浏览器端无从解析 `contentI18n`，由 SSR 固化为 JSON。
 */
export function uiLanguagePrefixMap(): Record<string, string> {
	const base = import.meta.env?.BASE_URL ?? "/";
	const basePrefix = base === "/" ? "" : base.replace(/\/+$/, "");
	const map: Record<string, string> = {};
	for (const entry of contentI18n.locales) {
		map[`${basePrefix}${routePrefixFor(entry.locale)}`] = entry.locale;
	}
	return map;
}

/**
 * 非文章页的顶栏语言菜单数据——`MainGridLayout` 在文章页之外的兜底。
 *
 * 对版规则收口在这一个函数里：**首页与数据驱动 shell 页面存在跨语言
 * 对版**（`/` ↔ `/zh/` ↔ …，以及 `/friends/` ↔ `/zh/friends/` ↔ …，
 * 后者由 `SHELL_PAGE_ROUTES` 清单驱动，前缀路由在 `[locale]/[...slug]`
 * 产出）；其余非文章页（归档、分类、标签、系列……）没有前缀语言对应
 * 路由，渲染为单版本——当前语言条目 `current`，其余语言因无版本而
 * 禁用。将来给某个列表页补上前缀路由时，把它的 slug 加进 shell 清单
 * （或在这里与 shell 分支同构地追加对版条目）。
 */
export function shellPageLanguageVersions(
	pathname: string,
	locale: ContentLocale,
): PostLanguageVersion[] {
	const base = import.meta.env?.BASE_URL ?? "/";
	const basePrefix = base === "/" ? "" : base.replace(/\/+$/, "");
	const rest = pathname.startsWith(basePrefix)
		? pathname.slice(basePrefix.length)
		: pathname;
	const normalisedRest = rest.replace(/\/+$/, "");
	const self: PostLanguageVersion = { locale, url: pathname, current: true };

	// 首页判定：去掉 base 与尾斜杠后的路径 == 当前语言前缀（en 为 ""，
	// zh 为 "/zh"）。`/zh/bilingual-posts/` 这类文章页不会走到这里
	//（`_PostDetail` 显式传入 languageVersions），但即使走到也只会
	// 命中非首页分支，退回单版本。
	if (normalisedRest !== routePrefixFor(locale)) {
		// shell 页面对版：剥掉当前语言前缀后恰好是单个 shell 页段时，
		// 按语言表产全量对版（`/<slug>/` ↔ `/<route>/<slug>/`）。归档、
		// 分类、标签、系列等聚合页与列表分页没有前缀版本，保持单版本。
		const prefix = routePrefixFor(locale);
		const unprefixed =
			prefix && normalisedRest.startsWith(prefix)
				? normalisedRest.slice(prefix.length)
				: normalisedRest;
		const segments = unprefixed.split("/").filter(Boolean);
		if (segments.length !== 1) return [self];
		const shell = shellPageForSlug(segments[0]);
		if (!shell) return [self];
		return contentI18n.locales.map((entry) =>
			entry.locale === locale
				? self
				: {
						locale: entry.locale,
						url: `${basePrefix}${routePrefixFor(entry.locale)}/${shell.slug}/`,
					},
		);
	}

	return contentI18n.locales.map((entry) =>
		entry.locale === locale
			? self
			: {
					locale: entry.locale,
					url: `${basePrefix}${routePrefixFor(entry.locale)}/`,
				},
	);
}

export type RequestLocaleResolution = {
	/** 请求路径解析出的内容语言。 */
	locale: ContentLocale;
	/**
	 * 需要跳转到的规范路径；前缀已规范（或本来无前缀）时为 `null`。
	 * 含 `base`，不含 query/hash，由调用方补全后返回 308。
	 */
	redirectPath: string | null;
};

/**
 * 从请求路径解析内容语言，并把非规范前缀归一化成规范路由段。
 *
 * 例（base 为 `/`）：
 * - `/posts/guide/` → `en`，无跳转
 * - `/zh/guide/` → `zh-CN`，无跳转
 * - `/zh-cn/guide/`、`/ZH/guide/` → `zh-CN`，跳到 `/zh/guide/`
 *
 * 只看前缀**之后**的第一个段：路由段在页面目录这一层，
 * 其余位置出现的 `zh` 只是普通 slug 片段（如 `/tags/zh/`）。
 */
export function resolveRequestLocale(
	pathname: string,
): RequestLocaleResolution {
	const base = import.meta.env?.BASE_URL ?? "/";
	const basePrefix = base === "/" ? "" : base.replace(/\/+$/, "");
	const hasBase =
		basePrefix !== "" &&
		(pathname === basePrefix || pathname.startsWith(`${basePrefix}/`));
	const rest = hasBase ? pathname.slice(basePrefix.length) : pathname;

	const segments = rest.split("/");
	const first = segments[1] ?? "";
	const locale = first
		? LOCALE_BY_PREFIX_SEGMENT.get(first.toLowerCase())
		: undefined;
	if (!locale) {
		return { locale: DEFAULT_LOCALE, redirectPath: null };
	}

	const canonical = routeSegmentFor(locale);
	if (first === canonical) {
		return { locale, redirectPath: null };
	}
	segments[1] = canonical;
	return { locale, redirectPath: `${basePrefix}${segments.join("/")}` };
}

const FILE_EXTENSION = /\.(md|mdx|markdown)$/i;

/**
 * 语言后缀识别：`index.zh-CN` → 基名 `index` + `zh-CN`。
 * 标签先按小写/下划线归一再查表，查不到（`foo.bar`、`v2`）就当普通文件名。
 */
const LOCALE_SUFFIX = /^(.+)\.([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)$/;

function normaliseLocaleTag(tag: string): ContentLocale | null {
	const candidate = tag.toLowerCase().replace(/_/g, "-");
	return (
		contentI18n.locales.find(
			(entry) => entry.locale.toLowerCase() === candidate,
		)?.locale ?? null
	);
}

/**
 * segment 级 slug 化，近似 `github-slugger` 的 `slug()`（Astro 默认 id 的
 * 来源）：小写、去掉标点、空格换成连字符，保留 unicode 字母/数字，
 * 因此中文文件名仍然可用。
 *
 * 不直接依赖 `github-slugger`：它是 Astro 的传递依赖，写进 dependencies
 * 才能过 pnpm 的严格布局与 `check:package-manifest`，而这里要的只是
 * 「既有 id 不变 + 不产出含点号/空格的 URL」的等价行为。
 */
function slugSegment(segment: string): string {
	return segment
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\-_ ]/gu, "")
		.replace(/ /g, "-");
}

/**
 * 去掉语言后缀（不做 slug 化）：`index.zh-CN` → `index`。
 * 无语言后缀时原样返回，供 `%raw_postname%` 这类「保留原貌」的消费方使用。
 */
export function splitLocaleSuffix(name: string): {
	base: string;
	locale: ContentLocale | null;
} {
	const match = LOCALE_SUFFIX.exec(name);
	const tagged = match ? normaliseLocaleTag(match[2]) : null;
	if (match && tagged) {
		return { base: match[1], locale: tagged };
	}
	return { base: name, locale: null };
}

/**
 * 解析内容文件相对路径（相对集合 base，posix 分隔）为语言中立 slug 与语言。
 *
 * `guide/index.zh-CN.md` → `{ slug: "guide", locale: "zh-CN" }`
 * `guide/index.md`、`markdown.md` → 默认语言，slug 与 Astro 默认 id 一致。
 */
export function parsePostFile(entry: string): {
	slug: string;
	locale: ContentLocale;
} {
	const withoutExt = entry.replace(FILE_EXTENSION, "");
	const segments = withoutExt.split("/").filter(Boolean);

	let locale: ContentLocale = DEFAULT_LOCALE;
	const last = segments[segments.length - 1];
	if (last) {
		const { base, locale: tagged } = splitLocaleSuffix(last);
		if (tagged) {
			locale = tagged;
			segments[segments.length - 1] = base;
		}
	}

	const slug = segments
		.map(slugSegment)
		.join("/")
		.replace(/\/index$/, "");
	return { slug, locale };
}

export type PostIdInput = {
	/** 相对集合 base 的 posix 路径，如 `guide/index.zh-CN.md`。 */
	entry: string;
	/** 原始 frontmatter；`slug` 与 Astro 默认实现一样拥有最高优先级。 */
	data?: Record<string, unknown> | null;
};

/**
 * posts 集合的 `generateId`。
 *
 * Astro 默认实现会把 `index.zh-CN.md` slug 成 `indexzhcn`（github-slugger
 * 吃掉点号），语言信息既丢了又落进 URL，所以必须自定义：语言后缀从 id 里
 * 剥出来变成前缀，其余行为（`slug` frontmatter、`/index` 收尾、逐段 slug）
 * 与默认实现保持一致。
 */
export function generatePostId({ entry, data }: PostIdInput): string {
	const explicitSlug =
		typeof data?.slug === "string" && data.slug.trim().length > 0
			? data.slug.trim()
			: "";
	const { slug, locale } = parsePostFile(entry);
	const effectiveSlug = explicitSlug || slug;
	return locale === DEFAULT_LOCALE
		? effectiveSlug
		: `${locale}/${effectiveSlug}`;
}

/**
 * 把集合 id 拆回语言与语言中立 slug。
 *
 * 首段必须**逐字**命中非默认语言才算语言前缀：默认语言 id 永远不带前缀，
 * 所以 `en/guide`（内容目录里真有个 `en/` 文件夹）会被当作完整 slug。
 */
export function splitPostId(id: string): {
	locale: ContentLocale;
	slug: string;
} {
	const index = id.indexOf("/");
	if (index > 0) {
		const head = id.slice(0, index);
		const locale = LOCALE_BY_ID_PREFIX.get(head);
		if (locale && locale !== DEFAULT_LOCALE) {
			return { locale, slug: id.slice(index + 1) };
		}
	}
	return { locale: DEFAULT_LOCALE, slug: id };
}

/** id 所属内容语言（默认语言 id 无前缀）。 */
export function getPostLocale(id: string): ContentLocale {
	return splitPostId(id).locale;
}

/** id 剥掉语言前缀后的语言中立 slug。 */
export function getPostSlug(id: string): string {
	return splitPostId(id).slug;
}
