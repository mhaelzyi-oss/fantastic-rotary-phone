const $ = (selector) => document.querySelector(selector);
let currentTab;
let activeSource;
let activeRetryJobId = null;
let activeSubtitleRequest = null;
import { applyPreferences } from './utils/preferences.js';
import { renderFilename } from './utils/filenameTemplate.js';
import { formatVariantLabel, parseDashManifest, parseHlsManifest } from './utils/playlistParser.js';
import { recommendVariant, variantPreferenceKey } from './utils/qualityAdvisor.js';
import { formatBytes } from './utils/formatters.js';
import { formatEta, formatSpeed } from './utils/eta.js';
import { sourceDownloadExtension } from './utils/sourceNormalizer.js';

async function message(payload) {
  return chrome.runtime.sendMessage(payload);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function load() {
  const [tabs] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs;
  $('#origin').textContent = (() => {
    try {
      return new URL(tabs.url).host;
    } catch {
      return 'Current page';
    }
  })();
  const [page, response] = await Promise.all([
    message({ type: 'GET_TAB_SOURCES', tabId: tabs.id }),
    message({ type: 'GET_STATE' }),
  ]);
  renderSources(page, response.state);
  renderQueue(response.state);
  applyPreferences(response.state.settings);
}

function renderSources(result, state) {
  const root = $('#sources');
  root.replaceChildren();
  const sources = result.sources || [];
  const eligible = sources.filter((item) => item.eligibility.canDownloadDirectly).length;
  const protectedCount = sources.filter((item) => item.protection.isProtected).length;
  $('#eligible-count').textContent = eligible;
  $('#protected-count').textContent = protectedCount;
  $('#scan-time').textContent = result.scannedAt
    ? `Scanned ${new Date(result.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not scanned';
  if (!sources.length) {
    $('#notice').textContent = result.scannedAt
      ? 'No supported browser-exposed media was found on this page.'
      : 'Scan the current page to find browser-exposed media.';
    return;
  }
  $('#notice').textContent =
    protectedCount && !eligible
      ? 'Sources were found, but protected media cannot be downloaded.'
      : `${sources.length} browser-exposed source${sources.length === 1 ? '' : 's'} found.`;
  for (const source of sources) root.append(sourceCard(source, state));
}

function sourceCard(source, state) {
  const card = el('article', 'source-card');
  const row = el('div', 'source-row');
  const visual = el(
    'div',
    'source-thumb',
    source.streamType === 'torrent' ? '×' : source.streamType.slice(0, 1).toUpperCase(),
  );
  if (source.thumbnail) {
    const image = el('img');
    image.src = source.thumbnail;
    image.alt = '';
    visual.replaceChildren(image);
  }
  const details = el('div', 'source-main');
  details.append(
    el('h3', '', source.label || 'Media source'),
    el(
      'p',
      'source-meta',
      `${source.originHost || 'Unknown host'} · ${source.streamType.toUpperCase()}${source.resolution ? ` · ${source.resolution}` : ''}`,
    ),
  );
  const status = el(
    'span',
    `status-chip ${source.protection.isProtected ? 'protected' : source.eligibility.canDownloadDirectly ? 'eligible' : 'blocked'}`,
    source.protection.isProtected
      ? 'Protected'
      : source.eligibility.canDownloadDirectly
        ? 'Eligible'
        : source.eligibility.blockCode === 'TORRENT_UNSUPPORTED'
          ? 'Unsupported'
          : 'Analyze first',
  );
  row.append(visual, details, status);
  card.append(row);
  if (source.protection.isProtected)
    card.append(
      el('p', 'card-warning', 'Protected or encrypted media detected. Download is unavailable.'),
    );
  else if (source.eligibility.blockReason)
    card.append(el('p', 'card-warning', source.eligibility.blockReason));
  else if (source.eligibility.canDownloadDirectly)
    card.append(
      el(
        'p',
        'card-warning',
        'No public protection signal was observed. This does not prove the media is unprotected or that you have permission to save it.',
      ),
    );
  const actions = el('div', 'card-actions');
  const openPage = el('button', 'button quiet', 'Open page');
  openPage.type = 'button';
  openPage.addEventListener('click', () =>
    window.open(source.pageUrl || source.src, '_blank', 'noopener'),
  );
  actions.append(openPage);
  if (source.protection.isProtected) {
    const why = el('a', 'button quiet', 'Why unavailable');
    why.href = chrome.runtime.getURL('resources.html#protected');
    why.target = '_blank';
    actions.append(why);
  }
  if (source.eligibility.canPreview) {
    const preview = el('button', 'button quiet', 'Preview');
    preview.type = 'button';
    preview.addEventListener('click', () => window.open(source.src, '_blank', 'noopener'));
    actions.append(preview);
  }
  const save = el('button', 'button quiet', 'Save to library');
  save.type = 'button';
  save.addEventListener('click', async () => {
    await message({ type: 'SAVE_LIBRARY', source });
    save.textContent = 'Saved';
  });
  actions.append(save);
  const copy = el('button', 'button quiet', 'Copy URL');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(source.src);
    copy.textContent = 'Copied';
  });
  actions.append(copy);
  if (['hls', 'dash'].includes(source.streamType) && !source.protection.isProtected) {
    const analyze = el('button', 'button quiet', source.variants.length ? 'Reanalyze' : 'Analyze');
    analyze.type = 'button';
    analyze.addEventListener('click', async () => {
      analyze.disabled = true;
      analyze.textContent = 'Analyzing…';
      try {
        const fetched = await message({ type: 'ANALYZE_SOURCE', tabId: currentTab.id, source });
        if (!fetched.ok) throw new Error(fetched.error);
        const parsed =
          source.streamType === 'hls'
            ? parseHlsManifest(fetched.text, source.src)
            : parseDashManifest(fetched.text, source.src);
        const protection = parsed.protection;
        const analysis = {
          protection,
          variants: parsed.variants || [],
          subtitles: [...(source.subtitles || []), ...(parsed.subtitles || [])],
          live: parsed.live ?? false,
          eligibility: {},
        };
        const stored = await message({
          type: 'STORE_SOURCE_ANALYSIS',
          tabId: currentTab.id,
          source,
          analysis,
        });
        if (!stored.ok) throw new Error(stored.error);
        $('#notice').textContent = protection.isProtected
          ? 'Protection was detected. Download remains blocked.'
          : `Analysis found ${analysis.variants.length} variant${analysis.variants.length === 1 ? '' : 's'}.`;
        await load();
      } catch (error) {
        $('#notice').textContent = error.message;
        analyze.disabled = false;
        analyze.textContent = 'Analyze';
      }
    });
    actions.append(analyze);
  }
  if (source.variants?.length && !source.protection.isProtected) {
    card.append(qualityPanel(source, state));
    const variantList = el('ul', 'variant-list');
    for (const variant of source.variants) {
      const line = el(
        'li',
        '',
        `${variant.height ? `${variant.height}p` : variant.mimeType || 'Variant'} · ${variant.bandwidth ? `${Math.round(variant.bandwidth / 1000)} kbps` : 'bitrate unknown'}${variant.codecs ? ` · ${variant.codecs}` : ''}`,
      );
      variantList.append(line);
    }
    card.append(variantList);
  }
  if (source.subtitles?.length && !source.protection.isProtected) {
    for (const subtitle of source.subtitles) {
      const title = subtitle.label || subtitle.language || 'Available';
      card.append(el('p', 'source-meta', `Caption: ${title}`));
      if (!state.settings.defaultDownloadSubtitles) continue;
      const saveCaption = el('button', 'button quiet', `Save ${title}`);
      saveCaption.type = 'button';
      saveCaption.addEventListener('click', () => {
        const url = subtitle.url || subtitle.src;
        const captionSource = {
          ...source,
          id: `${source.id}-caption-${url}`,
          src: url,
          canonicalUrl: url,
          label: `${source.label} ${title}`,
          streamType: 'subtitle',
          mime: subtitle.mime || 'text/vtt',
          resolution: null,
          eligibility: { canDownloadDirectly: true },
        };
        openAuthority(captionSource, null, { parentSource: source, subtitleUrl: url });
      });
      actions.append(saveCaption);
    }
  }
  if (
    source.eligibility.canDownloadDirectly &&
    (source.streamType !== 'subtitle' || state.settings.defaultDownloadSubtitles)
  ) {
    const download = el(
      'button',
      'button primary',
      source.streamType === 'subtitle' ? 'Save caption' : 'Download',
    );
    download.type = 'button';
    download.addEventListener('click', () => openAuthority(source));
    actions.append(download);
  }
  card.append(actions);
  return card;
}

function qualityPanel(source, state) {
  const panel = el('section', 'quality-panel');
  const mode = state.settings.defaultQualityMode || 'best_balance';
  const preference = state.hostPreferences?.[source.originHost];
  const remembered = preference?.variantKey ?? preference?.height;
  const lastMeasuredSpeed = [...state.queue]
    .reverse()
    .find((job) => job.bandwidth?.smoothedBytesPerSecond > 0)?.bandwidth.smoothedBytesPerSecond;
  const variants = source.variants.map((variant) => ({
    ...variant,
    estimatedSize:
      variant.estimatedSize ||
      (source.durationSeconds > 0 && (variant.averageBandwidth || variant.bandwidth)
        ? Math.round(((variant.averageBandwidth || variant.bandwidth) * source.durationSeconds) / 8)
        : null),
  }));
  const recommendation = recommendVariant(variants, mode, {
    remembered,
    bytesPerSecond: lastMeasuredSpeed,
  });
  panel.append(el('strong', '', 'Quality recommendation'));
  panel.append(el('p', 'quality-reason', recommendation.reason));
  if (recommendation.variant) {
    panel.append(
      el('p', 'quality-selected', `Recommended: ${formatVariantLabel(recommendation.variant)}`),
    );
    const select = document.createElement('select');
    select.className = 'quality-select';
    select.setAttribute('aria-label', 'Preferred media quality for this host');
    for (const variant of variants) {
      const option = document.createElement('option');
      option.value = variantPreferenceKey(variant);
      option.textContent = formatVariantLabel(variant);
      option.selected = remembered
        ? variantPreferenceKey(variant) === String(remembered) || variant.height === remembered
        : variantPreferenceKey(variant) === variantPreferenceKey(recommendation.variant);
      select.append(option);
    }
    select.addEventListener('change', async () => {
      if (select.value) {
        await message({
          type: 'UPDATE_HOST_PREFERENCE',
          host: source.originHost,
          variantKey: select.value,
        });
        await load();
      }
    });
    panel.append(select);
    if (mode === 'fastest' && lastMeasuredSpeed > 0 && recommendation.variant.estimatedSize > 0)
      panel.append(
        el(
          'p',
          'quality-reason',
          `Estimated time: ${formatEta(Math.ceil(recommendation.variant.estimatedSize / lastMeasuredSpeed))}`,
        ),
      );
  }
  panel.append(
    el(
      'p',
      'quality-disclaimer',
      'Manifest variants are shown for analysis only. This build does not download or package adaptive-stream variants.',
    ),
  );
  return panel;
}

function renderQueue(state) {
  const jobs = (state?.queue || []).slice(-4).reverse();
  $('#queue-count').textContent =
    state?.queue?.filter((job) => ['queued', 'downloading'].includes(job.status)).length || 0;
  $('#queue-total').textContent = `${jobs.length} item${jobs.length === 1 ? '' : 's'}`;
  const root = $('#queue');
  root.replaceChildren();
  for (const job of jobs) {
    const row = el('div', 'queue-item');
    row.append(el('strong', '', job.source.label), el('span', 'queue-status', job.status));
    if (job.error) row.append(el('span', 'queue-detail', job.error.message));
    if (job.status === 'downloading') {
      const progress = el('progress', 'progress');
      progress.max = 100;
      progress.value = job.progress.percent || 0;
      row.append(progress);
      row.append(
        el(
          'span',
          'queue-detail',
          `${job.progress.percent || 0}% · ${formatBytes(job.progress.bytesReceived)} / ${formatBytes(job.progress.totalBytes)}`,
        ),
      );
      row.append(
        el(
          'span',
          'queue-detail',
          `${formatSpeed(job.progress.bytesPerSecond)} · ${formatEta(job.progress.etaSeconds)}`,
        ),
      );
      const cancel = el('button', 'button quiet queue-cancel', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        const result = await message({ type: 'CANCEL_JOB', jobId: job.id });
        if (!result.ok) $('#notice').textContent = result.error;
        await load();
      });
      row.append(cancel);
    }
    if (job.status === 'completed' && job.downloadId != null) {
      const show = el('button', 'button quiet queue-cancel', 'Show file');
      show.type = 'button';
      show.addEventListener('click', async () => {
        const result = await message({ type: 'SHOW_DOWNLOAD', jobId: job.id });
        if (!result.ok) $('#notice').textContent = result.error;
      });
      row.append(show);
    }
    if (
      job.status === 'failed' &&
      job.error?.retryable &&
      job.retry.attempts < job.retry.maxAttempts
    ) {
      const retry = el('button', 'button quiet queue-cancel', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => openAuthority(job.source, job.id));
      row.append(retry);
    }
    root.append(row);
  }
  if (!jobs.length) root.append(el('p', 'empty-queue', 'Downloads you start will appear here.'));
}

async function openAuthority(source, retryJobId = null, subtitleRequest = null) {
  activeSource = source;
  activeRetryJobId = retryJobId;
  activeSubtitleRequest = subtitleRequest;
  $('#authority-source').textContent =
    `${source.label} · ${source.resolution || 'quality unknown'}`;
  const { state } = await message({ type: 'GET_STATE' });
  const extension = sourceDownloadExtension(source);
  $('#authority-filename').textContent =
    `Filename preview: ${renderFilename(state.settings.filenameTemplate, { title: source.label, quality: source.resolution, origin: source.originHost, ext: extension })}`;
  $('#authority-basis').value = state.settings.rememberAuthorityBasis
    ? state.settings.lastAuthorityBasis || ''
    : '';
  $('#authority-confirm').checked = false;
  $('#case-reference').value = '';
  $('#organization-name').value = '';
  $('#authorization-note').value = '';
  $('#start-download').textContent = retryJobId ? 'Confirm and retry' : 'Start download';
  $('#start-download').disabled = true;
  $('#authority-dialog').showModal();
}

function validateGate() {
  $('#start-download').disabled = !($('#authority-basis').value && $('#authority-confirm').checked);
}
$('#authority-basis').addEventListener('change', validateGate);
$('#authority-confirm').addEventListener('change', validateGate);
$('#cancel-download').addEventListener('click', () => $('#authority-dialog').close());
$('#authority-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await message({
    type: activeSubtitleRequest
      ? 'START_SUBTITLE_DOWNLOAD'
      : activeRetryJobId
        ? 'RETRY_DOWNLOAD'
        : 'START_DOWNLOAD',
    ...(activeRetryJobId ? { jobId: activeRetryJobId } : {}),
    ...(activeSubtitleRequest || {}),
    tabId: currentTab.id,
    source: activeSource,
    authorization: {
      basis: $('#authority-basis').value,
      confirmed: $('#authority-confirm').checked,
      caseReference: $('#case-reference').value,
      organizationName: $('#organization-name').value,
      authorizationNote: $('#authorization-note').value,
    },
  });
  $('#authority-dialog').close();
  if (!result.ok) {
    $('#notice').textContent = result.error;
    return;
  }
  await message({ type: 'REMEMBER_AUTHORITY_BASIS', basis: $('#authority-basis').value });
  $('#notice').textContent = activeRetryJobId
    ? 'A newly authorized retry was handed to the browser.'
    : 'Download handed to the browser. Progress is available in Recent queue.';
  activeRetryJobId = null;
  activeSubtitleRequest = null;
  await load();
});

$('#scan').addEventListener('click', async () => {
  $('#notice').textContent = 'Scanning this page…';
  const result = await message({ type: 'SCAN_TAB', tabId: currentTab.id });
  if (!result.ok) $('#notice').textContent = result.error;
  setTimeout(load, 350);
});
$('#open-library').addEventListener('click', () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }),
);
$('#open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) void load();
});
void load();
