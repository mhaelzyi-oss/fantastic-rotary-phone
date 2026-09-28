import { scanDocument } from './utils/sourceScanner.js';

if (!globalThis.__videoProFinderLoaded) {
  globalThis.__videoProFinderLoaded = true;
  const report = () => {
    const sources = scanDocument(document);
    chrome.runtime
      .sendMessage({
        type: 'SOURCES_FOUND',
        sources,
        pageTitle: document.title,
        pageUrl: location.href,
      })
      .catch(() => {});
  };
  let debounce;
  report();
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length || record.type === 'attributes')) return;
    clearTimeout(debounce);
    debounce = setTimeout(report, 500);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'href', 'data-src'],
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SCAN_NOW') {
      report();
      sendResponse({ ok: true });
    }
  });
}
