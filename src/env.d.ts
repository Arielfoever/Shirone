/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
	interface Locals {
		/**
		 * 请求路径解析出的内容语言，由 `src/middleware.ts`（实现在
		 * `src/utils/middleware.ts`）写入。解析语义与 id 编码规则见
		 * `src/utils/i18n-routing.ts`。
		 *
		 * 中间件未运行时为 `undefined`（例如自定义适配器跳过了中间件），
		 * 消费方必须回退：页面从集合 id 推导，其余场景回退到默认语言。
		 */
		locale?: import("./utils/i18n-routing.ts").ContentLocale;
	}
}

declare module "virtual:shirone-music-sidebar" {
	const component:
		| typeof import("@components/organisms/music/MusicSidebar.astro").default
		| null;
	export default component;
}

declare module "*scripts/anime/providers/bangumi.mjs" {
	export function fetchBangumiData(config: unknown): Promise<{
		provider: "bangumi";
		accountRef: string;
		rawItems: unknown[];
	}>;
}

declare module "*scripts/anime/providers/bilibili.mjs" {
	export function fetchBilibiliData(config: unknown): Promise<{
		provider: "bilibili";
		accountRef: string;
		rawItems: unknown[];
	}>;
}
