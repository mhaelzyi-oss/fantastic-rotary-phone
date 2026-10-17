import { create } from "zustand";
import { resolveShell, toolsFor, type CliInput } from "../../shared/cli";
import { formatFilename } from "../../shared/filename";
import { searchLibrary } from "../../shared/library";
import type { RuntimeMessage, StartResult } from "../../shared/messages";
import { mergePrefs } from "../../shared/prefs";
import { pickDefaultVariant } from "../../shared/quality";
import {
  DEFAULT_PREFS,
  type DownloadJob,
  type DownloadProgress,
  type HistoryItem,
  type LibraryItem,
  type MediaItem,
  type ScanPayload,
  type UserPrefs,
  type Variant,
} from "../../shared/types";
import { sendMessage } from "../lib/messaging";
import { streamName } from "../lib/streamName";

export type FinderTab = "streams" | "saved" | "history" | "tools";
export type Authority = { basis: string; confirmed: boolean };

type FinderState = {
  prefs: UserPrefs;
  scan: ScanPayload;
  history: HistoryItem[];
  jobs: DownloadJob[];
  /** Keyed by job id, falling back to the browser download id. */
  progress: Record<string, DownloadProgress>;
  library: LibraryItem[];
  libraryQuery: string;
  /** Stream indexes waiting for the user to confirm their right to download. */
  authorityAsk: number[] | null;
  tab: FinderTab;
  selected: number[];
  openIndex: number | null;
  variantUrl: Record<number, string>;
  historyQuery: string;
  status: { text: string; error: boolean };
  hydrated: boolean;
  hydrate: () => Promise<void>;
  onMessage: (message: RuntimeMessage) => void;
  setTab: (tab: FinderTab) => void;
  setHistoryQuery: (q: string) => void;
  setPrompt: (prompt: string) => void;
  setSubs: (on: boolean) => void;
  applyChip: (id: string) => void;
  toggleSelected: (index: number) => void;
  toggleSelectAll: (on: boolean) => void;
  setOpenIndex: (index: number | null) => void;
  setVariantUrl: (index: number, url: string) => void;
  variantFor: (index: number) => Variant | undefined;
  filenameFor: (index: number) => string;
  cliInputFor: (index: number) => CliInput | undefined;
  setCli: (patch: Partial<Pick<UserPrefs, "cliTool" | "cliShell" | "cliReferer" | "cliUserAgent" | "cliYtdlpPage" | "cliAudioOnly">>) => void;
  queueDownload: (index: number) => Promise<void>;
  confirmAuthority: (basis: string) => Promise<void>;
  cancelAuthority: () => void;
  loadLibrary: () => Promise<void>;
  saveToLibrary: (index: number) => Promise<void>;
  updateLibraryItem: (id: string, patch: Partial<Pick<LibraryItem, "title" | "tags" | "note">>) => Promise<void>;
  removeLibraryItem: (id: string) => Promise<void>;
  setLibraryQuery: (q: string) => void;
  downloadLibraryItem: (item: LibraryItem) => Promise<void>;
  queueSelected: () => Promise<void>;
  rescan: () => void;
  openOptions: () => void;
  openSidePanel: () => void;
  clearHistory: () => Promise<void>;
  retryHistory: (item: HistoryItem) => void;
  applyScan: (payload: ScanPayload) => void;
};

function scanStatus(payload: ScanPayload): { text: string; error: boolean } {
  const usable = payload.sources.filter((s) => !s.encrypted);
  if (payload.error && !usable.length) return { text: payload.error, error: true };
  if (!payload.sources.length) {
    return { text: "No streams on this page. Play the media, then rescan.", error: false };
  }
  return {
    text: `${payload.sources.length} stream${payload.sources.length === 1 ? "" : "s"}`,
    error: false,
  };
}

export function progressKey(p: DownloadProgress): string {
  return p.jobId ?? String(p.downloadId);
}

export function visibleLibrary(items: LibraryItem[], query: string): LibraryItem[] {
  return searchLibrary(items, query);
}

function persistPrefs(prefs: UserPrefs): void {
  void sendMessage({ type: "SET_PREFS", prefs });
}

/** Ask the background to download one stream. The background re-checks everything; this only reports the answer. */
async function sendDownload(index: number, authority?: Authority): Promise<void> {
  const { scan, prefs } = useFinderStore.getState();
  const source = scan.sources[index];
  const variant = useFinderStore.getState().variantFor(index);
  if (!source || !variant || variant.encrypted) return;
  const subs = prefs.includeSubtitles ? source.subtitles.map((s) => s.url) : undefined;
  const res = await sendMessage<StartResult>({
    type: "START_DOWNLOAD",
    url: variant.url,
    filename: useFinderStore.getState().filenameFor(index),
    title: source.title || "video",
    quality: variant.label,
    subtitleUrls: subs,
    authority,
  });
  if (res && !res.ok) useFinderStore.setState({ status: { text: res.error, error: true } });
}

export const useFinderStore = create<FinderState>((set, get) => ({
  prefs: { ...DEFAULT_PREFS },
  scan: { pageUrl: "", pageTitle: "", sources: [] },
  history: [],
  jobs: [],
  progress: {},
  library: [],
  libraryQuery: "",
  authorityAsk: null,
  tab: "streams",
  selected: [],
  openIndex: null,
  variantUrl: {},
  historyQuery: "",
  status: { text: "", error: false },
  hydrated: false,

  hydrate: async () => {
    try {
      const prefs = mergePrefs(await sendMessage<UserPrefs>({ type: "GET_PREFS" }));
      set({ prefs });
      document.documentElement.dataset.theme = prefs.theme;
    } catch {
      set({ prefs: mergePrefs() });
    }
    try {
      const payload = (await sendMessage<ScanPayload>({ type: "GET_SCAN" })) ?? {
        pageUrl: "",
        pageTitle: "",
        sources: [],
      };
      get().applyScan(payload);
    } catch {
      set({ status: { text: "Could not scan this tab. Try a normal http(s) page.", error: true } });
    }
    try {
      const history = (await sendMessage<HistoryItem[]>({ type: "GET_HISTORY" })) ?? [];
      const jobs = (await sendMessage<DownloadJob[]>({ type: "GET_QUEUE" })) ?? [];
      set({ history, jobs });
    } catch {
      /* worker unavailable */
    }
    set({ hydrated: true });
  },

  onMessage: (message) => {
    if (message.type === "SCAN_RESULT") get().applyScan(message.payload);
    if (message.type === "DOWNLOAD_PROGRESS") {
      set((s) => ({ progress: { ...s.progress, [progressKey(message.progress)]: message.progress } }));
      if (message.progress.state !== "in_progress") {
        void sendMessage<HistoryItem[]>({ type: "GET_HISTORY" }).then((history) => {
          if (history) set({ history });
        });
      }
    }
    if (message.type === "QUEUE_UPDATED") set({ jobs: message.jobs });
    if (message.type === "DOWNLOAD_ERROR") set({ status: { text: message.message, error: true } });
  },

  applyScan: (payload) => {
    set({ scan: payload, status: scanStatus(payload), variantUrl: {}, selected: [], openIndex: null });
  },

  setTab: (tab) => {
    set({ tab });
    if (tab === "saved") void get().loadLibrary();
    if (tab === "history") {
      void sendMessage<HistoryItem[]>({ type: "GET_HISTORY" }).then((history) => {
        if (history) set({ history });
      });
    }
  },
  setHistoryQuery: (historyQuery) => set({ historyQuery }),
  setPrompt: (prompt) => {
    const prefs = mergePrefs({ ...get().prefs, prompt });
    set({ prefs });
    persistPrefs(prefs);
  },
  setSubs: (on) => {
    const prefs = mergePrefs({ ...get().prefs, includeSubtitles: on });
    set({ prefs });
    persistPrefs(prefs);
  },
  applyChip: (id) => {
    const prev = get().prefs;
    let prefs = { ...prev };
    if (id === "subs") prefs.includeSubtitles = !prefs.includeSubtitles;
    else if (id === "short") {
      const on = !prefs.activeBubbles.includes("short");
      prefs.activeBubbles = on
        ? [...prefs.activeBubbles.filter((b) => b !== "short"), "short"]
        : prefs.activeBubbles.filter((b) => b !== "short");
      if (on && !/\bshort\b/i.test(prefs.prompt)) prefs.prompt = `${prefs.prompt} short`.trim();
      if (!on) prefs.prompt = prefs.prompt.replace(/\bshort\b/gi, "").replace(/\s+/g, " ").trim();
    } else if (id === "auto" || id === "1080" || id === "720" || id === "480") {
      prefs.preferredQuality = id;
    }
    prefs = mergePrefs(prefs);
    set({ prefs });
    persistPrefs(prefs);
  },
  toggleSelected: (index) => {
    set((s) => ({
      selected: s.selected.includes(index) ? s.selected.filter((i) => i !== index) : [...s.selected, index],
    }));
  },
  toggleSelectAll: (on) => {
    const sources = get().scan.sources;
    set({ selected: on ? sources.map((_, i) => i).filter((i) => !sources[i]?.encrypted) : [] });
  },
  setOpenIndex: (openIndex) => set({ openIndex }),
  setVariantUrl: (index, url) => set((s) => ({ variantUrl: { ...s.variantUrl, [index]: url } })),
  variantFor: (index) => {
    const source = get().scan.sources[index];
    const prefs = get().prefs;
    if (!source) return undefined;
    const chosen = get().variantUrl[index];
    return (
      source.variants.find((v) => v.url === chosen) ??
      pickDefaultVariant(source.variants, prefs.preferredQuality, prefs.maxHeight)
    );
  },
  filenameFor: (index) => {
    const source = get().scan.sources[index];
    const variant = get().variantFor(index);
    return formatFilename({
      title: `${source?.title || "video"}_${index + 1}`,
      quality: (variant?.label ?? "source").replace(/\s+/g, ""),
      prompt: get().prefs.prompt,
      host: source?.originHost,
      index: index + 1,
    });
  },
  cliInputFor: (index) => {
    const source = get().scan.sources[index];
    if (!source) return undefined;
    const prefs = get().prefs;
    const variant = get().variantFor(index);
    const kind = variant?.kind ?? source.kind;
    const offered = toolsFor(kind);
    const tool = offered.includes(prefs.cliTool) ? prefs.cliTool : (offered[0] ?? "yt-dlp");
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return {
      tool,
      shell: resolveShell(prefs.cliShell, platform),
      url: variant?.url ?? source.url,
      kind,
      filename: get().filenameFor(index),
      referer: prefs.cliReferer ? source.pageUrl : undefined,
      userAgent: prefs.cliUserAgent && typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      encrypted: source.encrypted || Boolean(variant?.encrypted),
      ytdlpPage: prefs.cliYtdlpPage,
      pageUrl: source.pageUrl,
      maxHeight: prefs.maxHeight === "auto" ? undefined : Number(prefs.maxHeight),
      subtitles: prefs.includeSubtitles,
      audioOnly: prefs.cliAudioOnly,
    };
  },
  setCli: (patch) => {
    const prefs = mergePrefs({ ...get().prefs, ...patch });
    set({ prefs });
    persistPrefs(prefs);
  },
  queueDownload: async (index) => {
    const source = get().scan.sources[index];
    const variant = get().variantFor(index);
    if (!source || !variant || variant.encrypted) return;
    if (get().prefs.requireAuthority) {
      set({ authorityAsk: [index] });
      return;
    }
    await sendDownload(index);
  },
  queueSelected: async () => {
    const { selected, scan } = get();
    const indexes = selected.filter((i) => scan.sources[i] && !scan.sources[i]?.encrypted);
    if (!indexes.length) {
      set({ status: { text: "Select one or more files, then download.", error: true } });
      return;
    }
    if (get().prefs.requireAuthority) {
      set({ authorityAsk: indexes });
      return;
    }
    for (const index of indexes) await sendDownload(index);
  },
  confirmAuthority: async (basis) => {
    const indexes = get().authorityAsk ?? [];
    set({ authorityAsk: null });
    for (const index of indexes) await sendDownload(index, { basis, confirmed: true });
  },
  cancelAuthority: () => set({ authorityAsk: null }),
  loadLibrary: async () => {
    const items = (await sendMessage<LibraryItem[]>({ type: "GET_LIBRARY" })) ?? [];
    set({ library: items });
  },
  saveToLibrary: async (index) => {
    const source = get().scan.sources[index];
    if (!source || source.encrypted) return;
    const res = await sendMessage<{ ok: boolean; error?: string; items?: LibraryItem[] }>({ type: "ADD_LIBRARY", url: source.url });
    if (res?.ok) set({ library: res.items ?? get().library, status: { text: "Saved to the library.", error: false } });
    else set({ status: { text: res?.error ?? "Could not save to the library.", error: true } });
  },
  updateLibraryItem: async (id, patch) => {
    const res = await sendMessage<{ ok: boolean; items?: LibraryItem[] }>({ type: "UPDATE_LIBRARY", id, patch });
    if (res?.items) set({ library: res.items });
  },
  removeLibraryItem: async (id) => {
    const res = await sendMessage<{ ok: boolean; items?: LibraryItem[] }>({ type: "REMOVE_LIBRARY", id });
    if (res?.items) set({ library: res.items });
  },
  setLibraryQuery: (libraryQuery) => set({ libraryQuery }),
  downloadLibraryItem: async (item) => {
    const prefs = get().prefs;
    const filename = formatFilename({ title: item.title, quality: "source", prompt: prefs.prompt, host: item.originHost });
    const res = await sendMessage<StartResult>({ type: "START_DOWNLOAD", url: item.url, filename, title: item.title, quality: "source" });
    if (res && !res.ok) set({ status: { text: res.error, error: true } });
  },
  rescan: () => {
    set({ openIndex: null, selected: [], variantUrl: {} });
    void sendMessage({ type: "RESAN" });
  },
  openOptions: () => {
    void sendMessage({ type: "OPEN_OPTIONS" });
  },
  openSidePanel: () => {
    void sendMessage({ type: "OPEN_SIDEPANEL" });
  },
  clearHistory: async () => {
    await sendMessage({ type: "CLEAR_HISTORY" });
    set({ history: [] });
  },
  retryHistory: (item) => {
    void sendMessage({
      type: "START_DOWNLOAD",
      url: item.url,
      filename: item.filename.split("/").pop() ?? item.filename,
      title: item.title,
      quality: item.quality,
    });
  },
}));

export function sourceLabel(source: MediaItem, index: number): string {
  return streamName(source, index);
}

export function kindPill(kind: MediaItem["kind"], medium?: MediaItem["medium"]): string {
  if (medium === "audio") return "AUDIO";
  if (kind === "hls") return "HLS";
  if (kind === "dash") return "DASH";
  return "MP4";
}
