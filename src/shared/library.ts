import type { LibraryItem, MediaItem } from "./types";

export const MAX_LIBRARY = 500;

export function toLibraryItem(source: MediaItem, now: number = Date.now(), id: string = crypto.randomUUID()): LibraryItem {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title: source.title || "video",
    url: source.url,
    pageUrl: source.pageUrl,
    originHost: source.originHost,
    kind: source.kind,
    tags: [],
    note: "",
  };
}

/** Newest first. A URL that is already saved is not added twice. */
export function addToLibrary(items: LibraryItem[], item: LibraryItem): LibraryItem[] {
  if (items.some((i) => i.url === item.url)) return items;
  return [item, ...items].slice(0, MAX_LIBRARY);
}

export function removeFromLibrary(items: LibraryItem[], id: string): LibraryItem[] {
  return items.filter((i) => i.id !== id);
}

export function updateLibraryItem(
  items: LibraryItem[],
  id: string,
  patch: Partial<Pick<LibraryItem, "title" | "tags" | "note">>,
  now: number = Date.now(),
): LibraryItem[] {
  return items.map((i) =>
    i.id === id
      ? {
          ...i,
          ...patch,
          tags: patch.tags ? normalizeTags(patch.tags) : i.tags,
          note: patch.note != null ? patch.note.slice(0, 500) : i.note,
          title: patch.title != null ? patch.title.slice(0, 120) || i.title : i.title,
          updatedAt: now,
        }
      : i,
  );
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 12);
}

export function parseTags(raw: string): string[] {
  return normalizeTags(raw.split(/[,\s]+/));
}

export function searchLibrary(items: LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => `${i.title} ${i.originHost} ${i.tags.join(" ")} ${i.note}`.toLowerCase().includes(q));
}
