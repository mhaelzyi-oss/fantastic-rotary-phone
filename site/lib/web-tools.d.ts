export const extractor: { slug: string; name: string; kicker: string; summary: string; kind: string };
export const webTools: Array<{ slug: string; name: string; short: string; kicker: string; summary: string }>;
export const FORBIDDEN_PRODUCT_NAMES: string[];
export function zipName(slug: string, version: string): string;
export function toolsMarkup(version: string): string;
