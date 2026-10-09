import I18nKey from "@i18n/i18nKey";
import { aboutConfig } from "@/config/aboutConfig";
import { albumsConfig } from "@/config/albumsConfig";
import { animeConfig } from "@/config/animeConfig";
import { compassConfig } from "@/config/compassConfig";
import { devicesConfig } from "@/config/devicesConfig";
import { friendsConfig } from "@/config/friendsConfig";
import { gamesConfig } from "@/config/gamesConfig";
import { momentsConfig } from "@/config/momentsConfig";
import { projectsConfig } from "@/config/projectsConfig";
import { seriesConfig } from "@/config/seriesConfig";
import { skillsConfig } from "@/config/skillsConfig";
import { timelineConfig } from "@/config/timelineConfig";
import type {
	NavBarConfig,
	NavBarConfigOverride,
	NavBarLink,
	NavBarLinkOverride,
} from "@/types/navBarConfig";
import { getUserConfig } from "../utils/config-overlay.ts";
import { pruneUnavailableNavLinks } from "../utils/nav-utils.ts";

/**
 * 导航栏配置（统一单一来源）。
 * - LinkPresets：命名链接预设表 —— 名称 / 地址 / 图标单点维护，可整体复用；
 * - navBarConfig：导航结构 —— 顺序 + 分组（children 子菜单），
 *   同时驱动顶栏下拉菜单与全端导航抽屉。
 * 新增入口：先在 LinkPresets 登记预设，再在 navBarConfig.links 按序引用。
 *
 * `name` 统一存 `"$t:<i18nKey>"` 引用（GitHub 这类字面量除外），**不在此
 * 求值**：本模块在服务器启动/构建加载时执行一次，立即 `i18n()` 会把文案
 * 冻在当时的语言上。词条由渲染方（TopAppBar / SiteNavigationDrawer）在
 * 请求上下文内调 `resolveI18nText` 解析，导航文案因此跟随页面语言。
 *
 * 内容仓可用 `config/nav-bar.yaml` 整体替换 `links`，写法见 `NavBarLinkOverride`。
 * 无论哪种来源，指向已关闭功能页面的入口都会在 `navBarConfig` 处被裁掉。
 */
export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: "$t:home",
		url: "/",
		icon: "material-symbols:home-outline-rounded",
		pageKey: "home",
	},
	Archive: {
		name: "$t:archive",
		url: "/archive/",
		icon: "material-symbols:archive-outline-rounded",
		pageKey: "archive",
	},
	Friends: {
		name: "$t:friends",
		url: "/friends/",
		icon: "material-symbols:handshake-outline-rounded",
		pageKey: "friends",
	},
	Moments: {
		name: "$t:moments",
		url: "/moments/",
		icon: "material-symbols:auto-awesome-outline-rounded",
		pageKey: "moments",
	},
	Anime: {
		name: "$t:anime",
		url: "/anime/",
		icon: "material-symbols:live-tv-outline-rounded",
		pageKey: "anime",
	},
	Compass: {
		name: "$t:compass",
		url: "/compass/",
		icon: "material-symbols:explore-rounded",
		pageKey: "compass",
	},
	Skills: {
		name: "$t:skills",
		url: "/skills/",
		icon: "material-symbols:workspaces-outline-rounded",
		pageKey: "skills",
	},
	Projects: {
		name: "$t:projects",
		url: "/projects/",
		icon: "material-symbols:deployed-code-outline-rounded",
		pageKey: "projects",
	},
	Devices: {
		name: "$t:devices",
		url: "/devices/",
		icon: "material-symbols:devices-rounded",
		pageKey: "devices",
	},
	Games: {
		name: "$t:games",
		url: "/games/",
		icon: "material-symbols:sports-esports-outline-rounded",
		pageKey: "games",
	},
	Timeline: {
		name: "$t:timeline",
		url: "/timeline/",
		icon: "material-symbols:timeline-rounded",
		pageKey: "timeline",
	},
	Albums: {
		name: "$t:albums",
		url: "/albums/",
		icon: "material-symbols:photo-library-outline-rounded",
		pageKey: "albums",
	},
	Categories: {
		name: "$t:categories",
		url: "/categories/",
		icon: "material-symbols:folder-outline-rounded",
		pageKey: "categories",
	},
	Tags: {
		name: "$t:tags",
		url: "/tags/",
		icon: "material-symbols:tag-rounded",
		pageKey: "tags",
	},
	Series: {
		name: "$t:series",
		url: "/series/",
		icon: "material-symbols:auto-stories-outline-rounded",
		pageKey: "series",
	},
	About: {
		name: "$t:about",
		url: "/about/",
		icon: "material-symbols:info-outline-rounded",
		pageKey: "about",
	},
	GitHub: {
		name: "GitHub",
		url: "https://github.com/LyraVoid/Shirone",
		icon: "fa7-brands:github",
		external: true,
		pageKey: "github",
	},
};

const defaultNavBarConfig: NavBarConfig = {
	links: [
		LinkPresets.Home,
		LinkPresets.Archive,
		LinkPresets.Friends,
		LinkPresets.Moments,
		LinkPresets.Anime,
		LinkPresets.Compass,
		LinkPresets.Albums,
		{
			name: "$t:more",
			icon: "material-symbols:apps-rounded",
			children: [
				LinkPresets.Timeline,
				LinkPresets.Projects,
				LinkPresets.Devices,
				LinkPresets.Games,
				LinkPresets.Skills,
				// 分类/标签入口不进导航菜单（避免菜单项过多），预设已登记指向独立页面，
				// 需要时取消注释即可
				// LinkPresets.Categories,
				// LinkPresets.Tags,
				LinkPresets.About,
				LinkPresets.GitHub,
			],
		},
	],
};

import { I18N_REFERENCE_PREFIX } from "../utils/i18n-utils.ts";

function fail(message: string): never {
	throw new Error(`[config] nav-bar：${message}`);
}

/**
 * 条目名只做 `$t:` 引用格式校验，**不求值**。
 *
 * 词条解析推迟到渲染期（`TopAppBar` / `SiteNavigationDrawer` 的
 * `resolveI18nText`）：本模块在服务器启动/构建加载时求值一次，立即
 * `i18n()` 会把文案冻在当时的语言上，`/zh/*` 页面的导航就再也切不过
 * 来。校验保留下来——内容仓写错词条必须在配置加载时立刻抛出。
 */
function resolveName(name: string): string {
	if (name.startsWith(I18N_REFERENCE_PREFIX)) {
		const key = name.slice(I18N_REFERENCE_PREFIX.length);
		if (!Object.hasOwn(I18nKey, key)) {
			fail(
				`未知的 i18n 词条 "${key}"。可用词条见 src/i18n/i18nKey.ts；` +
					" 若本意是普通文本，去掉开头的 $t: 即可。",
			);
		}
	}
	return name;
}

/**
 * 已关闭功能对应的站内路由（去尾斜杠），供 `pruneUnavailableNavLinks()` 裁剪导航入口。
 *
 * 功能关闭时对应页面会 `Astro.redirect("/404/")`，因此这些路由不得再出现在导航里。
 * 关闭判定只看配置，与导航结构无关，因此默认结构与内容仓声明式条目共用同一张表。
 */
const unavailableFeatureRoutes: ReadonlySet<string> = new Set([
	...(friendsConfig.enable ? [] : ["/friends"]),
	...(momentsConfig.enable ? [] : ["/moments"]),
	...(animeConfig.enable ? [] : ["/anime"]),
	...(compassConfig.enable ? [] : ["/compass"]),
	...(albumsConfig.enable ? [] : ["/albums"]),
	...(skillsConfig.enable ? [] : ["/skills"]),
	...(projectsConfig.enable ? [] : ["/projects"]),
	...(devicesConfig.enable ? [] : ["/devices"]),
	...(gamesConfig.enable ? [] : ["/games"]),
	...(timelineConfig.enable ? [] : ["/timeline"]),
	...(aboutConfig.enable ? [] : ["/about"]),
	...(seriesConfig.enable ? [] : ["/series"]),
]);

/**
 * 把内容仓的声明式导航条目还原成 `NavBarLink`。
 *
 * 预设名与 i18n 词条只有在这里才能校验（`LinkPresets` 与 `I18nKey` 都住在代码仓，
 * 生成期的 Node 脚本受路径别名所限读不到），因此错误在构建加载配置时抛出。
 */
export function resolveNavBarLinks(
	entries: readonly NavBarLinkOverride[],
	presets: Record<string, NavBarLink> = LinkPresets,
): NavBarLink[] {
	return entries.map((entry) => {
		let base: NavBarLink | null = null;
		if (entry.preset !== undefined) {
			base = presets[entry.preset] ?? null;
			if (!base) {
				fail(
					`未知的预设 "${entry.preset}"。可用预设：${Object.keys(presets).join("、")}。`,
				);
			}
		}

		const name =
			entry.name !== undefined ? resolveName(entry.name) : base?.name;
		if (name === undefined) {
			fail("每个条目都需要 name，或用 preset 引用一个内置预设。");
		}

		// 未声明 children 时沿用预设自带的子菜单（已由 ...base 带入）。
		return {
			...base,
			name,
			...(entry.url !== undefined ? { url: entry.url } : {}),
			...(entry.icon !== undefined ? { icon: entry.icon } : {}),
			...(entry.pageKey !== undefined ? { pageKey: entry.pageKey } : {}),
			...(entry.external !== undefined ? { external: entry.external } : {}),
			...(entry.children
				? { children: resolveNavBarLinks(entry.children, presets) }
				: {}),
		};
	});
}

const userNavBar = getUserConfig("navBar") as NavBarConfigOverride | undefined;

/**
 * 导航栏最终结构。
 *
 * 默认结构与内容仓 `config/nav-bar.yaml`（声明式列表，整体替换默认导航，不走任何
 * enable 分支）在这里汇合后统一裁剪：功能关掉时入口一并消失，两种模式下行为一致，
 * 不会留下点进去 404 的死链。
 */
export const navBarConfig: NavBarConfig = {
	links: pruneUnavailableNavLinks(
		resolveNavBarLinks(
			userNavBar ? userNavBar.links : defaultNavBarConfig.links,
		),
		unavailableFeatureRoutes,
	),
};
