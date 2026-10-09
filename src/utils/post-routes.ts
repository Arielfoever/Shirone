import type { CollectionEntry } from "astro:content";
import type { Page } from "astro";
import {
	articleConfig,
	permalinkConfig,
	resolveArticleDiscoveryOptions,
	seriesConfig,
} from "@/config";
import { discoverArticles } from "./article-discovery";
import {
	getSeriesCatalog,
	getSortedPosts,
	type PostForList,
} from "./content-utils";
import {
	type ContentLocale,
	getPostSlug,
	routePrefixFor,
} from "./i18n-routing";
import { generatePermalinkSlug, hasCustomPermalink } from "./permalink-utils";
import { buildSeriesContexts, type SeriesPostContext } from "./series-utils";
import { removeFileExtension, url } from "./url-utils";

/**
 * 文章详情路由的共享数据装配。
 *
 * 三个薄路由（`posts/[...slug]`、`[locale]/[...slug]`、`[...permalink]`）只是
 * 「参数键 + 语言前缀」不同，条目筛选、系列上下文、延伸阅读候选与参数值的
 * 计算全部收口在这里，避免三份 getStaticPaths 漂移：
 *
 * - `slugs`     —— 文章段路由（`/posts/<slug>/` 或 `/<route>/<slug>/`，含 alias）；
 * - `permalinks` —— 站根级路由（frontmatter `permalink`，或开启全局
 *                   permalink 时的模板产物）。
 *
 * 参数值一律是**语言中立**的：前缀由路由文件的 `locale` 参数（按
 * `contentI18n.locales` 产出，`routeSegmentFor`）或 `postPathFor` 的默认
 * 语言分支提供，所以 `getPostUrl()` 生成的链接与实际产出的页面路径始终一致。
 */
export type PostRouteProps = {
	entry: CollectionEntry<"posts">;
	discovery: { related: PostForList[]; random: PostForList[] };
	series: SeriesPostContext | null;
	/**
	 * 语言回退（桥接）标记：该条目语言在本路由前缀下没有真实版本，
	 * 页面应渲染 `_PostFallback` 桥接页（提示 + 语言互链）而不是正文。
	 * 由 `withFallbackSlugs` 注入，真实版本路径永远不带它。
	 */
	fallback?: true;
};

export type PostRoutePath = {
	/** 语言中立的参数值（slug / alias / permalink，均无前导斜杠）。 */
	value: string;
	props: PostRouteProps;
};

export async function collectPostRoutePaths(
	locale: ContentLocale,
): Promise<{ slugs: PostRoutePath[]; permalinks: PostRoutePath[] }> {
	// 序号表（%post_id%）、系列回退与元数据校验已在 getSortedPosts 内部
	// 用全量集合完成，这里拿到的是当前语言的子集。
	const blogEntries = await getSortedPosts(locale);

	// 系列上下文：阅读顺序 + index/total + 组内上一篇/下一篇（仅对有系列的文章）。
	// 功能关闭时不查集合、不构建上下文，文章页不产出任何系列 DOM（零额外负担）。
	const seriesContexts = seriesConfig.enable
		? buildSeriesContexts({
				catalog: await getSeriesCatalog(),
				posts: blogEntries.map((entry) => ({
					slug: entry.id,
					title: entry.data.title,
					published: entry.data.published,
					series: entry.data.series,
					seriesOrder: entry.data.seriesOrder,
				})),
			})
		: new Map<string, SeriesPostContext>();

	const discoveryCandidates = blogEntries.map((entry) => ({
		slug: entry.id,
		data: entry.data,
	}));
	const discoveryOptions = resolveArticleDiscoveryOptions(articleConfig);

	const slugs: PostRoutePath[] = [];
	const permalinks: PostRoutePath[] = [];

	for (const entry of blogEntries) {
		const current = discoveryCandidates.find(
			(candidate) => candidate.slug === entry.id,
		);
		const discovery =
			discoveryOptions && current
				? discoverArticles(
						current,
						discoveryCandidates,
						discoveryOptions.relatedCount,
						discoveryOptions.randomCount,
					)
				: { related: [], random: [] };
		const props: PostRouteProps = {
			entry,
			discovery,
			series: seriesContexts.get(entry.id) ?? null,
		};

		// ── 文章段路由：语言中立 slug + 作者 alias ───────────────────────────
		const slug = removeFileExtension(getPostSlug(entry.id));
		slugs.push({ value: slug, props });
		if (entry.data.alias) {
			let alias = entry.data.alias.replace(/^\/+/, "").replace(/\/+$/, "");
			if (alias.startsWith("posts/")) {
				alias = alias.replace(/^posts\//, "");
			}
			if (alias && alias !== slug) {
				slugs.push({ value: alias, props });
			}
		}

		// ── 站根级路由：frontmatter permalink 或全局模板 ──────────────────────
		let permalink: string | null = null;
		if (hasCustomPermalink(entry)) {
			permalink =
				entry.data.permalink?.replace(/^\/+/, "").replace(/\/+$/, "") ?? null;
		} else if (permalinkConfig.enable) {
			// 模板产出的也是语言中立值（%postname% 已剥掉 id 的语言前缀）
			permalink = generatePermalinkSlug(entry);
		}
		if (permalink) {
			permalinks.push({ value: permalink, props });
		}
	}

	return { slugs, permalinks };
}

/** `getStaticPaths` 单条结果的同形结构：参数键由调用方决定（slug/permalink）。 */
export type PostRouteStaticPath = {
	params: Record<string, string>;
	props: PostRouteProps;
};

/**
 * 参数值 → `getStaticPaths` 结果。同键撞值（slug 与 permalink 合并、alias
 * 与 slug 相同）时首条优先，避免同一路径产出两份互相竞争的页面。
 */
function toPaths(
	paths: PostRoutePath[],
	paramKey: "slug" | "permalink",
): PostRouteStaticPath[] {
	const seen = new Set<string>();
	const result: PostRouteStaticPath[] = [];
	for (const path of paths) {
		if (seen.has(path.value)) continue;
		seen.add(path.value);
		result.push({ params: { [paramKey]: path.value }, props: path.props });
	}
	return result;
}

/** `/posts/<slug>/`（默认语言）与 `/<route>/<slug>/`（前缀由 locale 参数提供）共用。 */
export function toSlugPaths(paths: PostRoutePath[]): PostRouteStaticPath[] {
	return toPaths(paths, "slug");
}

/**
 * 语言回退合并：把「其它语言」的文章段路径追加到本语言路径之后，
 * 已被本语言占据的参数值（slug / alias）跳过，追加条目标记 `fallback: true`。
 *
 * 消费方是两个前缀详情路由：本语言缺失的文章在该前缀 URL 下不再 404，
 * 而是由桥接页承接（`_PostFallback`）。只合并 slug 段路径——站根级
 * permalink 没有回退形态，保持 404。真实版本优先（primary 在前），
 * 与 `toSlugPaths` 首条优先的去重语义一致。
 */
export function withFallbackSlugs(
	primary: PostRoutePath[],
	fallback: PostRoutePath[],
): PostRoutePath[] {
	const taken = new Set(primary.map((path) => path.value));
	const merged: PostRoutePath[] = [...primary];
	for (const path of fallback) {
		if (taken.has(path.value)) continue;
		taken.add(path.value);
		merged.push({
			value: path.value,
			props: { ...path.props, fallback: true },
		});
	}
	return merged;
}

/** `/<permalink>/`：只有默认语言由根路由承接，前缀语言落在 `[locale]/` 路由下。 */
export function toPermalinkPaths(
	paths: PostRoutePath[],
): PostRouteStaticPath[] {
	return toPaths(paths, "permalink");
}

/** 列表分页路径的 props：与 Astro paginate 的 `props.page` 同形。 */
export type ListPagePath = {
	params: { slug?: string };
	props: { page: Page<CollectionEntry<"posts">> };
};

/**
 * 前缀语言列表页的分页 paths。
 *
 * 不用 Astro `paginate()`：它的页码参数名硬编码为 `page`
 * （`astro/dist/core/render/paginate.js`），与 `[locale]/[...slug]` 的 `slug`
 * rest 键冲突，同目录又不允许两个 rest 路由。这里按同一份源码复刻
 * `Page<T>` 的全部消费字段（`data/start/end/size/total/currentPage/
 * lastPage/url.*`），URL 形态与根 `[...page]` 完全对称（站内
 * `trailingSlash: "always"`）：
 *
 * - 第 1 页：`/<prefix>/`（rest 参数值为 `void 0`，与 paginate 同约定）；
 * - 第 N 页：`/<prefix>/<N>/`。
 *
 * 页码值与文章 slug/permalink 撞车时由调用方过滤分页项（文章优先，
 * 同 `toSlugPaths` 首条优先语义）。
 */
export function buildListPagePaths(
	posts: CollectionEntry<"posts">[],
	locale: ContentLocale,
	pageSize: number,
): ListPagePath[] {
	const prefix = routePrefixFor(locale);
	const pageUrl = (n: number) =>
		url(n === 1 ? `${prefix}/` : `${prefix}/${n}/`);
	const lastPage = Math.max(1, Math.ceil(posts.length / pageSize));

	return Array.from({ length: lastPage }, (_, index) => {
		const pageNum = index + 1;
		const start = (pageNum - 1) * pageSize;
		const end = Math.min(start + pageSize, posts.length);
		return {
			params: { slug: pageNum === 1 ? undefined : String(pageNum) },
			props: {
				page: {
					data: posts.slice(start, end),
					start,
					end: end - 1,
					size: pageSize,
					total: posts.length,
					currentPage: pageNum,
					lastPage,
					url: {
						current: pageUrl(pageNum),
						next: pageNum === lastPage ? undefined : pageUrl(pageNum + 1),
						prev: pageNum === 1 ? undefined : pageUrl(pageNum - 1),
						first: pageNum === 1 ? undefined : pageUrl(1),
						last: pageNum === lastPage ? undefined : pageUrl(lastPage),
					},
				},
			},
		};
	});
}
