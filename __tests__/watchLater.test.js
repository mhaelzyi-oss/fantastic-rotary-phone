import {
  addWatchLater,
  removeWatchLater,
  searchWatchLater,
  updateWatchLater,
} from '../utils/watchLater.js';

test('adds without duplicates, searches, updates, and removes saved sources', () => {
  const source = { src: 'https://m.test/a.mp4', label: 'Sample', originHost: 'm.test' };
  const items = addWatchLater([], source);
  expect(addWatchLater(items, source)).toHaveLength(1);
  expect(searchWatchLater(items, 'sample')).toHaveLength(1);
  expect(updateWatchLater(items, items[0].id, { notes: 'check rights' })[0].notes).toBe(
    'check rights',
  );
  expect(removeWatchLater(items, items[0].id)).toHaveLength(0);
});
