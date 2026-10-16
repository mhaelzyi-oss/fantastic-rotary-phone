/**
 * Test harness only. It stands in for the BROWSER, not for our code, so the real pieces run together in one
 * ordinary page:
 *   - content script  -> real code (src/content/index.ts): scanning, network watch, HLS engine
 *   - popup UI        -> real code (src/ui/components/FinderApp.tsx)
 *   - service worker  -> real modules (src/background/requests, queue, tabs, storage, downloads)
 *   - chrome.*        -> this file: in-memory storage, message routing, and a downloads API that records what the
 *                        browser was asked to save (and reads blob URLs, so joined HLS files can be checked)
 * Nothing here ships in the extension.
 */
import { exportDiagnostics } from "../src/shared/diagnostics";
import { PREFS_KEY } from "../src/shared/keys";
import { removeFromLibrary, updateLibraryItem } from "../src/shared/library";
import type { RuntimeMessage } from "../src/shared/messages";
import { mergePrefs } from "../src/shared/prefs";
import type { UserPrefs } from "../src/shared/types";
import * as queue from "../src/background/queue";
import * as requests from "../src/background/requests";
import * as storage from "../src/background/storage";
import * as tabs from "../src/background/tabs";

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void;
type Saved = { filename: string; size: number; head: number[]; url: string };
type Item = { id: number; state: "in_progress" | "complete" | "interrupted"; bytesReceived: number; totalBytes: number; fileSize: number; error?: string };

declare global {
  interface Window {
    __downloads: { url: string; filename: string; conflictAction?: string }[];
    __saved: Saved[];
    __alarms: { name: string; when?: number }[];
    __prefsWrites: UserPrefs[];
    /** Make the next browser download of a blob fail to start, to exercise the link-click fallback. */
    __refuseBlobDownload?: boolean;
  }
}

const TAB_ID = 1;

export function installChromeMock(initialPrefs: Partial<UserPrefs> = {}): { enterUiPhase: () => void } {
  let phase: "content" | "ui" = "content";
  const contentListeners = new Set<Listener>();
  const uiListeners = new Set<Listener>();
  const local = new Map<string, unknown>([[PREFS_KEY, mergePrefs({ ...mergePrefs(), ...initialPrefs })]]);
  const session = new Map<string, unknown>();
  const items: Item[] = [];
  window.__downloads = [];
  window.__saved = [];
  window.__alarms = [];
  window.__prefsWrites = [];

  const area = (store: Map<string, unknown>) => ({
    get: async (keys?: string | string[]) => {
      const list = keys === undefined ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))]));
    },
    set: async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v));
    },
  });

  const deliver = (set: Set<Listener>, message: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      let answered = false;
      const respond = (r: unknown) => {
        answered = true;
        resolve(r);
      };
      let asyncAnswer = false;
      for (const fn of [...set]) {
        if (fn(message, {}, respond) === true) asyncAnswer = true;
      }
      if (!asyncAnswer && !answered) resolve(undefined);
    });

  const toUi = (message: unknown) => {
    for (const fn of [...uiListeners]) fn(message, {}, () => undefined);
  };

  const finish = async (id: number, ok: boolean, error?: string) => {
    const item = items[id - 1];
    if (!item) return;
    item.state = ok ? "complete" : "interrupted";
    item.error = error;
    if (ok) item.bytesReceived = item.totalBytes;
    await queue.onChromeDownloadChanged({ id, state: { current: item.state } } as chrome.downloads.DownloadDelta);
  };

  const downloads = {
    download: async (opts: { url: string; filename?: string; conflictAction?: string }) => {
      const isBlob = opts.url.startsWith("blob:");
      if (isBlob && window.__refuseBlobDownload) throw new Error("Invalid URL");
      window.__downloads.push({ url: opts.url, filename: opts.filename ?? "", conflictAction: opts.conflictAction });
      const id = items.length + 1;
      items.push({ id, state: "in_progress", bytesReceived: 0, totalBytes: 1_000_000, fileSize: 0 });
      if (isBlob) {
        // The real browser reads the page's blob. So does this.
        const bytes = new Uint8Array(await (await fetch(opts.url)).arrayBuffer());
        window.__saved.push({ filename: opts.filename ?? "", size: bytes.length, head: [...bytes.slice(0, 8)], url: opts.url });
        items[id - 1]!.totalBytes = bytes.length;
      }
      window.setTimeout(() => {
        const item = items[id - 1];
        if (!item) return;
        item.bytesReceived = Math.round(item.totalBytes * 0.35);
        void queue.onChromeDownloadChanged({ id, bytesReceived: { current: item.bytesReceived } } as chrome.downloads.DownloadDelta);
      }, 60);
      window.setTimeout(() => void finish(id, true), 350);
      return id;
    },
    search: async (q: { id: number }) => items.filter((i) => i.id === q.id),
    onCreated: { addListener() {} },
    onChanged: { addListener() {} },
    onDeterminingFilename: { addListener() {} },
  };

  const worker = async (message: RuntimeMessage): Promise<unknown> => {
    switch (message.type) {
      case "GET_PREFS":
        return storage.loadPrefs();
      case "SET_PREFS": {
        const next = mergePrefs(message.prefs);
        await storage.savePrefs(next);
        window.__prefsWrites.push(next);
        return { ok: true };
      }
      case "GET_SCAN":
      case "RESAN":
        return deliver(contentListeners, { type: "SCAN_PAGE", prefs: await storage.loadPrefs() });
      case "GET_HISTORY":
        return storage.loadHistory();
      case "CLEAR_HISTORY":
        await storage.clearHistory();
        return { ok: true };
      case "GET_QUEUE":
        return queue.listJobs();
      case "START_DOWNLOAD":
        return requests.handleStart(message);
      case "GET_LIBRARY":
        return storage.loadLibrary();
      case "ADD_LIBRARY":
        return requests.handleAddLibrary(message.url);
      case "UPDATE_LIBRARY":
        return { ok: true, items: await storage.updateLibrary((l) => updateLibraryItem(l, message.id, message.patch)) };
      case "REMOVE_LIBRARY":
        return { ok: true, items: await storage.updateLibrary((l) => removeFromLibrary(l, message.id)) };
      case "GET_DIAGNOSTICS": {
        const list = await storage.loadDiagnostics();
        return { text: exportDiagnostics(list), count: list.length };
      }
      case "CLEAR_DIAGNOSTICS":
        await storage.clearDiagnostics();
        return { ok: true };
      // The page engine reports from the content script, exactly as in the extension.
      case "HLS_PROGRESS":
        await queue.onHlsProgress(message, TAB_ID);
        return undefined;
      case "HLS_FAILED":
        await queue.onHlsFailed(message, TAB_ID);
        return undefined;
      case "HLS_READY":
        return { result: await queue.onHlsReady(message, TAB_ID) };
      default:
        return { ok: true };
    }
  };

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: "harness",
        sendMessage: async (message: RuntimeMessage) => {
          if (message.type === "SCAN_RESULT") {
            await tabs.rememberScan(TAB_ID, message.payload);
            toUi(message);
            return undefined;
          }
          // Messages the worker sends to open pages.
          if (message.type === "DOWNLOAD_PROGRESS" || message.type === "QUEUE_UPDATED" || message.type === "DOWNLOAD_ERROR") {
            toUi(message);
            return undefined;
          }
          return worker(message);
        },
        onMessage: {
          addListener: (fn: Listener) => (phase === "content" ? contentListeners : uiListeners).add(fn),
          removeListener: (fn: Listener) => {
            contentListeners.delete(fn);
            uiListeners.delete(fn);
          },
        },
      },
      storage: { local: area(local), session: area(session) },
      tabs: {
        sendMessage: async (tabId: number, message: unknown) => {
          if (tabId !== TAB_ID) throw new Error("No tab with that id.");
          return deliver(contentListeners, message);
        },
      },
      sidePanel: { open: async () => undefined },
      downloads,
      alarms: {
        create: async (name: string, info: { when?: number }) => {
          window.__alarms.push({ name, when: info.when });
        },
      },
      notifications: { create: async () => "n" },
    },
  });

  return {
    enterUiPhase: () => {
      phase = "ui";
    },
  };
}
