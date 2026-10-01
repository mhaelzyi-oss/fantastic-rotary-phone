const $ = (selector) => document.querySelector(selector);
let settings;
let editingPresetId = null;
import { applyPreferences } from './utils/preferences.js';
import { lintFilenameTemplate } from './utils/promptOptimizer.js';
import { DEFAULT_SETTINGS } from './utils/constants.js';
import { validateSettingsUpdate } from './utils/settingsValidation.js';

async function load() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  settings = response.state.settings;
  applyPreferences(settings);
  $('#theme').value = settings.theme;
  $('#glass').value = settings.liquidGlassIntensity;
  $('#motion').value = settings.reduceMotionOverride;
  $('#quality').value = settings.defaultQualityMode;
  $('#filename').value = settings.filenameTemplate;
  $('#default-prompt').value = settings.defaultPrompt;
  $('#download-subtitles').checked = settings.defaultDownloadSubtitles;
  $('#remember-authority').checked = settings.rememberAuthorityBasis;
  await renderPermissions(response.state.hostPreferences);
  renderPresets(response.state.presets);
  renderDiagnostics(response.state.diagnostics);
  renderAuthorityAudit(response.state.history);
  preview();
}

function renderPresets(presets = []) {
  const root = $('#preset-list');
  root.replaceChildren();
  if (!presets.length) root.textContent = 'No saved presets.';
  for (const [index, preset] of presets.entries()) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    const label = document.createElement('span');
    label.textContent = preset.name;
    const use = document.createElement('button');
    use.className = 'button quiet';
    use.textContent = 'Use';
    use.addEventListener('click', async () => {
      $('#default-prompt').value = preset.prompt;
      $('#filename').value = preset.filenameTemplate;
      preview();
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { defaultPrompt: preset.prompt, filenameTemplate: preset.filenameTemplate },
      });
      $('#settings-status').textContent = `Applied preset: ${preset.name}.`;
    });
    const edit = document.createElement('button');
    edit.className = 'button quiet';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      editingPresetId = preset.id;
      $('#preset-name').value = preset.name;
      $('#default-prompt').value = preset.prompt;
      $('#filename').value = preset.filenameTemplate;
      $('#add-preset').textContent = 'Save preset changes';
      preview();
    });
    const up = document.createElement('button');
    up.className = 'button quiet';
    up.textContent = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', () => movePreset(presets, index, -1));
    const down = document.createElement('button');
    down.className = 'button quiet';
    down.textContent = 'Move down';
    down.disabled = index === presets.length - 1;
    down.addEventListener('click', () => movePreset(presets, index, 1));
    const remove = document.createElement('button');
    remove.className = 'button danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () =>
      savePresets(presets.filter((item) => item.id !== preset.id)),
    );
    row.append(label, use, edit, up, down, remove);
    root.append(row);
  }
}

async function movePreset(presets, index, delta) {
  const reordered = [...presets];
  const target = index + delta;
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await savePresets(reordered);
}

async function savePresets(presets) {
  const result = await chrome.runtime.sendMessage({ type: 'SAVE_PRESETS', presets });
  if (!result.ok) {
    $('#settings-status').textContent = result.error;
    return;
  }
  const state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  renderPresets(state.presets);
}

function renderDiagnostics(diagnostics = []) {
  const root = $('#diagnostic-list');
  root.replaceChildren();
  if (!diagnostics.length) root.textContent = 'No local diagnostics.';
  for (const entry of [...diagnostics].slice(-20).reverse()) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    row.textContent = `${new Date(entry.createdAt).toLocaleString()} · ${entry.severity.toUpperCase()} · ${entry.title}: ${entry.userMessage}`;
    root.append(row);
  }
}

function renderAuthorityAudit(history = []) {
  const root = $('#authority-audit');
  root.replaceChildren();
  const records = history.filter((record) => record.authorizationBasis);
  if (!records.length) root.textContent = 'No authority bases recorded locally.';
  for (const record of records.slice(0, 20)) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    row.textContent = `${new Date(record.completedAt || record.createdAt).toLocaleString()} · ${record.filename} · ${record.originHost} · ${record.authorizationBasis}`;
    root.append(row);
  }
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function renderPermissions(hostPreferences) {
  const permissionRoot = $('#host-permissions');
  permissionRoot.replaceChildren();
  const permissions = await chrome.permissions.getAll();
  const origins = permissions.origins || [];
  if (!origins.length) permissionRoot.textContent = 'No optional host access granted.';
  for (const origin of origins) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    const label = document.createElement('span');
    label.textContent = origin;
    const remove = document.createElement('button');
    remove.className = 'button quiet';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const removed = await chrome.permissions.remove({ origins: [origin] });
      $('#settings-status').textContent = removed
        ? `Removed access: ${origin}`
        : 'Permission could not be removed.';
      await renderPermissions(hostPreferences);
    });
    row.append(label, remove);
    permissionRoot.append(row);
  }
  const preferenceRoot = $('#host-preferences');
  preferenceRoot.replaceChildren();
  const entries = Object.entries(hostPreferences || {});
  if (!entries.length) preferenceRoot.textContent = 'No remembered host quality choices.';
  for (const [host, preference] of entries) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    const label = document.createElement('span');
    label.textContent = `${host} · ${preference.height ? `${preference.height}p` : 'Saved variant'}`;
    const remove = document.createElement('button');
    remove.className = 'button quiet';
    remove.textContent = 'Reset';
    remove.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'RESET_HOST_PREFERENCE', host });
      await load();
    });
    row.append(label, remove);
    preferenceRoot.append(row);
  }
}
function preview() {
  $('#filename-preview').textContent =
    `Preview: ${$('#filename').value.replace('{title}', 'Sample video').replace('{YYYYMMDD}', '20260928').replace('{quality}', '1080p').replace('{ext}', 'mp4')}`;
  const lint = lintFilenameTemplate($('#filename').value);
  $('#filename-warning').textContent = lint.warnings.join(' ');
}
$('#filename').addEventListener('input', preview);
$('#save-settings').addEventListener('click', async () => {
  const nextSettings = {
    theme: $('#theme').value,
    liquidGlassIntensity: $('#glass').value,
    reduceMotionOverride: $('#motion').value,
    defaultQualityMode: $('#quality').value,
    filenameTemplate: $('#filename').value,
    defaultPrompt: $('#default-prompt').value,
    defaultDownloadSubtitles: $('#download-subtitles').checked,
    rememberAuthorityBasis: $('#remember-authority').checked,
  };
  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: nextSettings,
  });
  settings = { ...settings, ...nextSettings };
  applyPreferences(settings);
  $('#settings-status').textContent = 'Preferences saved locally.';
});
$('#add-preset').addEventListener('click', async () => {
  const name = $('#preset-name').value.trim();
  if (!name) {
    $('#settings-status').textContent = 'Enter a name for this preset.';
    return;
  }
  const state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  const preset = {
    id: editingPresetId || crypto.randomUUID(),
    name: name.slice(0, 60),
    prompt: $('#default-prompt').value,
    filenameTemplate: $('#filename').value,
    createdAt: state.presets.find((item) => item.id === editingPresetId)?.createdAt || Date.now(),
  };
  const presets = editingPresetId
    ? state.presets.map((item) => (item.id === editingPresetId ? preset : item))
    : [...state.presets, preset];
  await savePresets(presets);
  editingPresetId = null;
  $('#add-preset').textContent = 'Save current prompt as preset';
  $('#preset-name').value = '';
  $('#settings-status').textContent = 'Prompt preset saved locally.';
});
$('#export-diagnostics').addEventListener('click', async () => {
  if (!confirm('Export a sanitized local diagnostic report? Review it before sharing.')) return;
  const state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  const safe = state.diagnostics.map(
    ({
      id,
      createdAt,
      category,
      severity,
      code,
      title,
      userMessage,
      sourceHost,
      jobId,
      resolved,
    }) => ({
      id,
      createdAt,
      category,
      severity,
      code,
      title,
      userMessage,
      sourceHost,
      jobId,
      resolved,
    }),
  );
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'video-pro-finder-diagnostics.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
$('#reset-defaults').addEventListener('click', async () => {
  if (
    !confirm(
      'Reset appearance and download preferences to defaults? Saved library and history will remain.',
    )
  )
    return;
  const defaults = {
    theme: DEFAULT_SETTINGS.theme,
    liquidGlassIntensity: DEFAULT_SETTINGS.liquidGlassIntensity,
    reduceMotionOverride: DEFAULT_SETTINGS.reduceMotionOverride,
    defaultQualityMode: DEFAULT_SETTINGS.defaultQualityMode,
    defaultPrompt: DEFAULT_SETTINGS.defaultPrompt,
    filenameTemplate: DEFAULT_SETTINGS.filenameTemplate,
    defaultDownloadSubtitles: DEFAULT_SETTINGS.defaultDownloadSubtitles,
    rememberAuthorityBasis: DEFAULT_SETTINGS.rememberAuthorityBasis,
  };
  await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: defaults });
  $('#settings-status').textContent = 'Appearance and download preferences reset.';
  await load();
});
$('#clear-diagnostics').addEventListener('click', async () => {
  if (!confirm('Clear local diagnostics?')) return;
  const result = await chrome.runtime.sendMessage({ type: 'CLEAR_DIAGNOSTICS' });
  if (result.ok) renderDiagnostics([]);
});
$('#grant-host').addEventListener('click', async () => {
  const origin = $('#host-origin').value.trim();
  try {
    const url = new URL(origin.replace(/\/\*$/, ''));
    const pattern = `${url.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [pattern] });
    $('#settings-status').textContent = granted
      ? `Access granted for ${url.origin}.`
      : 'Permission was not granted.';
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    await renderPermissions(response.state.hostPreferences);
  } catch {
    $('#settings-status').textContent = 'Enter an origin such as https://example.com/*.';
  }
});
$('#grant-broad-host').addEventListener('click', async () => {
  if (
    !confirm(
      'This grants Video Pro Finder access to all HTTP and HTTPS sites. One-tab scans usually do not need it. Continue?',
    )
  )
    return;
  const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
  if (granted) {
    const scan = await chrome.runtime.sendMessage({ type: 'AUTO_SCAN_ACTIVE_TAB' });
    $('#settings-status').textContent = scan.ok
      ? 'Automatic detection enabled for HTTP(S) sites. The active page is being scanned.'
      : `Automatic detection enabled. ${scan.error}`;
  } else {
    $('#settings-status').textContent = 'Permission was not granted.';
  }
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  await renderPermissions(response.state.hostPreferences);
});
$('#clear-host-preferences').addEventListener('click', async () => {
  if (!confirm('Clear all remembered quality choices?')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_HOST_PREFERENCES' });
  $('#settings-status').textContent = 'Host preferences cleared.';
  await load();
});
$('#clear-data').addEventListener('click', async () => {
  if (!confirm('Clear saved sources, history, queue, diagnostics, and preferences?')) return;
  await chrome.storage.local.clear();
  $('#settings-status').textContent = 'Local extension data cleared.';
  await load();
});
$('#export-settings').addEventListener('click', async () => {
  if (!confirm('Export local Video Pro Finder settings?')) return;
  const state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  downloadJson('video-pro-finder-settings.json', state.settings);
});
$('#import-settings').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 256 * 1024) {
    $('#settings-status').textContent = 'Settings file is larger than 256 KiB.';
    event.target.value = '';
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const imported = validateSettingsUpdate(parsed.settings || parsed);
    if (
      !confirm(
        'Import these validated settings? Existing preferences will be replaced only for recognized fields.',
      )
    )
      return;
    const result = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: imported,
    });
    if (!result.ok) throw new Error(result.error);
    $('#settings-status').textContent = 'Settings imported.';
    await load();
  } catch (error) {
    $('#settings-status').textContent = `Settings were not imported: ${error.message}`;
  } finally {
    event.target.value = '';
  }
});
$('#export-audit').addEventListener('click', async () => {
  if (!confirm('Export local authority audit records? Treat the file as sensitive.')) return;
  const state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  const records = state.history.filter((record) => record.authorizationBasis);
  downloadJson('video-pro-finder-authority-audit.json', records);
});
$('#clear-audit').addEventListener('click', async () => {
  if (
    !confirm(
      'Remove authority-basis fields from local download history? Download history itself will remain.',
    )
  )
    return;
  const result = await chrome.runtime.sendMessage({ type: 'CLEAR_AUTHORITY_HISTORY' });
  if (result.ok) {
    $('#settings-status').textContent = 'Authority-basis history cleared.';
    await load();
  }
});
void load();
