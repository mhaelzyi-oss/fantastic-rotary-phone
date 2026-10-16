import { mergePrefs } from "./prefs";
import type { DownloadJob, HistoryItem } from "./types";
import { MAX_HISTORY } from "./keys";

export const SCHEMA_VERSION = 2;

type Store = Record<string, unknown>;

/**
 * Work out what to write back so older installs match the current shape. Returns only the keys that
 * need to change. Safe to run on every start: a current store yields an empty patch.
 */
export function migrateStore(store: Store, keys: { prefs: string; history: string; queue: string; library: string; schema: string }): Store {
  const patch: Store = {};
  const version = typeof store[keys.schema] === "number" ? (store[keys.schema] as number) : 1;

  const prefs = store[keys.prefs];
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    const merged = mergePrefs(prefs as Record<string, unknown>);
    if (JSON.stringify(merged) !== JSON.stringify(prefs)) patch[keys.prefs] = merged;
  }

  const history = store[keys.history];
  if (history !== undefined && !Array.isArray(history)) patch[keys.history] = [];
  else if (Array.isArray(history)) {
    const clean = (history as HistoryItem[]).filter((h) => h && typeof h.url === "string").slice(0, MAX_HISTORY);
    if (clean.length !== history.length) patch[keys.history] = clean;
  }

  const queue = store[keys.queue];
  if (queue !== undefined && !Array.isArray(queue)) patch[keys.queue] = [];
  else if (Array.isArray(queue)) {
    const clean = (queue as DownloadJob[]).filter((j) => j && typeof j.id === "string" && typeof j.url === "string");
    if (clean.length !== queue.length) patch[keys.queue] = clean;
  }

  if (!Array.isArray(store[keys.library])) patch[keys.library] = [];

  if (version !== SCHEMA_VERSION) patch[keys.schema] = SCHEMA_VERSION;
  return patch;
}
