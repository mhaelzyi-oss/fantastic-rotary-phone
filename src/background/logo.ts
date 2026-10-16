import { loadPrefs } from "./storage";

let lastBadge = "";
let lastFound: boolean | undefined;

export async function setLogoState(count: number): Promise<void> {
  const prefs = await loadPrefs();
  const found = count > 0;
  const badge = !prefs.showBadge || !found ? "" : count > 99 ? "99+" : String(count);
  if (lastBadge !== badge) {
    lastBadge = badge;
    chrome.action.setBadgeBackgroundColor({ color: "#c9a227" });
    chrome.action.setBadgeText({ text: badge });
  }
  chrome.action.setTitle({
    title: found ? `KUI Video Extractor — ${count} file${count === 1 ? "" : "s"}` : "KUI Video Extractor",
  });
  const gold = prefs.goldIcon && found;
  if (lastFound === gold) return;
  lastFound = gold;
  chrome.action.setIcon({
    path: gold
      ? { 16: "icons/logo-found-16.png", 32: "icons/logo-found-32.png", 48: "icons/logo-found-48.png" }
      : { 16: "icons/logo-idle-16.png", 32: "icons/logo-idle-32.png", 48: "icons/logo-idle-48.png" },
  });
}
