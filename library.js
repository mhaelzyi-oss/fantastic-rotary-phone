const $ = (selector) => document.querySelector(selector);
let state;
import { applyPreferences } from './utils/preferences.js';
async function load() {
  state = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state;
  applyPreferences(state.settings);
  render();
}
function render() {
  const query = $('#search').value.toLowerCase();
  const filter = $('#filter').value;
  const items = state.library
    .filter((item) => `${item.title} ${item.originHost}`.toLowerCase().includes(query))
    .filter(
      (item) =>
        filter === 'all' ||
        (filter === 'eligible' && item.eligibilityStatus === 'NONE') ||
        (filter === 'protected' && item.protectionStatus !== 'none') ||
        (filter === 'blocked' && item.eligibilityStatus !== 'NONE'),
    )
    .sort((a, b) => {
      if ($('#sort').value === 'oldest') return a.createdAt - b.createdAt;
      if ($('#sort').value === 'title') return a.title.localeCompare(b.title);
      if ($('#sort').value === 'last-opened') return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
      if ($('#sort').value === 'host') return a.originHost.localeCompare(b.originHost);
      return b.createdAt - a.createdAt;
    });
  const root = $('#library-list');
  root.replaceChildren();
  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'library-item';
    const text = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = item.title;
    const meta = document.createElement('p');
    meta.textContent = `${item.originHost} · ${item.streamType} · ${item.eligibilityStatus}`;
    const tags = document.createElement('input');
    tags.className = 'library-edit';
    tags.setAttribute('aria-label', `Tags for ${item.title}`);
    tags.placeholder = 'Tags, comma separated';
    tags.value = (item.tags || []).join(', ');
    tags.addEventListener('change', () =>
      updateItem(item.id, {
        tags: tags.value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    );
    const notes = document.createElement('textarea');
    notes.className = 'library-edit';
    notes.setAttribute('aria-label', `Notes for ${item.title}`);
    notes.placeholder = 'Local note';
    notes.value = item.notes || '';
    notes.addEventListener('change', () =>
      updateItem(item.id, { notes: notes.value.slice(0, 1000) }),
    );
    text.append(title, meta, tags, notes);
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.className = 'library-select';
    select.dataset.itemId = item.id;
    select.setAttribute('aria-label', `Select ${item.title}`);
    const open = document.createElement('a');
    open.href = item.sourceUrl;
    open.target = '_blank';
    open.rel = 'noopener';
    open.className = 'button quiet';
    open.textContent = 'Open source';
    open.addEventListener('click', () => updateItem(item.id, { lastOpenedAt: Date.now() }));
    const remove = document.createElement('button');
    remove.className = 'button danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove "${item.title}" from your local library?`)) return;
      await chrome.runtime.sendMessage({ type: 'REMOVE_LIBRARY_ITEMS', itemIds: [item.id] });
      await load();
    });
    row.append(select, text, open, remove);
    root.append(row);
  }
  if (!items.length) root.textContent = 'No saved sources match this view.';
  const history = $('#history-list');
  history.replaceChildren();
  for (const record of state.history) {
    const item = document.createElement('p');
    item.textContent = `${record.filename} · ${record.originHost} · ${new Date(record.completedAt).toLocaleString()}`;
    history.append(item);
  }
  if (!state.history.length) history.textContent = 'Completed downloads will appear here.';
}

async function updateItem(id, patch) {
  const result = await chrome.runtime.sendMessage({
    type: 'UPDATE_LIBRARY_ITEM',
    itemId: id,
    patch,
  });
  if (!result.ok) return;
  await load();
}

$('#search').addEventListener('input', render);
$('#filter').addEventListener('change', render);
$('#sort').addEventListener('change', render);
$('#remove-selected').addEventListener('click', async () => {
  const selectedIds = [...document.querySelectorAll('.library-select:checked')].map(
    (input) => input.dataset.itemId,
  );
  if (!selectedIds.length) return;
  if (
    !confirm(
      `Remove ${selectedIds.length} selected source${selectedIds.length === 1 ? '' : 's'} from your local library?`,
    )
  )
    return;
  await chrome.runtime.sendMessage({ type: 'REMOVE_LIBRARY_ITEMS', itemIds: selectedIds });
  await load();
});
$('#export').addEventListener('click', () => {
  if (!confirm('Export source URLs and local metadata? Treat the file as sensitive.')) return;
  const blob = new Blob(
    [JSON.stringify({ library: state.library, history: state.history }, null, 2)],
    { type: 'application/json' },
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'video-pro-finder-library.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
void load();
