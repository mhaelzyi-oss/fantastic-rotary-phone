import { addDiagnostic } from "../shared/diagnostics";
import { DIAG_KEY, HISTORY_KEY, LIBRARY_KEY, MAX_HISTORY, PREFS_KEY, QUEUE_KEY } from "../shared/keys";
import { mergePrefs } from "../shared/prefs";
import { pruneByAge } from "../shared/retention";
import type { Diagnostic, DownloadJob, HistoryItem, LibraryItem, UserPrefs } from "../shared/types";

export async function loadPrefs(): Promise<UserPrefs> {
  const data = await chrome.storage.local.get(PREFS_KEY);
  return mergePrefs(data[PREFS_KEY] as Partial<UserPrefs> | undefined);
}

export async function savePrefs(prefs: UserPrefs): Promise<void> {
  await chrome.storage.local.set({ [PREFS_KEY]: prefs });
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return (data[HISTORY_KEY] as HistoryItem[] | undefined) ?? [];
}

/** One entry per job: finishing a retried download replaces the earlier failure. */
export async function pushHistory(item: HistoryItem): Promise<void> {
  const list = [item, ...(await loadHistory()).filter((h) => h.id !== item.id)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: list });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function loadQueue(): Promise<DownloadJob[]> {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return (data[QUEUE_KEY] as DownloadJob[] | undefined) ?? [];
}

export async function saveQueue(jobs: DownloadJob[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: jobs });
}

export async function loadLibrary(): Promise<LibraryItem[]> {
  const data = await chrome.storage.local.get(LIBRARY_KEY);
  return (data[LIBRARY_KEY] as LibraryItem[] | undefined) ?? [];
}

/** Serialised so two quick changes cannot overwrite each other. */
let libraryLock: Promise<unknown> = Promise.resolve();
export function updateLibrary(change: (items: LibraryItem[]) => LibraryItem[]): Promise<LibraryItem[]> {
  const run = libraryLock.then(async () => {
    const next = change(await loadLibrary());
    await chrome.storage.local.set({ [LIBRARY_KEY]: next });
    return next;
  });
  libraryLock = run.catch(() => undefined);
  return run;
}

export async function loadDiagnostics(): Promise<Diagnostic[]> {
  const data = await chrome.storage.local.get(DIAG_KEY);
  return (data[DIAG_KEY] as Diagnostic[] | undefined) ?? [];
}

let diagLock: Promise<unknown> = Promise.resolve();
export function recordDiagnostic(entry: { severity?: Diagnostic["severity"]; code: string; message: string; host?: string }): Promise<void> {
  const run = diagLock.then(async () => {
    await chrome.storage.local.set({ [DIAG_KEY]: addDiagnostic(await loadDiagnostics(), entry) });
  });
  diagLock = run.catch(() => undefined);
  return run.catch(() => undefined);
}

export async function clearDiagnostics(): Promise<void> {
  await chrome.storage.local.set({ [DIAG_KEY]: [] });
}

/** Drop history and log entries past the retention window. Runs whenever the worker wakes. */
export async function pruneExpired(now: number = Date.now()): Promise<void> {
  const [history, diagnostics] = await Promise.all([loadHistory(), loadDiagnostics()]);
  const nextHistory = pruneByAge(history, (h) => h.at, now);
  const nextDiagnostics = pruneByAge(diagnostics, (d) => d.at, now);
  const patch: Record<string, unknown> = {};
  if (nextHistory.length !== history.length) patch[HISTORY_KEY] = nextHistory;
  if (nextDiagnostics.length !== diagnostics.length) patch[DIAG_KEY] = nextDiagnostics;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

/** Remove everything this extension has stored on the device: settings, queue, history, saved list, log. */
export async function eraseEverything(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session?.clear().catch(() => undefined);
}