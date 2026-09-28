export function addWatchLater(items, source) {
  if (items.some((item) => item.sourceUrl === source.src)) return items;
  return [
    {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: source.label,
      sourceUrl: source.src,
      originHost: source.originHost,
      tags: [],
      notes: '',
    },
    ...items,
  ];
}

export function searchWatchLater(items, query = '') {
  const value = query.toLowerCase().trim();
  return items.filter((item) =>
    `${item.title} ${item.originHost} ${item.tags.join(' ')} ${item.notes}`
      .toLowerCase()
      .includes(value),
  );
}

export function removeWatchLater(items, id) {
  return items.filter((item) => item.id !== id);
}

export function updateWatchLater(items, id, patch) {
  return items.map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item,
  );
}
