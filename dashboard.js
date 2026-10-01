import { applyPreferences } from './utils/preferences.js';
import { formatBytes } from './utils/formatters.js';
import { formatEta, formatSpeed } from './utils/eta.js';
import { renderFilename } from './utils/filenameTemplate.js';
import { formatVariantLabel, parseDashManifest, parseHlsManifest } from './utils/playlistParser.js';
import { recommendVariant, variantPreferenceKey } from './utils/qualityAdvisor.js';
import { sourceDownloadExtension } from './utils/sourceNormalizer.js';

const $ = (selector) => document.querySelector(selector);
let activeTab;
let currentSource;
let pendingRequest;

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

async function initialize() {
  const originTabId = Number(new URL(location.href).searchParams.get('tabId'));
  const tab =
    Number.isInteger(originTabId) && originTabId > 0
      ? await chrome.tabs.get(originTabId).catch(() => null)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  activeTab = tab;
  $('#site-label').textContent = safeHost(tab?.url);
  const [page, response, permissions] = await Promise.all([
    send('GET_TAB_SOURCES', { tabId: tab?.id }),
    send('GET_STATE'),
    chrome.permissions.getAll(),
  ]);
  applyPreferences(response.state.settings);
  const hasAllSites =
    (permissions.origins || []).includes('http://*/*') &&
    (permissions.origins || []).includes('https://*/*');
  $('#all-sites').textContent = hasAllSites
    ? 'Turn off all-sites detection'
    : 'Enable all-sites detection';
  renderSources(page, response.state);
  renderQueue(response.state);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'This browser page cannot be scanned';
  }
}

function renderSources(page, state) {
  const sources = page.sources || [];
  $('#source-count').textContent = String(sources.length);
  $('#downloadable-count').textContent = String(
    sources.filter(
      (source) => source.eligibility?.canDownloadDirectly && source.streamType !== 'subtitle',
    ).length,
  );
  $('#protected-count').textContent = String(
    sources.filter((source) => source.protection?.isProtected).length,
  );
  $('#scan-time').textContent = page.scannedAt
    ? new Date(page.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not scanned';
  $('#source-total').textContent = `${sources.length} ${sources.length === 1 ? 'item' : 'items'}`;
  const root = $('#sources');
  root.replaceChildren();
  if (!sources.length) {
    root.append(
      node(
        'div',
        'dashboard-empty',
        page.scannedAt
          ? 'No supported media sources were found on this page.'
          : 'No scan results yet. Use Scan page or enable all-sites detection.',
      ),
    );
    $('#status').textContent = page.scannedAt
      ? 'No supported browser-exposed media was found.'
      : 'Scan the active page to inspect browser-exposed media.';
    return;
  }
  $('#status').textContent =
    `${sources.length} source${sources.length === 1 ? '' : 's'} detected. A detected source is not proof of download permission.`;
  for (const source of sources) root.append(renderSource(source, state));
}

function metadataRows(source) {
  const details = node('details', 'media-details');
  details.append(node('summary', '', 'Technical details'));
  const list = node('dl', 'media-data');
  const resolution =
    source.width && source.height
      ? `${source.width} × ${source.height}`
      : source.resolution || 'Not reported';
  const duration = Number.isFinite(source.durationSeconds)
    ? `${Math.floor(source.durationSeconds / 60)}:${String(Math.floor(source.durationSeconds % 60)).padStart(2, '0')}`
    : 'Not reported';
  const values = [
    ['Format', source.mime || source.streamType.toUpperCase()],
    ['Quality', resolution],
    ['Bitrate', source.bitrate ? `${Math.round(source.bitrate / 1000)} kbps` : 'Not reported'],
    ['Codec', source.codecs || 'Not reported'],
    ['Frame rate', source.fps ? `${source.fps} fps` : 'Not reported'],
    ['Duration', duration],
    ['Estimated size', formatBytes(source.estimatedSize)],
    ['Captions', String(source.subtitles?.length || 0)],
  ];
  for (const [label, value] of values) {
    list.append(node('dt', '', label), node('dd', '', value));
  }
  details.append(list);
  return details;
}

function renderSource(source, state) {
  const card = node('article', 'media-card');
  const heading = node('div', 'media-card-heading');
  const text = node('div', 'media-card-title');
  text.append(
    node('h3', '', source.label || 'Media source'),
    node(
      'p',
      'muted',
      `${source.originHost || 'Unknown host'} · ${source.streamType.toUpperCase()}`,
    ),
  );
  const blocked = source.protection?.isProtected || source.streamType === 'torrent';
  const chip = node(
    'span',
    `source-status ${blocked ? 'is-blocked' : source.eligibility?.canDownloadDirectly ? 'is-ready' : 'is-analysis'}`,
    source.protection?.isProtected
      ? 'Protected'
      : source.streamType === 'torrent'
        ? 'Unsupported'
        : source.eligibility?.canDownloadDirectly
          ? 'Direct file'
          : 'Analyze',
  );
  heading.append(text, chip);
  card.append(heading, metadataRows(source));
  if (source.protection?.isProtected) {
    card.append(
      node('p', 'protection-note', 'Protected media is unavailable for download or preview.'),
    );
    return card;
  }
  const actions = node('div', 'media-actions');
  if (source.eligibility?.canPreview) {
    const preview = node('button', 'button quiet', 'Play preview');
    preview.type = 'button';
    preview.addEventListener('click', () => playSource(source));
    actions.append(preview);
  }
  if (source.streamType === 'hls' || source.streamType === 'dash') {
    const analyze = node(
      'button',
      'button quiet',
      source.variants?.length ? 'Refresh analysis' : 'Analyze stream',
    );
    analyze.type = 'button';
    analyze.addEventListener('click', () => analyzeSource(source, analyze));
    actions.append(analyze);
  }
  if (
    source.eligibility?.canDownloadDirectly &&
    (source.streamType !== 'subtitle' || state.settings.defaultDownloadSubtitles)
  ) {
    const download = node(
      'button',
      'button primary',
      source.streamType === 'subtitle' ? 'Save caption' : 'Download file',
    );
    download.type = 'button';
    download.addEventListener('click', () => openAuthority(source));
    actions.append(download);
  }
  const copy = node('button', 'button quiet', 'Copy URL');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(source.src);
    copy.textContent = 'Copied';
  });
  actions.append(copy);
  if (source.variants?.length) {
    card.append(renderQuality(source, state));
    const variants = node('ul', 'variant-list');
    for (const variant of source.variants) {
      variants.append(
        node(
          'li',
          '',
          `${formatVariantLabel(variant)} · ${variant.codecs || 'codec not reported'}${variant.estimatedSize ? ` · ${formatBytes(variant.estimatedSize)}` : ''}`,
        ),
      );
    }
    card.append(variants);
  }
  if (source.subtitles?.length) {
    for (const subtitle of source.subtitles) {
      const label = subtitle.label || subtitle.language || 'Caption';
      card.append(node('p', 'muted', `Caption: ${label}`));
      if (state.settings.defaultDownloadSubtitles) {
        const save = node('button', 'button quiet', `Save ${label}`);
        save.type = 'button';
        save.addEventListener('click', () => {
          const url = subtitle.url || subtitle.src;
          const caption = {
            ...source,
            id: `${source.id}-caption-${url}`,
            src: url,
            canonicalUrl: url,
            label: `${source.label} ${label}`,
            streamType: 'subtitle',
            mime: subtitle.mime || 'text/vtt',
            resolution: null,
            eligibility: { canDownloadDirectly: true },
          };
          openAuthority(caption, { parentSource: source, subtitleUrl: url });
        });
        actions.append(save);
      }
    }
  }
  card.append(actions);
  return card;
}

function renderQuality(source, state) {
  const panel = node('div', 'recommendation-panel');
  const pref = state.hostPreferences?.[source.originHost];
  const speed = [...state.queue].reverse().find((job) => job.bandwidth?.smoothedBytesPerSecond > 0)
    ?.bandwidth.smoothedBytesPerSecond;
  const variants = source.variants.map((variant) => ({
    ...variant,
    estimatedSize:
      variant.estimatedSize ||
      (source.durationSeconds > 0 && (variant.averageBandwidth || variant.bandwidth)
        ? Math.round(((variant.averageBandwidth || variant.bandwidth) * source.durationSeconds) / 8)
        : null),
  }));
  const recommendation = recommendVariant(variants, state.settings.defaultQualityMode, {
    remembered: pref?.variantKey ?? pref?.height,
    bytesPerSecond: speed,
  });
  panel.append(
    node('span', 'eyebrow', 'Recommended quality'),
    node(
      'strong',
      '',
      recommendation.variant ? formatVariantLabel(recommendation.variant) : 'Estimate unavailable',
    ),
    node('p', 'muted', recommendation.reason),
  );
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Preferred media quality for this host');
  for (const variant of variants) {
    const option = document.createElement('option');
    option.value = variantPreferenceKey(variant);
    option.textContent = formatVariantLabel(variant);
    option.selected = recommendation.variant === variant;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    await send('UPDATE_HOST_PREFERENCE', { host: source.originHost, variantKey: select.value });
    await initialize();
  });
  panel.append(
    select,
    node('small', 'muted', 'Analysis only; adaptive streams are not saved as files in this build.'),
  );
  return panel;
}

async function analyzeSource(source, button) {
  button.disabled = true;
  const old = button.textContent;
  button.textContent = 'Analyzing…';
  try {
    const response = await send('ANALYZE_SOURCE', { tabId: activeTab.id, source });
    if (!response.ok) throw new Error(response.error);
    const parsed =
      source.streamType === 'hls'
        ? parseHlsManifest(response.text, source.src)
        : parseDashManifest(response.text, source.src);
    const result = await send('STORE_SOURCE_ANALYSIS', {
      tabId: activeTab.id,
      source,
      analysis: {
        protection: parsed.protection,
        variants: parsed.variants || [],
        subtitles: [...(source.subtitles || []), ...(parsed.subtitles || [])],
        live: parsed.live ?? false,
      },
    });
    if (!result.ok) throw new Error(result.error);
    $('#status').textContent = parsed.protection.isProtected
      ? 'Protection found. Actions are blocked.'
      : `Analysis found ${parsed.variants?.length || 0} variants.`;
    await initialize();
  } catch (error) {
    $('#status').textContent = error.message;
    button.disabled = false;
    button.textContent = old;
  }
}

function playSource(source) {
  const stage = $('#player-stage');
  stage.replaceChildren();
  const media = document.createElement(source.streamType === 'audio' ? 'audio' : 'video');
  media.controls = true;
  media.autoplay = true;
  media.playsInline = true;
  media.src = source.src;
  for (const caption of source.subtitles || []) {
    const track = document.createElement('track');
    track.kind = 'captions';
    track.src = caption.url || caption.src;
    track.label = caption.label || caption.language || 'Caption';
    track.srclang = caption.language || 'und';
    media.append(track);
  }
  media.addEventListener('error', () => {
    $('#preview-note').textContent =
      'The browser could not play this source. Format, CORS, or provider restrictions may apply.';
  });
  stage.append(media);
  $('#preview-title').textContent = source.label || 'Preview';
  $('#preview-note').textContent =
    'Native browser playback. Playback support depends on the browser and source.';
}

function renderQueue(state) {
  const active = state.queue.filter((job) => ['queued', 'downloading'].includes(job.status));
  $('#queue-count').textContent = `${active.length} active`;
  $('#radar').classList.toggle('is-active', active.length > 0);
  const root = $('#queue');
  root.replaceChildren();
  const jobs = [...state.queue].slice(-5).reverse();
  if (!jobs.length) {
    root.append(node('p', 'muted', 'Waiting for downloads.'));
    return;
  }
  for (const job of jobs) {
    const row = node('article', 'queue-job');
    row.append(node('strong', '', job.source.label), node('span', 'muted', job.status));
    if (job.status === 'downloading') {
      const progress = document.createElement('progress');
      progress.max = 100;
      progress.value = job.progress.percent || 0;
      row.append(
        progress,
        node(
          'small',
          'muted',
          `${job.progress.percent || 0}% · ${formatBytes(job.progress.bytesReceived)} / ${formatBytes(job.progress.totalBytes)} · ${formatSpeed(job.progress.bytesPerSecond)} · ${formatEta(job.progress.etaSeconds)}`,
        ),
      );
      const cancel = node('button', 'button quiet', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        await send('CANCEL_JOB', { jobId: job.id });
        await initialize();
      });
      row.append(cancel);
    }
    if (job.status === 'completed' && job.downloadId != null) {
      const show = node('button', 'button quiet', 'Show file');
      show.type = 'button';
      show.addEventListener('click', () => send('SHOW_DOWNLOAD', { jobId: job.id }));
      row.append(show);
    }
    root.append(row);
  }
}

function openAuthority(source, subtitleRequest = null) {
  currentSource = source;
  pendingRequest = subtitleRequest;
  $('#authority-source').textContent =
    `${source.label} · ${source.resolution || source.streamType}`;
  send('GET_STATE').then(({ state }) => {
    $('#authority-filename').textContent =
      `Filename: ${renderFilename(state.settings.filenameTemplate, { title: source.label, quality: source.resolution, origin: source.originHost, ext: sourceDownloadExtension(source) })}`;
    $('#authority-basis').value = state.settings.rememberAuthorityBasis
      ? state.settings.lastAuthorityBasis || ''
      : '';
    $('#authority-confirm').checked = false;
    $('#case-reference').value = '';
    $('#organization-name').value = '';
    $('#authorization-note').value = '';
    $('#start-download').disabled = !(
      $('#authority-basis').value && $('#authority-confirm').checked
    );
    $('#authority-dialog').showModal();
  });
}

function updateGate() {
  $('#start-download').disabled = !($('#authority-basis').value && $('#authority-confirm').checked);
}
$('#authority-basis').addEventListener('change', updateGate);
$('#authority-confirm').addEventListener('change', updateGate);
$('#cancel-download').addEventListener('click', () => $('#authority-dialog').close());
$('#authority-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const type = pendingRequest ? 'START_SUBTITLE_DOWNLOAD' : 'START_DOWNLOAD';
  const result = await send(type, {
    tabId: activeTab.id,
    source: currentSource,
    parentSource: pendingRequest?.parentSource,
    subtitleUrl: pendingRequest?.subtitleUrl,
    authorization: {
      basis: $('#authority-basis').value,
      confirmed: $('#authority-confirm').checked,
      caseReference: $('#case-reference').value,
      organizationName: $('#organization-name').value,
      authorizationNote: $('#authorization-note').value,
    },
  });
  $('#authority-dialog').close();
  $('#status').textContent = result.ok ? 'Browser download started.' : result.error;
  if (result.ok) await send('REMEMBER_AUTHORITY_BASIS', { basis: $('#authority-basis').value });
  pendingRequest = null;
  await initialize();
});

$('#scan').addEventListener('click', async () => {
  $('#status').textContent = 'Scanning this page…';
  const result = await send('SCAN_TAB', { tabId: activeTab.id });
  if (!result.ok) $('#status').textContent = result.error;
  await new Promise((resolve) => setTimeout(resolve, 300));
  await initialize();
});
$('#all-sites').addEventListener('click', async () => {
  const permissions = await chrome.permissions.getAll();
  const hasAllSites =
    permissions.origins?.includes('http://*/*') && permissions.origins?.includes('https://*/*');
  if (hasAllSites) {
    const removed = await chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] });
    $('#status').textContent = removed
      ? 'Automatic all-sites detection disabled.'
      : 'Could not revoke all-sites access.';
  } else {
    if (!confirm('Allow automatic detection on every HTTP and HTTPS website?')) return;
    const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
    if (!granted) {
      $('#status').textContent = 'Permission not granted.';
      return;
    }
    const response = await send('AUTO_SCAN_ACTIVE_TAB', { tabId: activeTab?.id });
    $('#status').textContent = response.ok ? 'All-sites detection enabled.' : response.error;
  }
  await initialize();
});
$('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((changes) => {
  if (changes.state || changes.tabSources) void initialize();
});
void initialize();
