export function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

export function listen(type, handler) {
  const listener = (message, sender, sendResponse) => {
    if (message?.type !== type) return false;
    Promise.resolve(handler(message, sender))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
