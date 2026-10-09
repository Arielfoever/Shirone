/**
 * 文章列表配置类型。值与默认配置见 src/config/postListConfig.ts。
 */

/** 列表布局模式：list 单列（封面左/右）/ grid 自适应网格（封面置顶贴边） */
export type PostListMode = "list" | "grid";

/** list 模式下封面所在侧（grid 模式封面固定置顶，不受此项影响） */
export type PostListCoverSide = "left" | "right";

/** grid 模式卡片最小宽度档位（映射 --post-card-min，不暴露裸像素） */
export type PostCardWidth = "compact" | "regular" | "relaxed";

export interface PostListLayoutConfig {
	mode: PostListMode;
	cover: PostListCoverSide;
	cardWidth: PostCardWidth;
}

/**
 * 首页列表的多语言范围：
 *
 * - `"language"`（默认）：只渲染当前页面语言的文章——`/` 只列默认语言，
 *   `/zh/` 只列 zh-CN，各语言列表互不可见；
 * - `"all"`：渲染**全部文章组**。每篇文章按无前缀 slug 归为一组
 *   （同一篇文章的各语言版本同组），每组取一个代表：
 *   ① 当前页面语言版本；② 缺失时回退默认语言版本（“以默认语言显示”）；
 *   ③ 组内连默认语言版本都没有时取组内任一版本。
 *   卡片链接一律指向**页面语言前缀**下的路径（`PostPage` 按页面语言生成，
 *   不再按条目语言）：有真实版本时渲染正文，缺失时该 URL 由语言回退
 *   桥接页承接（`pages/_PostFallback.astro`，提示 + 语言互链）——因此
 *   混合列表的顶栏与界面语言始终跟随页面路由，不随卡片内容语言跳变。
 *
 * 仅作用于首页列表；归档、分类、标签、feed 等聚合口径保持按语言过滤不变。
 */
export type PostListLanguageScope = "language" | "all";

export interface PostListConfig {
	/** 首页每页文章数 */
	pageSize: number;
	layout: PostListLayoutConfig;
	/** 首页列表的多语言范围，语义见 `PostListLanguageScope` */
	languageScope: PostListLanguageScope;
	/**
	 * 混合列表（`languageScope: "all"`）中缺少当前页面语言版本的卡片
	 * 是否渲染语言徽标（显示该文章自身语言的 endonym + title 提示）。
	 * 默认 `true`；设为 `false` 完全不渲染徽标 DOM。
	 */
	languageFallbackBadge: boolean;
}
