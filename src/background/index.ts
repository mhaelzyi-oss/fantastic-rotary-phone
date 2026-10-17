import contentPath from "../content/index.ts?script";
import { exportDiagnostics } from "../shared/diagnostics";
import { HISTORY_KEY, LIBRARY_KEY, PREFS_KEY, QUEUE_KEY, SCHEMA_KEY } from "../shared/keys";
import { updateLibraryItem, removeFromLibrary } from "../shared/library";
import { isMessage } from "../shared/messages";
import type { RuntimeMessage } from "../shared/messages";
import { mergePrefs } from "../shared/prefs";
import { migrateStore } from "../shared/schema";
import type { ScanPayload } from "../shared/types";
import { setLogoState } from "./logo";
import { createMenus, onMenuClick } from "./menus";
import {
  listJobs,
  forgetAllJobs,
  onChromeDownloadChanged,
  onDeterminingFilename,
  onDownloadCreated,
  onHlsFailed,
  onHlsProgress,
  onHlsReady,
  onTabClosed,
  RETRY_PREFIX,
  retryJob,
} from "./queue";
import { fromExtensionPage, handleAddLibrary, handleStart } from "./requests";
import {
  clearDiagnostics,
  clearHistory,
  eraseEverything,
  loadDiagnostics,
  loadHistory,
  loadLibrary,
  loadPrefs,
  pruneExpired,
  savePrefs,
  updateLibrary,
} from "./storage";
import { activePageTab, cachedScan, forgetAllScans, forgetTab, rememberScan, requestScan } from "./tabs";

async function migrate(): Promise<void> {
  const keys = { prefs: PREFS_KEY, history: HISTORY_KEY, queue: QUEUE_KEY, library: LIBRARY_KEY, schema: SCHEMA_KEY };
  const store = await chrome.storage.local.get(Object.values(keys));
  const patch = migrateStore(store, keys);
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

chrome.runtime.onInstalled.addListener(() => {
  void migrate();
  void setLogoState(0);
  // The side panel exists in Chromium browsers only. Firefox has no such API.
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false });
  createMenus();
});

// Waking up: settle downloads that finished or failed while this worker was stopped.
void listJobs();
void pruneExpired();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void onMenuClick(info, tab);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(RETRY_PREFIX)) void retryJob(alarm.name.slice(RETRY_PREFIX.length));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetTab(tabId);
  void onTabClosed(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" && info.url) {
    void forgetTab(tabId);
    void onTabClosed(tabId);
    void setLogoState(0);
  }
});

chrome.downloads.onCreated.addListener((item) => {
  void onDownloadCreated(item);
});

// Not available in Firefox: there, a link-click download simply keeps the name the page gave it.
chrome.downloads.onDeterminingFilename?.addListener(onDeterminingFilename);

chrome.downloads.onChanged.addListener((delta) => {
  void onChromeDownloadChanged(delta);
});

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (!isMessage(raw)) return false;

  if (raw.type === "SCAN_RESULT") {
    const tabId = sender.tab?.id;
    if (tabId != null) void rememberScan(tabId, raw.payload);
    void setLogoState(raw.payload.sources.length);
    return false;
  }

  // The page engine reports from the content script. The job must belong to that same tab.
  if (raw.type === "HLS_PROGRESS" || raw.type === "HLS_READY" || raw.type === "HLS_FAILED") {
    if (sender.id !== chrome.runtime.id || sender.tab?.id == null) return false;
    const tabId = sender.tab.id;
    if (raw.type === "HLS_PROGRESS") void onHlsProgress(raw, tabId);
    else if (raw.type === "HLS_FAILED") void onHlsFailed(raw, tabId);
    else {
      void onHlsReady(raw, tabId).then((result) => sendResponse({ result }));
      return true;
    }
    return false;
  }

  if (raw.type === "GET_SCAN") {
    void activePageTab().then(async (tab) => {
      if (!tab?.id) {
        sendResponse({ pageUrl: "", pageTitle: "", sources: [] } satisfies ScanPayload);
        return;
      }
      const prefs = await loadPrefs();
      const cached = await cachedScan(tab.id);
      if (cached) {
        sendResponse(cached);
        chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE", prefs } satisfies RuntimeMessage).catch(() => undefined);
        return;
      }
      sendResponse(await requestScan(tab.id, prefs, contentPath));
    });
    return true;
  }

  if (raw.type === "RESAN") {
    void activePageTab().then(async (tab) => {
      if (!tab?.id) return;
      const prefs = await loadPrefs();
      await requestScan(tab.id, prefs, contentPath);
    });
    return false;
  }

  if (raw.type === "GET_PREFS") {
    void loadPrefs().then(sendResponse);
    return true;
  }

  // Everything below changes or reveals user data: extension pages only.
  if (!fromExtensionPage(sender)) {
    sendResponse({ ok: false, error: "Not allowed." });
    return false;
  }

  if (raw.type === "SET_PREFS") {
    void savePrefs(mergePrefs(raw.prefs)).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (raw.type === "GET_HISTORY") {
    void loadHistory().then(sendResponse);
    return true;
  }

  if (raw.type === "CLEAR_HISTORY") {
    void clearHistory().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (raw.type === "GET_QUEUE") {
    void listJobs().then(sendResponse);
    return true;
  }

  if (raw.type === "OPEN_OPTIONS") {
    void chrome.runtime.openOptionsPage();
    return false;
  }

  if (raw.type === "OPEN_SIDEPANEL") {
    void activePageTab().then((tab) => {
      if (tab?.windowId != null) void chrome.sidePanel?.open({ windowId: tab.windowId });
    });
    return false;
  }

  if (raw.type === "START_DOWNLOAD") {
    void handleStart(raw).then(sendResponse);
    return true;
  }

  if (raw.type === "GET_LIBRARY") {
    void loadLibrary().then(sendResponse);
    return true;
  }

  if (raw.type === "ADD_LIBRARY") {
    void handleAddLibrary(raw.url).then(sendResponse);
    return true;
  }

  if (raw.type === "UPDATE_LIBRARY") {
    void updateLibrary((list) => updateLibraryItem(list, raw.id, raw.patch)).then((items) => sendResponse({ ok: true, items }));
    return true;
  }

  if (raw.type === "REMOVE_LIBRARY") {
    void updateLibrary((list) => removeFromLibrary(list, raw.id)).then((items) => sendResponse({ ok: true, items }));
    return true;
  }

  if (raw.type === "GET_DIAGNOSTICS") {
    void loadDiagnostics().then((list) => sendResponse({ text: exportDiagnostics(list), count: list.length }));
    return true;
  }

  if (raw.type === "ERASE_ALL_DATA") {
    void (async () => {
      await eraseEverything();
      forgetAllScans();
      await forgetAllJobs();
      void setLogoState(0);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (raw.type === "CLEAR_DIAGNOSTICS") {
    void clearDiagnostics().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
