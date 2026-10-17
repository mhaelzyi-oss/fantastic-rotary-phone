import type { RuntimeMessage } from "../shared/messages";
import { SCANS_KEY } from "../shared/keys";
import type { ScanPayload, UserPrefs } from "../shared/types";

/**
 * Latest scan per tab. Kept in memory for speed and mirrored to session storage, because Chrome stops
 * the service worker when idle and the popup must still be able to start a download afterwards.
 */
const scans = new Map<number, ScanPayload>();
let loaded: Promise<void> | undefined;

function sessionArea(): chrome.storage.StorageArea | undefined {
  return typeof chrome !== "undefined" ? chrome.storage?.session : undefined;
}

function load(): Promise<void> {
  loaded ??= (async () => {
    const area = sessionArea();
    if (!area) return;
    try {
      const data = await area.get(SCANS_KEY);
      const stored = (data[SCANS_KEY] ?? {}) as Record<string, ScanPayload>;
      for (const [tabId, payload] of Object.entries(stored)) {
        if (!scans.has(Number(tabId))) scans.set(Number(tabId), payload);
      }
    } catch {
      /* session storage unavailable */
    }
  })();
  return loaded;
}

function save(): void {
  void sessionArea()
    ?.set({ [SCANS_KEY]: Object.fromEntries(scans) })
    .catch(() => undefined);
}

export async function rememberScan(tabId: number, payload: ScanPayload): Promise<void> {
  await load();
  scans.set(tabId, payload);
  save();
}

export async function forgetTab(tabId: number): Promise<void> {
  await load();
  scans.delete(tabId);
  save();
}

export async function cachedScan(tabId: number): Promise<ScanPayload | undefined> {
  await load();
  return scans.get(tabId);
}

/** The open tab whose latest scan lists this URL (as a stream or as one of its qualities). */
export async function findTabForUrl(url: string): Promise<number | undefined> {
  await load();
  for (const [tabId, payload] of scans) {
    if (payload.sources.some((s) => s.url === url || s.variants.some((v) => v.url === url))) return tabId;
  }
  return undefined;
}

export async function allScans(): Promise<ScanPayload[]> {
  await load();
  return [...scans.values()];
}

/** The page under the popup, not the popup window itself (Edge often reports that as currentWindow). */
export async function activePageTab(): Promise<chrome.tabs.Tab | undefined> {
  const last = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (last[0]?.id != null && last[0].id !== chrome.tabs.TAB_ID_NONE) return last[0];
  const cur = await chrome.tabs.query({ active: true, currentWindow: true });
  return cur[0];
}

export async function requestScan(tabId: number, prefs: UserPrefs, contentPath: string): Promise<ScanPayload> {
  const empty: ScanPayload = { pageUrl: "", pageTitle: "", sources: [] };
  const ask = chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE", prefs } satisfies RuntimeMessage) as Promise<ScanPayload>;
  const timed = Promise.race([
    ask,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), 2000);
    }),
  ]);
  try {
    const payload = await timed;
    await rememberScan(tabId, payload);
    return payload;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [contentPath] });
    } catch {
      /* cannot inject */
    }
    return {
      ...empty,
      error: "Still scanning... if this stays empty, open a normal http(s) page and click Rescan.",
    };
  }
}

export function forgetAllScans(): void {
  scans.clear();
  loaded = Promise.resolve();
}