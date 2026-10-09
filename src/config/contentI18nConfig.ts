/**
 * 内容 i18n 配置：内容语言 ↔ URL 路由段 ↔ 展示标签。**唯一真源。**
 *
 * 从 `integrationsConfig.ts` 抽成独立文件是有意为之：语言表是用户可编辑的
 * 站点选择（决定站上展示哪些内容语言），必须走常规配置文件的覆盖通道——
 * 源码模式直接改本文件，包模式在 `shirones/config/contentI18nConfig.ts`
 * 放同名文件（`loadConfigModule()` 与 Vite overlay 都按「用户优先」探测，
 * 见 `docs/packaging-contract.md` 的 config 模块一节）。`integrationsConfig.ts`
 * 在包模式被静态打进 `dist/index.js`、没有覆盖层，语言改动落不进去。
 *
 * **不走 `withUserConfig()`**：那是内容仓 `config/*.yaml` 的深合并通道，
 * 而语言表是路由与集合 id 的结构性输入，`as const` 字面量类型（`ContentLocale`
 * 联合的来源）必须钉在代码里；文件级覆盖已经满足「改配置文件选语言」。
 *
 * URL 形态遵循 Astro 国际化指南的「非默认语言加前缀」策略
 * （`routing.prefixDefaultLocale: false`）：
 *
 * | 内容语言 | 路由段 | 展示标签 | 文章 URL |
 * |---|---|---|---|
 * | `en`（默认） | `en` | English | `/posts/<slug>/` |
 * | `zh-CN` | `zh` | 简体中文 | `/zh/<slug>/` |
 *
 * 三套命名刻意分开：
 *
 * - **路由段**（`en` / `zh`）：URL 首段、`i18n.locales` 条目，也是
 *   `src/pages/[locale]/` 动态路由里 `locale` 参数的取值；
 * - **内容语言**（`en` / `zh-CN`）：内容文件后缀（`index.zh-CN.md`）、
 *   frontmatter `lang`、`hreflang` 与 `Content-Language` 用的 BCP 47 标签；
 * - **展示标签**（`English` / `简体中文`）：语言自称（endonym），顶栏语言菜单、
 *   「本文还提供」互链、语言徽标与桥接页提示直接显示它——语言名描述的是
 *   「那个语言本身」，不随站点 UI 语言翻译，所以不占 `I18nKey` 词典，
 *   十个 locale 模块也不必登记同值副本。
 *
 * 互译只发生在 `src/utils/i18n-routing.ts`——`src/content.config.ts` 的
 * `generateId`、`src/utils/middleware.ts` 与 `url-utils` 都从那里派生。
 * URL 前缀不写在这里：它由路由段推导（默认语言为空串，其余为 `/<route>`），
 * 避免同一张表出现两处可漂移的值。
 *
 * ## 增删语言
 *
 * 只改本表（数组顺序即语言菜单与互链的顺序），其余全部自动跟随：
 * `astroI18n` 派生注入、`i18n-routing` 的全部映射、`[locale]` 路由按表产出
 * 页面与桥接页、列表/互链/徽标按表渲染。路由段冲突、标签缺失等写错形态由
 * `src/utils/i18n-routing.ts` 的 `validateContentI18n()` 在内容同步与构建
 * 入口 fail-fast 报错。
 */
export const contentI18n = {
	defaultLocale: "en",
	locales: [
		{ locale: "en", route: "en", label: "English" },
		{ locale: "zh-CN", route: "zh", label: "简体中文" },
	],
} as const;

/**
 * 注入 Astro 的 `i18n` 配置（由 {@link contentI18n} 派生，同文件保证
 * 包模式下两者看到同一份语言表）。
 *
 * `locales` 只能是**路由段**：Astro 要求 `i18n.locales` 与 URL 首段逐字
 * 匹配，而前缀由 `src/pages/[locale]/` 动态路由按段产出，是 `zh` 不是
 * `zh-CN`；用 `{ path, codes }` 自定义前缀又要求 `output: "server"`，与
 * 本主题的静态输出冲突。`defaultLocale` 同理——它是内容语言标签
 * （`zh-CN`），注入前必须查表换成路由段（`zh`），否则 Astro 的
 * `updateConfig({ i18n })` 校验直接失败（`defaultLocale` 必须在
 * `locales` 内）。
 * `prefixDefaultLocale: false` 让默认语言保持无前缀（`/posts/<slug>/`），
 * 非默认语言走 `/<route>/<slug>/`。
 *
 * 显式形状注解有两个作用：让 `--isolatedDeclarations`（`pnpm type-check`）
 * 能从声明表面导出类型（`.map()` 表达式本身推不出），并把三个 routing
 * 字段钉成字面量必填，供 `updateConfig({ i18n })` 的参数类型直接消费。
 * 包模式由 `src/integration/index.ts` 经 `loadConfigModule()` 动态装载本
 * 文件后取用——静态 import 看不到用户覆盖，会让注入的 `i18n.locales`
 * 与按同一张表生成的路由漂移。
 */
export const astroI18n: {
	locales: string[];
	defaultLocale: string;
	routing: {
		prefixDefaultLocale: false;
		redirectToDefaultLocale: false;
		fallbackType: "redirect";
	};
} = {
	locales: contentI18n.locales.map((entry) => entry.route),
	// Astro 的 `i18n.defaultLocale` 必须是路由段（`locales` 列表成员），
	// 而 `contentI18n.defaultLocale` 是内容语言标签（`zh-CN`）；查表换成
	// 对应路由段（查不到时保留原值，由 `validateContentI18n()` 的
	// defaultLocale ∈ locales 校验兜底报错）。
	defaultLocale:
		contentI18n.locales.find(
			(entry) => entry.locale === contentI18n.defaultLocale,
		)?.route ?? contentI18n.defaultLocale,
	// Astro 7 的 routing 类型要求三个字段一起给出；运行时校验则要求
	// `prefixDefaultLocale: false` 时 `redirectToDefaultLocale` 必须为
	// `false`（true 只允许配 prefix=true，否则可能无限重定向）。该选项
	// 仅在 prefix=true 时参与，`fallbackType` 仅在配置 fallback 映射时
	// 参与——两值都与本配置的实际行为一致，不改变运行时语义。
	routing: {
		prefixDefaultLocale: false as const,
		redirectToDefaultLocale: false as const,
		fallbackType: "redirect" as const,
	},
};
