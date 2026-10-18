export const extractor: { slug: string; name: string; kicker: string; summary: string; kind: string };
export const webTools: Array<{
  slug: string;
  name: string;
  short: string;
  kicker: string;
  start: string;
  summary: string;
}>;
export const FORBIDDEN_PRODUCT_NAMES: string[];
export function zipName(slug: string, version: string): string;
export function toolsMarkup(version: string, base?: string): string;
export function toolsNav(base?: string): string;
export function toolsFooter(base?: string): string;
export function toolPageExtras(slug: string, version: string, base?: string): string;
export function toolChrome(
  tool: { slug: string; name: string; kicker: string; start: string; summary: string },
  version: string,
  base?: string,
): string;
