import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { contentI18n } from "../src/config/contentI18nConfig.ts";
import {
	CONTENT_LOCALES,
	contentLanguageLabel,
	DEFAULT_LOCALE,
	RESERVED_ROUTE_SEGMENTS,
	routePrefixFor,
	routeSegmentFor,
	shellPageLanguageVersions,
	validateContentI18n,
} from "../src/utils/i18n-routing.ts";
import {
	shellPageForSlug,
	SHELL_PAGE_ROUTES,
} from "../src/utils/shell-routes.ts";

const pagesDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"src",
	"pages",
);

/** `src/pages/` 顶层的具名段：动态段（`[...`）、私有文件（`_`）与带点号的
 * 端点（`atom.xml.ts`）不算——路由段形态本身排除了它们。 */
function namedPageSegments() {
	const segments = new Set();
	for (const entry of readdirSync(pagesDir)) {
		const dotless = entry.replace(/\.(astro|md|mdx|ts|js|mjs)$/, "");
		if (dotless.startsWith("_") || dotless.startsWith("[")) continue;
		if (dotless.includes(".")) continue;
		segments.add(dotless);
	}
	return segments;
}

/** `validateContentI18n` 的变体必须抛错且消息命中 `pattern`。 */
function mustReject(config, pattern) {
	assert.throws(
		() => validateContentI18n(config),
		(error) => {
			assert.match(error.message, pattern);
			return true;
		},
	);
}

test("RESERVED_ROUTE_SEGMENTS mirrors the real top-level pages", () => {
	// 双向对账：新增顶层页面目录没登记保留段会让语言路由静默遮蔽它的分页，
	// 删除页面后清单残留同样应当被发现。
	assert.deepEqual(
		[...RESERVED_ROUTE_SEGMENTS].sort(),
		[...namedPageSegments()].sort(),
		"RESERVED_ROUTE_SEGMENTS in src/utils/i18n-routing.ts is out of sync " +
			"with the top-level entries of src/pages/",
	);
});

test("the shipped locale table passes validation", () => {
	// 模块加载时已 fail-fast；这里把「配置合法」钉成显式断言，防回归。
	assert.doesNotThrow(() => validateContentI18n(contentI18n));
	assert.equal(DEFAULT_LOCALE, contentI18n.defaultLocale);
	assert.ok(CONTENT_LOCALES.includes(DEFAULT_LOCALE));
});

test("derived helpers read the locale table, not hard-coded values", () => {
	for (const entry of contentI18n.locales) {
		assert.equal(routeSegmentFor(entry.locale), entry.route);
		assert.equal(contentLanguageLabel(entry.locale), entry.label);
		assert.equal(
			routePrefixFor(entry.locale),
			entry.locale === DEFAULT_LOCALE ? "" : `/${entry.route}`,
		);
	}
});

test("a pure-numeric route is rejected (it would collide with pagination)", () => {
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "ja", route: "2", label: "日本語" },
			],
		},
		/must be a lowercase slug/,
	);
});

test("a route shadowing a top-level page is rejected", () => {
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "ja", route: "posts", label: "日本語" },
			],
		},
		/reserved by a top-level page/,
	);
});

test("an empty label is rejected", () => {
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "ja", route: "ja", label: "  " },
			],
		},
		/label must be a non-empty endonym/,
	);
});

test("a malformed locale tag is rejected", () => {
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "1a", route: "ja", label: "日本語" },
			],
		},
		/BCP 47-shaped tag/,
	);
});

test("duplicate locales and duplicate routes are rejected", () => {
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "en", route: "ja", label: "English" },
			],
		},
		/duplicate locale entry/,
	);
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "ja", route: "en", label: "日本語" },
			],
		},
		/already claimed by another locale/,
	);
});

test("a defaultLocale missing from the table is rejected", () => {
	mustReject(
		{
			defaultLocale: "ja",
			locales: [{ locale: "en", route: "en", label: "English" }],
		},
		/not listed in locales/,
	);
});

test("prefix keys colliding across locales (case/underscore variants) are rejected", () => {
	// `zh-CN` 声明了前缀键 zh / zh-cn / zh_cn；另一条 `zh` 语言的 route
	// `zh-cn` 会让请求期归一映射互相覆盖。
	mustReject(
		{
			defaultLocale: "en",
			locales: [
				{ locale: "en", route: "en", label: "English" },
				{ locale: "zh-CN", route: "zh", label: "简体中文" },
				{ locale: "zh", route: "zh-cn", label: "zh" },
			],
		},
		/URL prefix "zh" is claimed by both/,
	);
});

test("every shell route slug has a same-named top-level page", () => {
	// shell 页面 = 由 `/<route>/<slug>/` 前缀路由复用默认语言具名页主体的
	// 数据驱动页面；slug 指向不存在的页面文件会让 [locale] 路由渲染失败。
	const segments = namedPageSegments();
	for (const shell of SHELL_PAGE_ROUTES) {
		assert.ok(
			segments.has(shell.slug),
			`shell route "${shell.slug}" has no src/pages/${shell.slug}.astro`,
		);
	}
	assert.ok(shellPageForSlug("friends").page === "friends");
	assert.equal(shellPageForSlug("archive"), undefined);
	assert.equal(shellPageForSlug("2"), undefined);
});

test("shell pages get cross-language versions; aggregates stay single-version", () => {
	// 对版期望按语言表动态生成（不钉死语言数量）。
	const expected = (slug) =>
		CONTENT_LOCALES.map((locale) => ({
			locale,
			url: `${routePrefixFor(locale)}/${slug}/`,
		}));

	const home = shellPageLanguageVersions("/", DEFAULT_LOCALE);
	assert.deepEqual(
		home.map((v) => v.url),
		CONTENT_LOCALES.map((l) => `${routePrefixFor(l)}/`),
	);
	for (const version of home) {
		assert.equal(
			Boolean(version.current),
			version.locale === DEFAULT_LOCALE,
			"home versions mark the default locale as current",
		);
	}

	// 默认语言与前缀语言下的 shell 页都产全量对版。
	for (const [pathname, locale] of [
		["/friends/", DEFAULT_LOCALE],
		["/zh/friends/", "zh-CN"],
	]) {
		const versions = shellPageLanguageVersions(pathname, locale);
		assert.deepEqual(
			versions,
			CONTENT_LOCALES.map((l) =>
				l === locale
					? { locale: l, url: pathname, current: true }
					: { locale: l, url: `${routePrefixFor(l)}/friends/` },
			),
			`${pathname} must carry cross-language versions`,
		);
	}

	// 聚合页（归档）保持单版本——前缀路由不存在，其余语言条目禁用。
	assert.deepEqual(shellPageLanguageVersions("/archive/", DEFAULT_LOCALE), [
		{ locale: DEFAULT_LOCALE, url: "/archive/", current: true },
	]);
	// 列表分页保持单版本（既有行为）。
	assert.deepEqual(shellPageLanguageVersions("/2/", DEFAULT_LOCALE), [
		{ locale: DEFAULT_LOCALE, url: "/2/", current: true },
	]);
});
