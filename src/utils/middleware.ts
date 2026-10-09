import { defineMiddleware } from "astro:middleware";
import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "astro";
import { registerUiLocaleReader } from "../i18n/requestLocale.ts";
import { resolveRequestLocale } from "./i18n-routing.ts";

/**
 * 请求级 UI 语言存储：把 `resolveRequestLocale` 的结果贯穿整条渲染链，
 * 让 `i18n()` 在页面渲染（含 SSG 构建期跑中间件的场景）的任意深度都能
 * 读到当前页面语言，而不必逐层透传。读取器注册到
 * `src/i18n/requestLocale.ts` 的 globalThis 槽位，`translation.ts` 只
 * 依赖那两个纯函数，避免把 `node:async_hooks` 拖进客户端 bundle。
 */
const uiLocaleStore = new AsyncLocalStorage<string>();

registerUiLocaleReader(() => uiLocaleStore.getStore());

/**
 * 内容语言中间件——请求期唯一的语言判定入口。
 *
 * 职责四件事，按顺序：
 *
 * 1. **规范前缀归一**：`/zh-cn/guide/`、`/ZH/guide/` 这类大小写或下划线变体
 *    308 到规范形态 `/zh/guide/`。静态构建不会产出这些路径，所以这条分支
 *    实际只在 `astro dev` / `astro preview` 命中；生产静态托管的 404 归宿主。
 * 2. **写入 `locals.locale`**：`App.Locals` 声明在 `src/env.d.ts`。页面自己
 *    能从集合 id 推导内容语言（见 `i18n-routing.ts`），`locals` 面向的是
 *    **拿不到条目**的消费方——持久外壳、Layout 的 `<html lang>` 回退等，
 *    它们只知道请求路径。
 * 3. **UI 语言上下文**：`uiLocaleStore.run(locale, next)` 让本次请求内
 *    所有 `i18n()` 调用（顶栏、侧栏、分页、Search 等）按请求语言取值，
 *    这是 `/zh/*` 页面主题 UI 跟随语言的唯一机制。
 * 4. **`Content-Language` 响应头**：静态产物的文件不会带自定义响应头，
 *    该头在 dev / preview / SSR 部署形态下生效。
 *
 * 与 Astro 自带 i18n 中间件的关系：Astro 在路由处理**之后**才跑
 * `finalizeI18n`（`dist/core/routing/handler.js`），策略是
 * `prefix-other-locales`——只把「路径里出现默认语言段」的请求判 404，
 * 对 `/zh/*` 不做任何改写，因此这里的重定向与它不冲突，也不必改成
 * `routing: "manual"`。
 */
export const onRequest: MiddlewareHandler = defineMiddleware(
	async (context, next) => {
		const { locale, redirectPath } = resolveRequestLocale(context.url.pathname);

		if (redirectPath) {
			return new Response(null, {
				status: 308,
				headers: { Location: `${redirectPath}${context.url.search}` },
			});
		}

		context.locals.locale = locale;

		const response = await uiLocaleStore.run(locale, () => next());
		response.headers.set("Content-Language", locale);
		return response;
	},
);
