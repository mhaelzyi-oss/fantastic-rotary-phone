import { defaultState, migrateState, validateState } from './schema.js';

const memory = new Map();
const storage = globalThis.chrome?.storage?.local;

export async function getValue(key, fallback = null) {
  if (!storage) return memory.has(key) ? memory.get(key) : fallback;
  const result = await storage.get(key);
  return result[key] ?? fallback;
}

export async function setValue(key, value) {
  if (!storage) {
    memory.set(key, value);
    return;
  }
  await storage.set({ [key]: value });
}

export async function getState() {
  const raw = await getValue('state', null);
  if (validateState(raw)) return raw;
  const state = migrateState(raw) || defaultState();
  if (raw)
    await setValue('corruptBackup', {
      capturedAt: Date.now(),
      summary: 'Invalid stored state preserved before recovery.',
      schemaVersion: raw.schemaVersion ?? null,
    });
  await setValue('state', state);
  return state;
}

export async function updateState(mutator) {
  const state = await getState();
  const next = (await mutator(state)) || state;
  await setValue('state', next);
  return next;
}
