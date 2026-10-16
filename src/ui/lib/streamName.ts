import type { MediaItem } from "../../shared/types";

/**
 * Short name for a stream. A page usually has one title for many streams, so the file name from the URL
 * tells them apart; the page title, host, or position is the fallback.
 */
export function streamName(item: Pick<MediaItem, "url" | "title" | "originHost" | "fileName">, index: number): string {
  if (item.fileName) return item.fileName;
  try {
    const last = new URL(item.url).pathname.split("/").filter(Boolean).pop();
    const name = last ? decodeURIComponent(last) : "";
    if (name) return name;
  } catch {
    /* malformed URL or escape, fall through */
  }
  return item.title || item.originHost || `File ${index + 1}`;
}
