const enums = {
  theme: ['dark', 'light', 'system'],
  liquidGlassIntensity: ['low', 'standard', 'high'],
  reduceMotionOverride: ['system', 'reduce', 'full'],
  defaultQualityMode: ['best_balance', 'best_quality', 'fastest', 'smallest'],
  hostPermissionMode: ['ask', 'manual'],
};

export function validateSettingsUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Settings import must be a JSON object.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      key === 'theme' ||
      key === 'liquidGlassIntensity' ||
      key === 'reduceMotionOverride' ||
      key === 'defaultQualityMode' ||
      key === 'hostPermissionMode'
    ) {
      if (!enums[key].includes(value)) throw new Error(`Invalid ${key} setting.`);
      result[key] = value;
    } else if (
      ['telemetryOptIn', 'defaultDownloadSubtitles', 'rememberAuthorityBasis'].includes(key)
    ) {
      if (typeof value !== 'boolean') throw new Error(`Invalid ${key} setting.`);
      result[key] = value;
    } else if (['defaultPrompt', 'filenameTemplate'].includes(key)) {
      if (typeof value !== 'string' || value.length > (key === 'defaultPrompt' ? 2000 : 220))
        throw new Error(`Invalid ${key} setting.`);
      result[key] = value;
    } else if (['maxHistoryItems', 'maxLibraryItems', 'maxErrorSnapshots'].includes(key)) {
      const maximum = key === 'maxHistoryItems' ? 500 : key === 'maxLibraryItems' ? 2000 : 100;
      if (!Number.isInteger(value) || value < 1 || value > maximum)
        throw new Error(`Invalid ${key} setting.`);
      result[key] = value;
    }
  }
  return result;
}
