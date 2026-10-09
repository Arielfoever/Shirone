// 循环依赖规避：navBarConfig 等配置消费 i18n，本模块只允许从具体文件导入 siteConfig 与 i18nConfig，
// 禁止走 @/config barrel（见 src/config/README.md）
import { i18nConfig } from "../config/i18nConfig.ts";
import { siteConfig } from "../config/siteConfig.ts";
import type I18nKey from "./i18nKey.ts";
import { en } from "./languages/en.ts";
import { es } from "./languages/es.ts";
import { id } from "./languages/id.ts";
import { ja } from "./languages/ja.ts";
import { ko } from "./languages/ko.ts";
import { th } from "./languages/th.ts";
import { tr } from "./languages/tr.ts";
import { vi } from "./languages/vi.ts";
import { zh_CN } from "./languages/zh_CN.ts";
import { zh_TW } from "./languages/zh_TW.ts";
import { readRequestUiLocale } from "./requestLocale.ts";

export type Translation = {
	[K in I18nKey]: string;
};

/** `i18n()` 的可选参数。 */
export type I18nOptions = {
	/**
	 * 显式指定语言，跳过整条解析链。
	 *
	 * 仅供**必须与请求语言无关**的消费方使用，例如 Markdown 渲染产出的
	 * 字段卡标签——同一份渲染 HTML 要跨语言复用，缓存首跑在哪种语言下
	 * 都必须得到同样的文案。其余场景一律不要传，让解析链跟随当前页面。
	 */
	lang?: string;
};

const defaultTranslation = en;

const map: { [key: string]: Translation } = {
	es: es,
	en: en,
	en_us: en,
	en_gb: en,
	en_au: en,
	zh_cn: zh_CN,
	zh_tw: zh_TW,
	ja: ja,
	ja_jp: ja,
	ko: ko,
	ko_kr: ko,
	th: th,
	th_th: th,
	vi: vi,
	vi_vn: vi,
	id: id,
	tr: tr,
	tr_tr: tr,
};

/**
 * 语言标识归一化：`zh-CN` / `zh_cn` / `ZH-cn` → `zh_cn`。
 *
 * 请求上下文（`resolveRequestLocale`）与 `<html lang>` 产出 BCP 47 连字符
 * 形态，而词典 `map` 与常见配置写法用下划线；两边任何一边不归一化，
 * `map[...]` 就会未命中并**静默回落英文**（曾导致 `/zh/*` 页面全部 UI
 * 文案停留在 en）。所有进入词典/覆盖域查询的语言都必须先过这一步。
 */
function normalizeLang(lang: string): string {
	return lang.toLowerCase().replace(/-/g, "_");
}

export function getTranslation(lang: string): Translation {
	return map[normalizeLang(lang)] || defaultTranslation;
}

/**
 * 当前生效的 UI 语言，按三级解析链求值：
 *
 * 1. **请求上下文**（中间件注册的 `AsyncLocalStorage` 读取器，见
 *    `requestLocale.ts`）——SSR 请求与 SSG 页面渲染都在中间件包裹的异步
 *    上下文内，`locals.locale` 是什么这里就是什么，`/zh/*` 页面因此拿到
 *    中文文案；
 * 2. **`<html data-ui-locale>`**——浏览器端（hydration、客户端工具）读
 *    SSR 固化的属性；跨语言导航必走整页刷新，该值恒等于目标页面语言；
 * 3. **`siteConfig.lang`**——无请求上下文的构建期兜底（`getStaticPaths`、
 *    feed 生成、配置层模块求值）。
 */
function activeUiLang(): string {
	const requestLang = readRequestUiLocale();
	if (requestLang) return requestLang;

	if (typeof document !== "undefined") {
		const domLang = document.documentElement.dataset.uiLocale;
		if (domLang) return domLang;
	}

	return siteConfig.lang || "en";
}

export function i18n(key: I18nKey, options?: I18nOptions): string {
	// 归一化后 lang 恒为小写下划线形态（见 normalizeLang）。
	const lang = normalizeLang(options?.lang ?? activeUiLang());

	// 1. 查找用户自定义 i18n 覆盖域（键形态如 zh_CN / zh_cn / zh-CN 均可）
	if (i18nConfig && typeof i18nConfig === "object") {
		const langOverrides =
			i18nConfig[lang] ??
			Object.entries(i18nConfig).find(
				([k]) => normalizeLang(k) === lang,
			)?.[1];

		if (langOverrides && typeof langOverrides === "object") {
			const customVal = langOverrides[key];
			if (typeof customVal === "string") {
				return customVal;
			}
		}
	}

	// 2. 回退到内置 10 语言词典
	return getTranslation(lang)[key];
}
