import type { SidebarPage } from "../types/sidebarConfig.ts";

/**
 * 数据驱动 shell 页面清单——`/<slug>/` 与其前缀版本 `/<route>/<slug>/`
 * 的单点真源。
 *
 * 这些页面由配置与站点数据驱动（友链、说说、相册……），内容语言中立：
 * 前缀版本渲染同一份数据，差异只在页面 UI 文案（`i18n()` 词典跟随请求
 * 语言，见 `src/utils/middleware.ts`）与 `<html lang>` / 语言菜单对版。
 * 它们不涉及文章聚合语义（归档 / 分类 / 标签 / 系列仍是默认语言单路由，
 * 见 `docs/content-i18n.md` §9）。
 *
 * 本模块保持**零外部依赖**（只 import 类型），`i18n-routing.ts`（被
 * `content.config.ts` 的 generateId 与 `node --test` 单测直接消费）可以
 * 安全引用它做语言菜单对版；功能开关（`enable`）不在这里——那属于页面
 * 配置，由 `[locale]/[...slug].astro` 的 getStaticPaths 在产出阶段判断
 * （关闭的页面不产出前缀路由，等价于 404）。
 */
export type ShellPageRoute = {
	/** 页面标识（`MainGridLayout` 的 page prop / `data-current-page`）。 */
	page: SidebarPage;
	/** URL 段 = `src/pages/` 顶层同名具名路由文件。 */
	slug: string;
};

export const SHELL_PAGE_ROUTES: readonly ShellPageRoute[] = [
	{ page: "about", slug: "about" },
	{ page: "albums", slug: "albums" },
	{ page: "anime", slug: "anime" },
	{ page: "compass", slug: "compass" },
	{ page: "devices", slug: "devices" },
	{ page: "friends", slug: "friends" },
	{ page: "games", slug: "games" },
	{ page: "moments", slug: "moments" },
	{ page: "projects", slug: "projects" },
	{ page: "skills", slug: "skills" },
	{ page: "timeline", slug: "timeline" },
];

/** 按 URL 段查 shell 页面（对版推导用；未知段返回 undefined）。 */
export function shellPageForSlug(slug: string): ShellPageRoute | undefined {
	return SHELL_PAGE_ROUTES.find((entry) => entry.slug === slug);
}
