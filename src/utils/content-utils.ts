import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import {
	comparePublicationEntries,
	validatePublicationMetadata,
} from "@utils/content-date";
import {
	CONTENT_LOCALES,
	type ContentLocale,
	contentLanguageLabel,
	DEFAULT_LOCALE,
	getPostLocale,
	splitPostId,
} from "@utils/i18n-routing";
import { siteMarkdownProcessor } from "@utils/markdown-processor";
import { initPostIdMap } from "@utils/permalink-utils";
import {
	findUnknownSeriesSlugs,
	normaliseSeriesSlug,
	resolveSeriesPostCategory,
	type SeriesEntity,
} from "@utils/series-utils";
import { getCategoryUrl, getPostUrl, url } from "@utils/url-utils";
import { postListConfig } from "@/config/postListConfig";

/**
 * 加载系列实体目录（Astro 内容层会缓存集合加载，多次调用成本可忽略）。
 * 放在 content-utils 而不是 series-utils，是为了让 series-utils 保持纯函数、
 * 可在 node --test 下直接导入。
 */
export async function getSeriesCatalog(): Promise<Map<string, SeriesEntity>> {
	const entries = await getCollection("series");
	const catalog = new Map<string, SeriesEntity>();
	for (const entry of entries) {
		catalog.set(entry.id, entry);
	}
	return catalog;
}

/** 已警告过的未知系列 slug：同一笔误在整次构建只提示一次 */
const warnedUnknownSeries = new Set<string>();

/**
 * 加载并按发布时间排序的集合条目，默认语言集。
 *
 * 这是 `getCollection("posts")` 用于**列表/聚合**的唯一入口：语言过滤、
 * 元数据校验、系列默认分类回退、`%post_id%` 序号表都收口在这里，首页、
 * 归档、分类、标签、feed、llms 因此天然只看到默认语言；文章详情路由按
 * 自己的语言传 `locale` 取对应子集。例外只有
 * `getPostLanguageAlternates`——它需要未按语言裁剪的全量条目来找其它
 * 语言版本。
 */
/**
 * 全量集合的构建期准备：draft 过滤、`%post_id%` 序号表、元数据校验、
 * 系列默认分类回退与未知系列一次性警告。
 *
 * 与语言无关，因此可以被按语言过滤的常规路径与 `languageScope: "all"`
 * 的首页混合路径共用；多次调用是幂等的（序号表首调生效、分类回退写入
 * 即解析结果）。
 */
async function prepareAllPosts(): Promise<CollectionEntry<"posts">[]> {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	// 序号表必须用**全量**集合初始化（首调生效）：`%post_id%`、系列
	// index/total 与本次要渲染哪种语言无关，按语言裁剪后再初始化会让
	// 非默认语言的条目永远拿不到编号。
	initPostIdMap(allBlogPosts);

	for (const post of allBlogPosts) validatePublicationMetadata(post);

	// 系列默认分类（回退链）统一在这里落地：显示与聚合共用同一份「有效 category」。
	// 这里对集合条目 data 的写入是有意为之且幂等的（写入的即解析结果本身，
	// 二次解析不变），因此 permalink 的 %category%、PostMeta 与聚合计数保持一致。
	const seriesCatalog = await getSeriesCatalog();
	for (const post of allBlogPosts) {
		const seriesSlug = normaliseSeriesSlug(post.data.series);
		const seriesData = seriesSlug
			? seriesCatalog.get(seriesSlug)?.data
			: undefined;
		post.data.category = resolveSeriesPostCategory(
			post.data.category,
			seriesData,
		);
	}

	// 引用未知系列的笔误：宽容忽略，但给出一次性构建期警告（dev/build 日志可见）
	for (const ref of findUnknownSeriesSlugs(
		allBlogPosts.map((post) => ({ slug: post.id, series: post.data.series })),
		seriesCatalog,
	)) {
		if (!warnedUnknownSeries.has(ref.slug)) {
			warnedUnknownSeries.add(ref.slug);
			console.warn(
				`[series] post "${ref.postSlug}" references unknown series "${ref.slug}" — series card and default-category fallback are skipped`,
			);
		}
	}

	return allBlogPosts;
}

async function getRawSortedPosts(
	locale: ContentLocale = DEFAULT_LOCALE,
): Promise<CollectionEntry<"posts">[]> {
	const allBlogPosts = await prepareAllPosts();

	return allBlogPosts
		.filter((post) => getPostLocale(post.id) === locale)
		.sort(comparePublicationEntries);
}

export async function getSortedPosts(
	locale: ContentLocale = DEFAULT_LOCALE,
): Promise<CollectionEntry<"posts">[]> {
	const sorted = await getRawSortedPosts(locale);

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].id;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
		sorted[i].data.nextUrl = getPostUrl(sorted[i - 1]);
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].id;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
		sorted[i].data.prevUrl = getPostUrl(sorted[i + 1]);
	}

	return sorted;
}

/**
 * 首页列表的数据源——`postListConfig.languageScope` 的唯一消费方。
 *
 * - `"language"`（默认）：与 `getSortedPosts(locale)` 完全一致，现有行为零变化；
 * - `"all"`：全部文章组各出一个代表（选择链见 `PostListLanguageScope` 类型
 *   注释），按代表条目的发布时间统一排序后交给分页。
 *
 * 混合模式**不写** `data.prevSlug/nextSlug/prevUrl/nextUrl` 上下篇字段：
 * 首页卡片不消费它们，而写入会与详情路由装配的「语言内序」落在同一个
 * `entry.data` 上，SSG 并发渲染时互相覆盖——详情页上下篇导航必须始终由
 * 详情自己的装配写入。
 */
export async function getSortedPostsForHome(
	locale: ContentLocale = DEFAULT_LOCALE,
): Promise<CollectionEntry<"posts">[]> {
	if (postListConfig.languageScope !== "all") {
		return getSortedPosts(locale);
	}

	const all = await prepareAllPosts();

	// 按无前缀 slug 归组：同一篇文章的各语言版本共享组键，每组只出一个代表。
	const groups = new Map<string, CollectionEntry<"posts">[]>();
	for (const post of all) {
		const { slug } = splitPostId(post.id);
		const members = groups.get(slug);
		if (members) members.push(post);
		else groups.set(slug, [post]);
	}

	const picked: CollectionEntry<"posts">[] = [];
	for (const members of groups.values()) {
		const representative =
			members.find((m) => getPostLocale(m.id) === locale) ??
			members.find((m) => getPostLocale(m.id) === DEFAULT_LOCALE) ??
			members[0];
		picked.push(representative);
	}

	return picked.sort(comparePublicationEntries);
}

export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
	url?: string;
};

export async function getSortedPostsList(
	locale: ContentLocale = DEFAULT_LOCALE,
): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts(locale);

	// delete post.body, attach pre-calculated URL
	const sortedPostsList: PostForList[] = sortedFullPosts.map((post) => ({
		slug: post.id,
		data: post.data,
		url: getPostUrl(post),
	}));

	return sortedPostsList;
}

export type PostAlternate = {
	/** 目标内容语言（`hreflang` 直接用它）。 */
	locale: ContentLocale;
	/** 该语言版本的站内 URL（已含 base 与语言前缀）。 */
	url: string;
	/** 链接可见文案：语言名（endonym，取自 `contentI18n.locales[].label`）。 */
	label: string;
};

/**
 * 全部内容语言的 endonym 标签（`{locale, label}` 全量列表）。
 * 顶栏语言菜单用它 SSR 出所有条目——没有版本的语言同样要显示（禁用态），
 * 标签是语言自称（`contentI18n.locales[].label`，见 contentI18nConfig），
 * 不随站点 UI 语言翻译，Swup 换页后无需在客户端重建文案。
 */
export function listContentLanguageLabels(): {
	locale: ContentLocale;
	label: string;
}[] {
	return CONTENT_LOCALES.map((locale) => ({
		locale,
		label: contentLanguageLabel(locale),
	}));
}

/**
 * 文章的语言互链：**其它**语言版本（存在才返回，当前语言自身不出现）。
 *
 * 「本文还提供」区块的数据源；空数组时消费方不渲染任何 DOM——
 * 只有一种语言的文章页面与改动前完全一致（零额外负担）。
 */
export async function getPostLanguageAlternates(
	entry: CollectionEntry<"posts">,
): Promise<PostAlternate[]> {
	const { locale: current, slug } = splitPostId(entry.id);
	const all = await getCollection("posts", ({ data }) =>
		import.meta.env.PROD ? data.draft !== true : true,
	);

	const alternates: PostAlternate[] = [];
	for (const locale of CONTENT_LOCALES) {
		if (locale === current) continue;
		const id = locale === DEFAULT_LOCALE ? slug : `${locale}/${slug}`;
		const target = all.find((post) => post.id === id);
		if (!target) continue;
		alternates.push({
			locale,
			url: getPostUrl(target),
			label: contentLanguageLabel(locale),
		});
	}
	return alternates;
}

export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	// 标签聚合保持默认语言：与归档/首页同口径，非默认语言条目不进计数
	const allBlogPosts = await getRawSortedPosts();

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post) => {
		post.data.tags.forEach((tag) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	// 分类聚合与标签同口径：只统计默认语言
	const allBlogPosts = await getRawSortedPosts();
	const seriesCatalog = await getSeriesCatalog();
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post) => {
		// 与 getRawSortedPosts 同一回退链（显式 category → 系列默认分类 → 未分类）
		const seriesSlug = normaliseSeriesSlug(post.data.series);
		const seriesData = seriesSlug
			? seriesCatalog.get(seriesSlug)?.data
			: undefined;
		const effectiveCategory = resolveSeriesPostCategory(
			post.data.category,
			seriesData,
		);
		if (!effectiveCategory) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName = effectiveCategory.trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

// // Moments (动态)：构建期渲染为序列化条目，供页面以 props 传给 Svelte 岛
export type MomentImage = {
	src: string;
	alt: string;
	/** Responsive list thumbnail; the original src remains the viewer/lightbox source. */
	thumbnailSrc?: string;
	thumbnailSrcset?: string;
};

export type MomentItem = {
	id: string;
	/** ISO 字符串（Date 无法跨岛序列化） */
	published: string;
	/** 正文 HTML（站点统一 markdown 插件链渲染） */
	html: string;
	pinned: boolean;
	location: string;
	/** 心情 Iconify 图标名 */
	mood: string;
	tags: string[];
	images: MomentImage[];
};

/** 渲染器按需创建并缓存（插件加载较重，全构建期只跑一次） */
let momentsRendererPromise: ReturnType<
	typeof siteMarkdownProcessor.createRenderer
> | null = null;

const MOMENT_THUMBNAIL_WIDTHS = [192, 384, 640] as const;

function withMomentThumbnails(image: MomentImage): MomentImage {
	const resolvedSrc = image.src.startsWith("/") ? url(image.src) : image.src;
	const match = image.src.match(/^\/images\/moments\/(.+)\.([^./]+)$/i);
	if (!match) {
		return {
			...image,
			src: resolvedSrc,
			thumbnailSrc: image.thumbnailSrc
				? image.thumbnailSrc.startsWith("/")
					? url(image.thumbnailSrc)
					: image.thumbnailSrc
				: resolvedSrc,
		};
	}
	const [, relativePath] = match;
	const candidates = MOMENT_THUMBNAIL_WIDTHS.map((width) => ({
		width,
		src: url(`/assets/moments/thumbnails/${relativePath}-${width}.webp`),
	}));
	return {
		...image,
		src: resolvedSrc,
		thumbnailSrc: candidates.find(({ width }) => width === 384)?.src,
		thumbnailSrcset: candidates
			.map(({ src, width }) => `${src} ${width}w`)
			.join(", "),
	};
}

export async function getSortedMoments(): Promise<MomentItem[]> {
	const entries = await getCollection("moments", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const sorted = entries.sort(comparePublicationEntries);

	momentsRendererPromise ??= siteMarkdownProcessor.createRenderer({});
	const renderer = await momentsRendererPromise;

	return Promise.all(
		sorted.map(async (entry) => {
			const { code } = await renderer.render(entry.body ?? "", {
				frontmatter: entry.data as unknown as Record<string, unknown>,
			});
			return {
				id: entry.id,
				published: new Date(entry.data.published).toISOString(),
				html: code,
				pinned: entry.data.pinned,
				location: entry.data.location,
				mood: entry.data.mood,
				tags: entry.data.tags,
				images: entry.data.images.map(withMomentThumbnails),
			} satisfies MomentItem;
		}),
	);
}
