import { getState, getValue, setValue, updateState } from './utils/storage.js';
import { evaluateEligibility } from './utils/sourceEligibility.js';
import { startDirectDownload } from './utils/downloadManager.js';
import { recordDiagnostic } from './utils/diagnostics.js';
import { findTrustedSource, mergeSourceAnalysis } from './utils/sourceSecurity.js';
import { updateDownloadProgress } from './utils/bandwidthEstimator.js';
import { isRetryable } from './utils/retry.js';
import { normalizeSource } from './utils/sourceNormalizer.js';
import { rehydrateAndReconcile } from './utils/serviceWorkerManager.js';
import { createAttestation } from './utils/authorization.js';
import { validateSettingsUpdate } from './utils/settingsValidation.js';
import { recordCompletedDownload } from './utils/downloadHistory.js';
import { createTrustedSubtitleSource } from './utils/subtitleSource.js';
import { getToolbarDetectionState, isScannablePage } from './utils/detectionState.js';

const SOURCES_KEY = 'tabSources';
const menus = [
  ['scan-page', 'Scan page for media', 'page'],
  ['analyze-link', 'Analyze media link', 'link'],
  ['prepare-download', 'Prepare media link for download', 'link'],
  ['inspect-link', 'Inspect media link', 'link'],
  ['save-link', 'Save media link to library', 'link'],
  ['copy-link', 'Copy media URL', 'link'],
];

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});
chrome.runtime.onStartup.addListener(() => {
  void initialize();
});
chrome.downloads.onChanged.addListener((delta) => {
  void onDownloadChanged(delta);
});
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  void chrome.tabs.create({
    url: `${chrome.runtime.getURL('dashboard.html')}?tabId=${tab.id}`,
    windowId: tab.windowId,
    active: true,
  });
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url)
    void clearTabSources(tabId).catch(() => {});
  if (changeInfo.status === 'complete' && isScannablePage(tab?.url))
    void autoScanIfGranted(tabId).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabSources(tabId).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'offscreen') return false;
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch(async (error) => {
      await updateState((state) =>
        recordDiagnostic(state, {
          category: message?.type?.includes('DOWNLOAD')
            ? 'download'
            : message?.type?.includes('ANALYZE')
              ? 'manifest'
              : 'queue',
          severity: 'warning',
          code: `MESSAGE_${String(message?.type || 'UNKNOWN')
            .replace(/[^A-Z0-9]+/gi, '_')
            .toUpperCase()}_FAILED`,
          title: 'Action could not be completed',
          userMessage: error.message || 'The requested action failed.',
          technicalDetail: error.stack || String(error),
        }),
      ).catch(() => {});
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenu(info, tab);
});
void initialize();

async function initialize() {
  try {
    await getState();
    await chrome.contextMenus.removeAll();
    for (const [id, title, contexts] of menus)
      chrome.contextMenus.create({ id, title, contexts: [contexts] });
    const downloads = await chrome.downloads.search({});
    await updateState((state) => {
      return rehydrateAndReconcile(state, downloads);
    });
    await chrome.action.setIcon({
      path: { 16: 'icons/icon-default-16.png', 32: 'icons/icon-default-32.png' },
    });
  } catch (error) {
    await updateState((state) =>
      recordDiagnostic(state, {
        category: 'service_worker',
        severity: 'warning',
        code: 'INITIALIZATION_RECOVERY',
        title: 'Extension state recovered',
        userMessage: 'Some background state was rebuilt.',
        technicalDetail: error.message,
      }),
    );
  }
}

async function handleMessage(message, sender) {
  if (message?.type === 'SOURCES_FOUND') {
    const tabId = sender.tab?.id;
    if (tabId == null) return { ok: false };
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.url !== message.pageUrl) return { ok: false, error: 'Stale page scan.' };
    const saved = await getValue(SOURCES_KEY, {});
    saved[tabId] = {
      sources: message.sources.map((source) => ({
        ...source,
        eligibility: evaluateEligibility(source),
      })),
      pageTitle: message.pageTitle,
      pageUrl: message.pageUrl,
      scannedAt: Date.now(),
    };
    await setValue(SOURCES_KEY, saved);
    await updateTabAction(tabId, saved[tabId].sources);
    return { ok: true, count: saved[tabId].sources.length };
  }
  if (message?.type === 'GET_TAB_SOURCES') {
    const saved = await getValue(SOURCES_KEY, {});
    const tab = await chrome.tabs.get(message.tabId).catch(() => null);
    const page = saved[message.tabId];
    if (!tab || !page || tab.url !== page.pageUrl)
      return { ok: true, sources: [], pageTitle: '', pageUrl: tab?.url || '', scannedAt: null };
    return {
      ok: true,
      ...page,
    };
  }
  if (message?.type === 'SCAN_TAB') {
    const tab = await chrome.tabs.get(message.tabId);
    if (!isScannablePage(tab.url))
      return { ok: false, error: 'This page does not allow extension scanning.' };
    await scanTab(message.tabId);
    return { ok: true };
  }
  if (message?.type === 'AUTO_SCAN_ACTIVE_TAB') {
    const tab = Number.isInteger(message.tabId)
      ? await chrome.tabs.get(message.tabId).catch(() => null)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab?.id || !isScannablePage(tab.url))
      throw new Error('The active tab does not allow extension scanning.');
    if (!(await hasHostAccessForUrl(tab.url)))
      throw new Error(
        'Grant all-site access or permission for this site before automatic scanning.',
      );
    await scanTab(tab.id);
    return { ok: true };
  }
  if (message?.type === 'START_DOWNLOAD') {
    const trusted = await getTrustedPageSource(message.tabId, message.source);
    const eligibility = evaluateEligibility(trusted);
    if (!eligibility.canDownloadDirectly)
      throw new Error(eligibility.blockReason || 'Source is blocked.');
    const result = await startDirectDownload({ ...trusted, eligibility }, message.authorization);
    return { ok: true, ...result };
  }
  if (message?.type === 'START_SUBTITLE_DOWNLOAD') {
    const parent = await getTrustedPageSource(message.tabId, message.parentSource);
    const source = createTrustedSubtitleSource(parent, message.subtitleUrl);
    const result = await startDirectDownload(source, message.authorization);
    return { ok: true, ...result };
  }
  if (message?.type === 'RETRY_DOWNLOAD') {
    const state = await getState();
    const previous = state.queue.find((job) => job.id === message.jobId);
    if (
      !previous ||
      previous.status !== 'failed' ||
      !isRetryable(previous.error?.code, previous.error?.retryable)
    )
      throw new Error('This failure is not safe to retry.');
    if (previous.retry.attempts >= previous.retry.maxAttempts)
      throw new Error('The retry limit has been reached.');
    const trusted = await getTrustedPageSource(message.tabId, previous.source);
    const eligibility = evaluateEligibility(trusted);
    if (!eligibility.canDownloadDirectly)
      throw new Error(eligibility.blockReason || 'This source is no longer eligible.');
    createAttestation(message.authorization, { ...trusted, eligibility });
    await updateState((next) => {
      const job = next.queue.find((item) => item.id === message.jobId);
      job.retry.attempts += 1;
      job.retry.lastFailureAt = Date.now();
      return next;
    });
    const result = await startDirectDownload({ ...trusted, eligibility }, message.authorization);
    await updateState((next) => {
      const retryJob = next.queue.find((item) => item.id === result.jobId);
      if (retryJob) {
        retryJob.retry.attempts = previous.retry.attempts + 1;
        retryJob.retry.maxAttempts = previous.retry.maxAttempts;
        retryJob.retryOf = previous.id;
      }
      return next;
    });
    return { ok: true, ...result };
  }
  if (message?.type === 'ANALYZE_SOURCE') {
    const trusted = await getTrustedPageSource(message.tabId, message.source);
    if (!['hls', 'dash'].includes(trusted.streamType) || trusted.protection?.isProtected) {
      throw new Error('Only an unblocked HLS or DASH manifest can be analyzed.');
    }
    const tab = await chrome.tabs.get(message.tabId);
    if (tab.url !== trusted.pageUrl || !/^https?:/.test(tab.url || '')) {
      throw new Error('Only HTTP(S) manifests on a normal webpage can be analyzed.');
    }
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      args: [trusted.src],
      func: async (manifestUrl) => {
        try {
          const response = await fetch(manifestUrl, { credentials: 'omit', cache: 'no-store' });
          if (!response.ok) return { error: `Manifest request returned HTTP ${response.status}.` };
          const reader = response.body?.getReader();
          if (!reader) return { error: 'The browser could not read this manifest response.' };
          const chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > 1024 * 1024) {
              await reader.cancel();
              return { error: 'Manifest exceeds the 1 MiB analysis limit.' };
            }
            chunks.push(value);
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return { text: new TextDecoder().decode(bytes) };
        } catch {
          return {
            error: 'The browser could not access this manifest under the page origin’s CORS rules.',
          };
        }
      },
    });
    if (execution?.result?.error) throw new Error(execution.result.error);
    if (!execution?.result?.text) throw new Error('The manifest was empty or unreadable.');
    return { ok: true, text: execution.result.text };
  }
  if (message?.type === 'STORE_SOURCE_ANALYSIS') {
    const saved = await getValue(SOURCES_KEY, {});
    const page = saved[message.tabId];
    const tab = await chrome.tabs.get(message.tabId).catch(() => null);
    if (!page || !tab || tab.url !== page.pageUrl)
      throw new Error('The page changed; rescan before saving manifest analysis.');
    const source = findTrustedSource(page, message.source);
    if (!source) throw new Error('The source is no longer in this page scan.');
    const index = page.sources.indexOf(source);
    page.sources[index] = mergeSourceAnalysis(source, message.analysis);
    page.sources[index].eligibility = evaluateEligibility(page.sources[index]);
    await setValue(SOURCES_KEY, saved);
    return { ok: true, source: page.sources[index] };
  }
  if (message?.type === 'CANCEL_JOB') {
    const state = await getState();
    const job = state.queue.find((item) => item.id === message.jobId);
    if (!job || !['queued', 'downloading'].includes(job.status))
      throw new Error('This job cannot be canceled.');
    if (job.downloadId != null) await chrome.downloads.cancel(job.downloadId);
    await updateState((next) => {
      const current = next.queue.find((item) => item.id === message.jobId);
      if (current && ['queued', 'downloading'].includes(current.status)) {
        current.status = 'canceled';
        current.updatedAt = Date.now();
      }
      return next;
    });
    return { ok: true };
  }
  if (message?.type === 'SHOW_DOWNLOAD') {
    const state = await getState();
    const job = state.queue.find((item) => item.id === message.jobId);
    if (!job || job.status !== 'completed' || job.downloadId == null)
      throw new Error('The completed browser download is unavailable.');
    await chrome.downloads.show(job.downloadId);
    return { ok: true };
  }
  if (message?.type === 'UPDATE_HOST_PREFERENCE') {
    if (
      !/^[a-z0-9.-]+(?::\d+)?$/i.test(message.host || '') ||
      typeof message.variantKey !== 'string' ||
      !message.variantKey ||
      message.variantKey.length > 500
    )
      throw new Error('Invalid host quality preference.');
    await updateState((state) => {
      state.hostPreferences[message.host] = {
        variantKey: message.variantKey,
        updatedAt: Date.now(),
      };
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'RESET_HOST_PREFERENCE' || message?.type === 'CLEAR_HOST_PREFERENCES') {
    await updateState((state) => {
      if (message.type === 'CLEAR_HOST_PREFERENCES') state.hostPreferences = {};
      else delete state.hostPreferences[message.host];
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'SAVE_PRESETS') {
    if (!Array.isArray(message.presets) || message.presets.length > 30)
      throw new Error('Preset list is invalid or exceeds 30 items.');
    const presets = message.presets.map((preset) => {
      if (
        !preset?.id ||
        !preset?.name ||
        typeof preset.prompt !== 'string' ||
        typeof preset.filenameTemplate !== 'string'
      )
        throw new Error('Every preset needs a name, prompt, and filename template.');
      return {
        id: String(preset.id).slice(0, 80),
        name: String(preset.name).slice(0, 60),
        prompt: preset.prompt.slice(0, 2000),
        filenameTemplate: preset.filenameTemplate.slice(0, 220),
        createdAt: Number(preset.createdAt) || Date.now(),
      };
    });
    await updateState((state) => {
      state.presets = presets;
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'CLEAR_DIAGNOSTICS') {
    await updateState((state) => {
      state.diagnostics = [];
      state.errorSnapshots = [];
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'REMEMBER_AUTHORITY_BASIS') {
    const allowed = [
      'owner',
      'permission',
      'official_download',
      'public_domain',
      'compatible_license',
      'organizational_authority',
    ];
    if (!allowed.includes(message.basis)) throw new Error('Invalid authority basis.');
    await updateState((state) => {
      if (state.settings.rememberAuthorityBasis) state.settings.lastAuthorityBasis = message.basis;
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'GET_STATE') return { ok: true, state: await getState() };
  if (message?.type === 'SAVE_LIBRARY') {
    await updateState((state) => {
      if (!state.library.some((item) => item.sourceUrl === message.source.src))
        state.library.unshift({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: message.source.label,
          pageUrl: message.source.pageUrl,
          sourceUrl: message.source.src,
          originHost: message.source.originHost,
          thumbnail: message.source.thumbnail,
          streamType: message.source.streamType,
          quality: message.source.resolution,
          tags: [],
          collectionIds: [],
          notes: '',
          lastOpenedAt: null,
          previewProgressSeconds: null,
          durationSeconds: message.source.durationSeconds,
          protectionStatus: message.source.protection?.category || 'none',
          eligibilityStatus: message.source.eligibility?.blockCode || 'NONE',
        });
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'UPDATE_LIBRARY_ITEM') {
    const patch = {};
    if (Array.isArray(message.patch?.tags))
      patch.tags = message.patch.tags
        .filter((tag) => typeof tag === 'string')
        .slice(0, 50)
        .map((tag) => tag.slice(0, 60));
    if (typeof message.patch?.notes === 'string') patch.notes = message.patch.notes.slice(0, 1000);
    if (Number.isFinite(message.patch?.lastOpenedAt))
      patch.lastOpenedAt = message.patch.lastOpenedAt;
    await updateState((state) => {
      const item = state.library.find((entry) => entry.id === message.itemId);
      if (item) Object.assign(item, patch, { updatedAt: Date.now() });
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'REMOVE_LIBRARY_ITEMS') {
    if (!Array.isArray(message.itemIds) || message.itemIds.length > 500)
      throw new Error('Invalid library selection.');
    const ids = new Set(message.itemIds.filter((id) => typeof id === 'string'));
    await updateState((state) => {
      state.library = state.library.filter((item) => !ids.has(item.id));
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'UPDATE_SETTINGS') {
    const settingsUpdate = validateSettingsUpdate(message.settings);
    await updateState((state) => {
      state.settings = { ...state.settings, ...settingsUpdate, lastUpdatedAt: Date.now() };
      return state;
    });
    return { ok: true };
  }
  if (message?.type === 'CLEAR_AUTHORITY_HISTORY') {
    await updateState((state) => {
      state.history = state.history.map((record) => ({ ...record, authorizationBasis: null }));
      return state;
    });
    return { ok: true };
  }
  return { ok: false, error: 'Unknown message.' };
}

async function getTrustedPageSource(tabId, requestedSource) {
  if (!Number.isInteger(tabId)) throw new Error('This action needs a valid active tab.');
  const tab = await chrome.tabs.get(tabId);
  const pages = await getValue(SOURCES_KEY, {});
  const page = pages[tabId];
  if (!page || tab.url !== page.pageUrl)
    throw new Error('Rescan the current page before using this source.');
  const source = findTrustedSource(page, requestedSource);
  if (!source) throw new Error('This source is not part of the current page scan.');
  return source;
}

async function updateTabAction(tabId, sources) {
  const state = getToolbarDetectionState(sources);
  await chrome.action.setIcon({
    tabId,
    path: {
      16: `icons/icon-${state.icon}-16.png`,
      32: `icons/icon-${state.icon}-32.png`,
    },
  });
  await chrome.action.setBadgeText({ tabId, text: state.badge });
  if (state.badge === '!') await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b78420' });
  else if (state.count) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b78420' });
  await chrome.action.setTitle({
    tabId,
    title: state.count
      ? `Video Pro Finder: ${state.count} media source${state.count === 1 ? '' : 's'} detected`
      : 'Video Pro Finder',
  });
}

async function clearTabSources(tabId) {
  const saved = await getValue(SOURCES_KEY, {});
  if (saved[tabId]) {
    delete saved[tabId];
    await setValue(SOURCES_KEY, saved);
  }
  await updateTabAction(tabId, []);
}

async function hasBroadHostAccess() {
  return chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
}

async function autoScanIfGranted(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && (await hasHostAccessForUrl(tab.url))) await scanTab(tabId);
}

async function hasHostAccessForUrl(url) {
  if (await hasBroadHostAccess()) return true;
  try {
    const parsed = new URL(url);
    if (!isScannablePage(parsed.href)) return false;
    return chrome.permissions.contains({ origins: [`${parsed.origin}/*`] });
  } catch {
    return false;
  }
}

async function scanTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
  await chrome.tabs.sendMessage(tabId, { type: 'SCAN_NOW' }).catch(() => {});
}

async function onDownloadChanged(delta) {
  await updateState((state) => {
    const job = state.queue.find((item) => item.downloadId === delta.id);
    if (!job) return state;
    if (delta.bytesReceived?.current != null || delta.totalBytes?.current > 0) {
      const bytesReceived = delta.bytesReceived?.current ?? job.progress.bytesReceived ?? 0;
      const totalBytes = delta.totalBytes?.current ?? job.progress.totalBytes ?? null;
      Object.assign(job, updateDownloadProgress(job, bytesReceived, totalBytes));
    }
    if (delta.state?.current === 'complete') {
      job.status = 'completed';
      job.progress.percent = 100;
      recordCompletedDownload(state, job);
    } else if (delta.state?.current === 'interrupted') {
      job.status = 'failed';
      job.error = {
        code: delta.error?.current || 'DOWNLOAD_INTERRUPTED',
        message: 'The browser interrupted this download.',
        technicalDetail: null,
        retryable: true,
      };
    } else if (delta.state?.current === 'in_progress') job.status = 'downloading';
    job.updatedAt = Date.now();
    return state;
  });
}

async function handleContextMenu(info, tab) {
  if (info.menuItemId === 'scan-page' && tab?.id != null)
    await handleMessage({ type: 'SCAN_TAB', tabId: tab.id }, { tab });
  if (
    ['analyze-link', 'prepare-download', 'inspect-link', 'save-link'].includes(info.menuItemId) &&
    info.linkUrl &&
    tab?.id != null
  ) {
    const source = normalizeSource(
      { src: info.linkUrl, label: info.linkUrl.split('/').pop() },
      tab.url,
    );
    source.pageTitle = tab.title || null;
    source.pageUrl = tab.url;
    source.eligibility = evaluateEligibility(source);
    if (['analyze-link', 'prepare-download', 'inspect-link'].includes(info.menuItemId)) {
      const saved = await getValue(SOURCES_KEY, {});
      const existing =
        saved[tab.id]?.pageUrl === tab.url
          ? saved[tab.id]
          : {
              sources: [],
              pageTitle: tab.title || '',
              pageUrl: tab.url,
              scannedAt: Date.now(),
            };
      const duplicate = existing.sources.findIndex(
        (item) => item.canonicalUrl === source.canonicalUrl,
      );
      if (duplicate >= 0)
        existing.sources[duplicate] = { ...existing.sources[duplicate], ...source };
      else existing.sources.unshift(source);
      saved[tab.id] = existing;
      await setValue(SOURCES_KEY, saved);
      await chrome.action.setBadgeText({ tabId: tab.id, text: '1' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d4af37' });
      if (['analyze-link', 'inspect-link', 'prepare-download'].includes(info.menuItemId))
        await openFinder(tab);
    }
    if (info.menuItemId === 'save-link')
      await updateState((state) => {
        state.library.unshift({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: source.label,
          pageUrl: tab.url,
          sourceUrl: source.src,
          originHost: source.originHost,
          thumbnail: source.thumbnail,
          streamType: source.streamType,
          quality: source.resolution,
          tags: [],
          collectionIds: [],
          notes: '',
          lastOpenedAt: null,
          previewProgressSeconds: null,
          durationSeconds: null,
          protectionStatus: source.protection.category,
          eligibilityStatus: source.eligibility.blockCode,
        });
        return state;
      });
  }
  if (info.menuItemId === 'copy-link' && info.linkUrl) await copyToClipboard(info.linkUrl);
}

async function copyToClipboard(text) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy a media link only after the user selects the context-menu copy action.',
    });
  }
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'COPY_TEXT', text });
  if (!result?.ok) throw new Error(result?.error || 'Could not copy the link.');
}

async function openFinder(tab) {
  if (chrome.action.openPopup) {
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
      return;
    } catch {}
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html'),
    windowId: tab.windowId,
    active: true,
  });
}
