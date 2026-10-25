import type {
	LicenseConfig,
	LicenseOverride,
	ResolvedLicenseConfig,
} from "@/types/config";

/**
 * 解析单篇文章的版权配置：frontmatter 中显式提供的字段优先，
 * 作者缺省回退到站点作者名，其余字段回退到全站 licenseConfig。
 */
export function resolveLicenseConfig(
	base: LicenseConfig,
	override?: LicenseOverride | null,
	fallbackAuthor = "",
): ResolvedLicenseConfig {
	const name = override?.name?.trim();
	const url = override?.url?.trim();
	const source = override?.source?.trim() || "";
	const author = override?.author;
	const authorName =
		(typeof author === "string" ? author : author?.name)?.trim() ||
		fallbackAuthor;
	const authorUrl = (typeof author === "object" ? author?.url?.trim() : "") || "";

	return {
		enable: override?.enable ?? base.enable,
		name: name || base.name,
		url: url || base.url,
		author: {
			name: authorName,
			url: authorUrl,
		},
		source,
	};
}
