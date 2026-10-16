import { sanitize } from "./filename";

/** Relative path under Chrome's Downloads folder. */
export function withSubfolder(filename: string, subfolder: string): string {
  const base = filename.replace(/\\/g, "/").replace(/^\/+/, "");
  const folder = sanitize(subfolder).replace(/_+/g, "_");
  if (!folder) return base;
  return `${folder}/${base}`;
}

export function filterHistory<T extends { title: string; filename: string; url: string; quality: string }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.title, item.filename, item.url, item.quality].some((v) => v.toLowerCase().includes(q)),
  );
}
