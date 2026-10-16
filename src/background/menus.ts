import { formatFilename } from "../shared/filename";
import { addToLibrary, toLibraryItem } from "../shared/library";
import { safeFilename } from "../shared/trust";
import { classifyUrl, hostLooksDrm, isSegmentUrl, looksLikeVideo, originHost } from "../shared/url";
import { enqueue } from "./queue";
import { loadPrefs, recordDiagnostic, updateLibrary } from "./storage";

const DOWNLOAD = "vpf-download";
const SAVE = "vpf-save";

export function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: DOWNLOAD, title: "Download with KUI Video Extractor", contexts: ["video", "audio", "link"] });
    chrome.contextMenus.create({ id: SAVE, title: "Save to KUI Video Extractor library", contexts: ["video", "audio", "link"] });
  });
}

function notify(message: string): void {
  chrome.notifications
    .create({ type: "basic", iconUrl: "icons/logo-found-48.png", title: "KUI Video Extractor", message })
    .catch(() => undefined);
}

export async function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const url = info.srcUrl || info.linkUrl || "";
  const pageUrl = info.pageUrl || tab?.url || "";
  if (!/^https?:/i.test(url) || !looksLikeVideo(url) || isSegmentUrl(url)) {
    notify("That link does not look like a video file or stream.");
    return;
  }
  if (hostLooksDrm(pageUrl) || hostLooksDrm(url)) {
    notify("This site is a DRM streaming service. KUI Video Extractor never unlocks DRM.");
    return;
  }
  const kind = classifyUrl(url) ?? "progressive";
  const title = tab?.title || "video";

  if (info.menuItemId === SAVE) {
    await updateLibrary((list) =>
      addToLibrary(list, toLibraryItem({ url, kind, originHost: originHost(url), title, pageUrl, source: "link", encrypted: false, variants: [], subtitles: [] })),
    );
    notify("Saved to the library.");
    return;
  }

  if (info.menuItemId === DOWNLOAD) {
    const prefs = await loadPrefs();
    if (prefs.requireAuthority) {
      notify("You asked to confirm your rights first. Use the toolbar popup to download.");
      return;
    }
    if (kind !== "progressive") {
      notify("Open the toolbar popup to pick a quality for this stream.");
      return;
    }
    const filename = safeFilename(formatFilename({ title, quality: "source", prompt: prefs.prompt, host: originHost(url) }));
    await enqueue({ url, filename, title, quality: "source" });
    await recordDiagnostic({ code: "MENU_DOWNLOAD", message: "Started from the page menu.", host: originHost(url) });
  }
}
