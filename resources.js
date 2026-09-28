import { applyPreferences } from './utils/preferences.js';

async function loadPreferences() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  applyPreferences(response.state.settings);
}

void loadPreferences();
