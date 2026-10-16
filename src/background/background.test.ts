// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, PREFS_KEY, QUEUE_KEY } from "../shared/keys";
import type { DownloadJob, HistoryItem, MediaItem } from "../shared/types";

/**
 * The real background modules (requests, queue, tabs, downloads, storage) running against a small fake of the
 * chrome.* APIs. It stands in for the browser, so what is checked is our own logic: what gets started, how, and
 * what is refused. It includes a service-worker restart: modules are reloaded while "browser" storage survives.
 */

type FakeItem = { id: number; state: "in_progress" | "complete" | "interrupted"; error?: string; bytesReceived: number; totalBytes: number; fileSize: number };

function makeChrome() {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  const area = (store: Map<string, unknown>) => ({
    get: async (keys?: string | string[]) => {
      const list = keys === undefined ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))]));
    },
    set: async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v));
    },
  });
  const downloads: FakeItem[] = [];
  const calls = {
    download: [] as { url: string; filename?: string; conflictAction?: string }[],
    tabMessages: [] as { tabId: number; message: { type: string; [k: string]: unknown } }[],
    alarms: [] as { name: string; when?: number }[],
    runtime: [] as { type: string }[],
  };
  const fake = {
    runtime: {
      id: "ext",
      sendMessage: vi.fn(async (message: { type: string }) => {
        calls.runtime.push(message);
      }),
    },
    storage: { local: area(local), session: area(session) },
    tabs: {
      sendMessage: vi.fn(async (tabId: number, message: { type: string }) => {
        calls.tabMessages.push({ tabId, message });
        return { ok: true };
      }),
    },
    downloads: {
      download: vi.fn(async (opts: { url: string; filename?: string; conflictAction?: string }) => {
        calls.download.push(opts);
        const id = downloads.length + 1;
        downloads.push({ id, state: "in_progress", bytesReceived: 0, totalBytes: 100, fileSize: 0 });
        return id;
      }),
      search: vi.fn(async (q: { id: number }) => downloads.filter((d) => d.id === q.id)),
    },
    alarms: {
      create: vi.fn(async (name: string, info: { when?: number }) => {
        calls.alarms.push({ name, when: info.when });
      }),
    },
    notifications: { create: vi.fn(async () => "n") },
  };
  return { fake, local, session, downloads, calls };
}

let env: ReturnType<typeof makeChrome>;

const source = (patch: Partial<MediaItem> = {}): MediaItem => ({
  url: "https://cdn.example.com/a.mp4",
  kind: "progressive",
  originHost: "cdn.example.com",
  title: "a",
  pageUrl: "https://example.com/watch",
  source: "dom",
  encrypted: false,
  variants: [{ url: "https://cdn.example.com/a.mp4", label: "720p", height: 720, encrypted: false, kind: "progressive" }],
  subtitles: [],
  ...patch,
});

const hls = (patch: Partial<MediaItem> = {}) =>
  source({
    url: "https://cdn.example.com/live/index.m3u8",
    kind: "hls",
    variants: [{ url: "https://cdn.example.com/live/index.m3u8", label: "720p", height: 720, encrypted: false, kind: "hls" }],
    ...patch,
  });

const dash = () =>
  source({
    url: "https://cdn.example.com/x.mpd",
    kind: "dash",
    variants: [{ url: "https://cdn.example.com/x.mpd", label: "DASH", encrypted: false, kind: "dash" }],
  });

async function modules() {
  const [requests, queue, tabs] = await Promise.all([import("./requests"), import("./queue"), import("./tabs")]);
  return { requests, queue, tabs };
}

async function scanned(sources: MediaItem[], tabId = 7) {
  const m = await modules();
  await m.tabs.rememberScan(tabId, { pageUrl: "https://example.com/watch", pageTitle: "Watch", sources });
  return m;
}

const start = (url: string, extra: Record<string, unknown> = {}) => ({
  type: "START_DOWNLOAD" as const,
  url,
  filename: "clip.mp4",
  title: "clip",
  quality: "720p",
  ...extra,
});

beforeEach(() => {
  vi.resetModules();
  env = makeChrome();
  (globalThis as unknown as { chrome: unknown }).chrome = env.fake;
});

describe("direct files", () => {
  it("hands a detected MP4 to the browser, in the subfolder, and records it when it completes", async () => {
    const m = await scanned([source()]);
    const res = await m.requests.handleStart(start("https://cdn.example.com/a.mp4"));
    expect(res.ok).toBe(true);
    expect(env.calls.download).toHaveLength(1);
    expect(env.calls.download[0]).toMatchObject({ url: "https://cdn.example.com/a.mp4", filename: "KUIVideoExtractor/clip.mp4" });

    env.downloads[0]!.state = "complete";
    env.downloads[0]!.bytesReceived = 100;
    await m.queue.onChromeDownloadChanged({ id: 1, state: { current: "complete" } } as chrome.downloads.DownloadDelta);
    const history = env.local.get(HISTORY_KEY) as HistoryItem[];
    expect(history[0]).toMatchObject({ ok: true, filename: "KUIVideoExtractor/clip.mp4" });
    const jobs = await m.queue.listJobs();
    expect(jobs[0]?.state).toBe("complete");
  });

  it("refuses a URL that was never detected, a DRM stream and a non-http URL", async () => {
    const m = await scanned([source(), source({ url: "https://cdn.example.com/p.m3u8", kind: "hls", encrypted: true, variants: [{ url: "https://cdn.example.com/p.m3u8", label: "x", encrypted: true, kind: "hls" }] })]);
    expect(await m.requests.handleStart(start("https://evil.example.net/steal.mp4"))).toMatchObject({ ok: false });
    expect(await m.requests.handleStart(start("https://cdn.example.com/p.m3u8"))).toMatchObject({ ok: false });
    expect(await m.requests.handleStart(start("file:///C:/secret.mp4"))).toMatchObject({ ok: false });
    expect(env.calls.download).toHaveLength(0);
    expect(env.calls.tabMessages).toHaveLength(0);
  });

  it("asks for a declaration only when the user turned that on", async () => {
    const m = await scanned([source()]);
    env.local.set(PREFS_KEY, { requireAuthority: true });
    const refused = await m.requests.handleStart(start("https://cdn.example.com/a.mp4"));
    expect(refused).toMatchObject({ ok: false, code: expect.any(String) });
    const ok = await m.requests.handleStart(start("https://cdn.example.com/a.mp4", { authority: { basis: "owner", confirmed: true } }));
    expect(ok.ok).toBe(true);
  });
});

describe("HLS in the page", () => {
  it("runs in the tab that found the stream, then lets the browser save the joined file", async () => {
    const m = await scanned([hls()]);
    const res = await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    expect(res.ok).toBe(true);
    // The playlist itself is never handed to the downloads API.
    expect(env.calls.download).toHaveLength(0);
    expect(env.calls.tabMessages).toHaveLength(1);
    const { tabId, message } = env.calls.tabMessages[0]!;
    expect(tabId).toBe(7);
    expect(message).toMatchObject({ type: "HLS_RUN", url: "https://cdn.example.com/live/index.m3u8" });
    const jobId = message.jobId as string;

    await m.queue.onHlsProgress({ type: "HLS_PROGRESS", jobId, done: 5, total: 10, bytes: 5000 }, 7);
    const mid = (await m.queue.listJobs())[0]!;
    expect(mid).toMatchObject({ state: "in_progress", engine: "page" });
    expect(mid.percent).toBeCloseTo(50, 0);
    expect(env.calls.runtime.some((r) => r.type === "DOWNLOAD_PROGRESS")).toBe(true);

    const ready = await m.queue.onHlsReady({ type: "HLS_READY", jobId, blobUrl: "blob:https://example.com/abc", filename: "clip.ts", bytes: 9999 }, 7);
    expect(ready).toBe("started");
    expect(env.calls.download).toHaveLength(1);
    expect(env.calls.download[0]).toMatchObject({ url: "blob:https://example.com/abc", filename: "KUIVideoExtractor/clip.ts" });

    env.downloads[0]!.state = "complete";
    await m.queue.onChromeDownloadChanged({ id: 1, state: { current: "complete" } } as chrome.downloads.DownloadDelta);
    const history = env.local.get(HISTORY_KEY) as HistoryItem[];
    expect(history[0]).toMatchObject({ ok: true, filename: "KUIVideoExtractor/clip.ts" });
  });

  it("ignores reports from another tab and non-blob addresses", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const jobId = env.calls.tabMessages[0]!.message.jobId as string;
    expect(await m.queue.onHlsReady({ type: "HLS_READY", jobId, blobUrl: "blob:https://example.com/x", filename: "a.ts", bytes: 1 }, 99)).toBe("rejected");
    expect(await m.queue.onHlsReady({ type: "HLS_READY", jobId, blobUrl: "https://evil.example.net/x.mp4", filename: "a.ts", bytes: 1 }, 7)).toBe("rejected");
    expect(env.calls.download).toHaveLength(0);
  });

  it("falls back to the page's own link click when the browser will not take the blob", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const jobId = env.calls.tabMessages[0]!.message.jobId as string;
    env.fake.downloads.download.mockRejectedValueOnce(new Error("Invalid URL"));
    expect(await m.queue.onHlsReady({ type: "HLS_READY", jobId, blobUrl: "blob:https://example.com/x", filename: "a.ts", bytes: 1 }, 7)).toBe("fallback");
    // That click makes a browser download, which is linked back to the job.
    await m.queue.onDownloadCreated({ id: 55, url: "blob:https://example.com/x" } as chrome.downloads.DownloadItem);
    const job = (await m.queue.listJobs())[0]!;
    expect(job.chromeDownloadId).toBe(55);
  });

  it("places a link-click download in the subfolder", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const jobId = env.calls.tabMessages[0]!.message.jobId as string;
    env.fake.downloads.download.mockRejectedValueOnce(new Error("Invalid URL"));
    await m.queue.onHlsReady({ type: "HLS_READY", jobId, blobUrl: "blob:https://example.com/x", filename: "a.ts", bytes: 1 }, 7);
    const suggest = vi.fn();
    expect(m.queue.onDeterminingFilename({ id: 1, url: "blob:https://example.com/x" } as chrome.downloads.DownloadItem, suggest)).toBe(true);
    await vi.waitFor(() => expect(suggest).toHaveBeenCalled());
    expect(suggest).toHaveBeenCalledWith(expect.objectContaining({ filename: "KUIVideoExtractor/a.ts" }));
    // Downloads that are not ours are never touched.
    expect(m.queue.onDeterminingFilename({ id: 2, url: "https://other.example.com/x.zip" } as chrome.downloads.DownloadItem, vi.fn())).toBe(false);
  });

  it("does not retry encrypted, live or oversized streams, but retries network trouble", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const jobId = env.calls.tabMessages[0]!.message.jobId as string;
    await m.queue.onHlsFailed({ type: "HLS_FAILED", jobId, code: "SERVER_BAD_CONTENT", message: "This is a live stream." }, 7);
    expect(env.calls.alarms).toHaveLength(0);
    let job = (await m.queue.listJobs())[0]!;
    expect(job).toMatchObject({ state: "interrupted", error: "This is a live stream." });
    expect((env.local.get(HISTORY_KEY) as HistoryItem[])[0]).toMatchObject({ ok: false });

    // A fresh job that fails on the network schedules a retry.
    env.local.delete(QUEUE_KEY);
    vi.resetModules();
    const n = await scanned([hls()]);
    await n.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const second = env.calls.tabMessages.at(-1)!.message.jobId as string;
    await n.queue.onHlsFailed({ type: "HLS_FAILED", jobId: second, code: "NETWORK_FAILED", message: "Network" }, 7);
    expect(env.calls.alarms).toHaveLength(1);
    job = (await n.queue.listJobs())[0]!;
    expect(job.error).toMatch(/Retrying/);

    // The alarm fires: the page is asked again.
    const before = env.calls.tabMessages.length;
    await n.queue.retryJob(job.id);
    expect(env.calls.tabMessages.length).toBe(before + 1);
  });

  it("fails the job when its page is closed", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    await m.queue.onTabClosed(7);
    const job = (await m.queue.listJobs())[0]!;
    expect(job).toMatchObject({ state: "interrupted", errorCode: "PAGE_CLOSED" });
    expect(env.calls.alarms).toHaveLength(0);
  });

  it("needs the page: refuses when the tab that found the stream is gone", async () => {
    const m = await scanned([hls()]);
    await m.tabs.forgetTab(7);
    // The stream is still known from history, but no tab lists it, so there is nothing to fetch it from.
    env.local.set(HISTORY_KEY, [{ id: "h", title: "t", filename: "f", url: "https://cdn.example.com/live/index.m3u8", quality: "q", at: 1, ok: true }]);
    const res = await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    expect(res).toMatchObject({ ok: false, code: "NO_PAGE" });
  });

  it("refuses DASH with a pointer to the command panel", async () => {
    const m = await scanned([dash()]);
    const res = await m.requests.handleStart(start("https://cdn.example.com/x.mpd"));
    expect(res).toMatchObject({ ok: false, code: "DASH_UNSUPPORTED" });
    expect(env.calls.download).toHaveLength(0);
  });
});

describe("service worker restart", () => {
  it("settles a download that finished while the worker was stopped", async () => {
    const m = await scanned([source()]);
    await m.requests.handleStart(start("https://cdn.example.com/a.mp4"));
    // Chrome stops the worker. The download finishes on its own.
    env.downloads[0]!.state = "complete";
    vi.resetModules();
    const again = await import("./queue");
    const jobs = await again.listJobs();
    expect(jobs[0]?.state).toBe("complete");
    expect((env.local.get(HISTORY_KEY) as HistoryItem[])[0]).toMatchObject({ ok: true });
  });

  it("still knows which tab to use for a stream after a restart", async () => {
    await scanned([hls()]);
    vi.resetModules();
    const m = await modules();
    expect(await m.tabs.findTabForUrl("https://cdn.example.com/live/index.m3u8")).toBe(7);
  });

  it("marks a page job whose page went silent as interrupted", async () => {
    const m = await scanned([hls()]);
    await m.requests.handleStart(start("https://cdn.example.com/live/index.m3u8"));
    const stored = env.local.get(QUEUE_KEY) as DownloadJob[];
    stored[0]!.lastAt = Date.now() - 10 * 60_000;
    env.local.set(QUEUE_KEY, stored);
    vi.resetModules();
    const again = await import("./queue");
    const jobs = await again.listJobs();
    expect(jobs[0]).toMatchObject({ state: "interrupted", errorCode: "STALLED" });
  });
});

describe("data retention", () => {
  it("drops history and log entries older than the window on wake, and keeps recent ones", async () => {
    const day = 86_400_000;
    const old = Date.now() - 40 * day;
    env.local.set(HISTORY_KEY, [
      { id: "old", title: "t", filename: "f", url: "https://x.example/a.mp4", quality: "q", at: old, ok: true },
      { id: "new", title: "t", filename: "f", url: "https://x.example/b.mp4", quality: "q", at: Date.now(), ok: true },
    ]);
    env.local.set("vpf_diagnostics", [
      { id: "1", at: old, severity: "warn", code: "X", message: "m" },
      { id: "2", at: Date.now(), severity: "warn", code: "Y", message: "m" },
    ]);
    const storage = await import("./storage");
    await storage.pruneExpired();
    expect((env.local.get(HISTORY_KEY) as HistoryItem[]).map((h) => h.id)).toEqual(["new"]);
    expect((env.local.get("vpf_diagnostics") as { id: string }[]).map((d) => d.id)).toEqual(["2"]);
  });

  it("erases everything, including the queue held in memory", async () => {
    const m = await scanned([source()]);
    await m.requests.handleStart(start("https://cdn.example.com/a.mp4"));
    expect((await m.queue.listJobs()).length).toBe(1);
    env.fake.storage.local.clear = async () => env.local.clear();
    (env.fake.storage.session as unknown as { clear: () => Promise<void> }).clear = async () => env.session.clear();
    (env.fake.alarms as unknown as { clearAll: () => Promise<boolean> }).clearAll = async () => true;
    const storage = await import("./storage");
    await storage.eraseEverything();
    m.tabs.forgetAllScans();
    await m.queue.forgetAllJobs();
    expect(env.local.size).toBe(0);
    expect(await m.queue.listJobs()).toEqual([]);
    // With the scan gone, the old address is no longer accepted.
    expect(await m.requests.handleStart(start("https://cdn.example.com/a.mp4"))).toMatchObject({ ok: false });
  });
});