import { DEFAULT_PROMPT } from "./types";

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

export type FilenameParts = {
  title: string;
  quality: string;
  now?: Date;
  prompt?: string;
  host?: string;
  index?: number;
  ext?: string;
};

/**
 * Build a Downloads-safe name from the user prompt template.
 * Tokens: {title} {YYYYMMDD} {quality} {date}
 * Extra prompt words: "short" truncates the title; "nodate" drops the date token.
 */
export function formatFilename(parts: FilenameParts): string {
  const now = parts.now ?? new Date();
  const ymd = formatYmd(now);
  let prompt = (parts.prompt ?? DEFAULT_PROMPT).trim() || DEFAULT_PROMPT;
  const short = /\bshort\b/i.test(prompt);
  const nodate = /\bnodate\b/i.test(prompt);

  prompt = prompt.replace(/\b(short|nodate|subs|subtitles|1080p|720p|480p|auto)\b/gi, " ");
  if (!prompt.includes("{") && !prompt.toLowerCase().includes(".mp4")) {
    prompt = DEFAULT_PROMPT;
  }

  let title = parts.title || "video";
  if (short) title = title.split(/\s+/).slice(0, 4).join(" ");
  title = sanitize(title).slice(0, 80) || "video";

  const quality = sanitize(parts.quality || "source").replace(/\s+/g, "");
  const host = sanitize(parts.host || "web");
  const index = String(parts.index ?? 1);
  const ext = (parts.ext || "mp4").replace(/^\./, "").toLowerCase();
  let name = prompt
    .replace(/\{title\}/gi, title)
    .replace(/\{quality\}/gi, quality)
    .replace(/\{host\}/gi, host)
    .replace(/\{index\}/gi, index)
    .replace(/\{ext\}/gi, ext)
    .replace(/\{YYYYMMDD\}/gi, nodate ? "" : ymd)
    .replace(/\{date\}/gi, nodate ? "" : ymd)
    .replace(/_{2,}/g, "_")
    .replace(/[ ._-]+$/g, "");

  if (nodate) name = name.replace(/_+/g, "_");
  if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += `.${ext}`;
  return name.replace(/_{2,}/g, "_").replace(ILLEGAL, "") || `video_${ymd}.mp4`;
}

const KNOWN_TOKENS = new Set(["title", "yyyymmdd", "date", "quality", "host", "index", "ext"]);

/** Warnings about a filename template, shown as the user types. An empty list means it is fine. */
export function lintFilenameTemplate(template: string): string[] {
  const warnings: string[] = [];
  if (!template.trim()) return ["The template is empty, so the default will be used."];
  const tokens = [...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] as string);
  for (const token of tokens) {
    if (!KNOWN_TOKENS.has(token.toLowerCase())) warnings.push(`Unknown variable {${token}}.`);
  }
  const open = (template.match(/\{/g) ?? []).length;
  const close = (template.match(/\}/g) ?? []).length;
  if (open !== tokens.length || close !== tokens.length) warnings.push("A brace is missing or extra.");
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(template.replace(/\{[^{}]*\}/g, ""))) {
    warnings.push("Characters that are not allowed in file names will be removed.");
  }
  return warnings;
}

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function sanitize(input: string): string {
  return input.replace(ILLEGAL, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
