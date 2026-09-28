import { validateSettingsUpdate } from '../utils/settingsValidation.js';

test('accepts only bounded, known settings values and ignores unknown data', () => {
  expect(
    validateSettingsUpdate({ theme: 'light', defaultPrompt: 'local', arbitrary: true }),
  ).toEqual({
    theme: 'light',
    defaultPrompt: 'local',
  });
  expect(() => validateSettingsUpdate({ theme: 'remote' })).toThrow();
  expect(() => validateSettingsUpdate({ rememberAuthorityBasis: 'yes' })).toThrow();
  expect(() => validateSettingsUpdate({ filenameTemplate: 'x'.repeat(221) })).toThrow();
  expect(() => validateSettingsUpdate({ maxHistoryItems: 0 })).toThrow();
  expect(validateSettingsUpdate({ defaultDownloadSubtitles: true })).toEqual({
    defaultDownloadSubtitles: true,
  });
});
