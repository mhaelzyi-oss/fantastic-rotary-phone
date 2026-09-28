import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './constants.js';

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    queue: [],
    history: [],
    library: [],
    presets: [],
    hostPreferences: {},
    diagnostics: [],
    errorSnapshots: [],
  };
}

export function validateState(value) {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  return (
    isRecord(value.settings) &&
    ['queue', 'history', 'library', 'presets', 'diagnostics', 'errorSnapshots'].every((key) =>
      Array.isArray(value[key]),
    ) &&
    isRecord(value.hostPreferences)
  );
}

export function migrateState(value) {
  if (!isRecord(value)) return defaultState();
  if (value.schemaVersion === SCHEMA_VERSION && validateState(value)) return value;
  if (!value.schemaVersion || value.schemaVersion < SCHEMA_VERSION) {
    return {
      ...defaultState(),
      ...(isRecord(value.settings) ? { settings: { ...DEFAULT_SETTINGS, ...value.settings } } : {}),
      queue: Array.isArray(value.queue) ? value.queue : [],
      history: Array.isArray(value.history) ? value.history : [],
      library: Array.isArray(value.library) ? value.library : [],
    };
  }
  return defaultState();
}
