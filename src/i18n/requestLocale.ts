/**
 * 请求级 UI 语言上下文——`i18n()` 语言解析链的第一环。
 *
 * 设计约束：
 *
 * - 读取方是 `translation.ts`，它被 Astro SSR、Svelte hydration 与客户端
 *   工具共同导入，因此本模块**零依赖**（尤其不能静态 import
 *   `node:async_hooks`，否则会被打进浏览器 bundle）。
 * - 写入方是 Node 端中间件（`src/utils/middleware.ts`）：它用
 *   `AsyncLocalStorage` 维护请求上下文，再把「读取当前 store」的闭包
 *   注册到这里。通过 `globalThis` 共享，让 ALS 实例与读取函数解耦，
 *   两边各自只依赖本模块的这两个纯函数。
 * - 浏览器端永远读不到注册的读取器，`readRequestUiLocale()` 返回
 *   `undefined`，由调用方（`i18n()`）继续走 `<html data-ui-locale>` 回退。
 *
 * 三级解析链（完整说明见 `src/i18n/AGENTS.md`）：
 *
 * 1. `readRequestUiLocale()`——SSR 请求期 / SSG 页面渲染期（中间件 ALS）；
 * 2. `document.documentElement.dataset.uiLocale`——浏览器（hydration、
 *    客户端导航后同样读整页固化的值；跨语言导航必走整页刷新，值恒正确）；
 * 3. `siteConfig.lang`——构建期无请求上下文的场景（`getStaticPaths`、
 *    feed 生成、配置层模块求值）。
 */

type UiLocaleReader = () => string | undefined;

type GlobalStore = typeof globalThis & {
	__shirone_request_ui_locale__?: UiLocaleReader;
};

const store = globalThis as GlobalStore;

/** 由中间件在模块加载时注册一次；重复注册以最后一次为准（如 HMR）。 */
export function registerUiLocaleReader(reader: UiLocaleReader): void {
	store.__shirone_request_ui_locale__ = reader;
}

/** 当前请求（或页面渲染）的 UI 语言；无上下文时返回 `undefined`。 */
export function readRequestUiLocale(): string | undefined {
	return store.__shirone_request_ui_locale__?.();
}
