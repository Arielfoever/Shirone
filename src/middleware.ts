/**
 * 主题仓的中间件入口：Astro 约定自动发现 `<srcDir>/middleware.ts`。
 *
 * 实现放在 `src/utils/middleware.ts`，因为包模式没有这条约定——用户项目的
 * `srcDir` 里没有主题的这个文件，`src/integration/index.ts` 必须用
 * `addMiddleware({ entrypoint })` 显式指向一个**确定会随包发布**的路径；
 * 顶层文件是否随包复制不由本仓控制，而 `src/utils/` 一定在。
 * 两种模式因此共享同一份实现，源码仓的自动发现只是入口差异。
 */
export { onRequest } from "./utils/middleware.ts";
