(() => {
  // utils/constants.js
  var POLICY_VERSION = "1.0";
  var DEFAULT_PROMPT = 'Save highest-quality non-DRM stream as MP4; prefer 1080p>720p>480p; include subtitles if available; filename "{title}_{YYYYMMDD}_{quality}.mp4"; auto-save to Downloads; show gold progress bar and ETA.';
  var DEFAULT_SETTINGS = {
    theme: "dark",
    liquidGlassIntensity: "standard",
    reduceMotionOverride: "system",
    telemetryOptIn: false,
    defaultQualityMode: "best_balance",
    defaultPrompt: DEFAULT_PROMPT,
    filenameTemplate: "{title}_{YYYYMMDD}_{quality}.{ext}",
    defaultDownloadSubtitles: false,
    rememberAuthorityBasis: false,
    authorityPolicyVersion: POLICY_VERSION,
    maxHistoryItems: 100,
    maxLibraryItems: 500,
    maxErrorSnapshots: 30,
    hostPermissionMode: "ask",
    lastUpdatedAt: Date.now()
  };
  var VIDEO_EXTENSIONS = /* @__PURE__ */ new Set(["mp4", "webm", "m4v", "mov"]);
  var AUDIO_EXTENSIONS = /* @__PURE__ */ new Set(["mp3", "m4a", "ogg", "wav"]);
  var MANIFEST_EXTENSIONS = /* @__PURE__ */ new Set(["m3u8", "mpd"]);
  var TORRENT_EXTENSIONS = /* @__PURE__ */ new Set(["torrent"]);
  var SUBTITLE_EXTENSIONS = /* @__PURE__ */ new Set(["vtt", "srt", "ass", "ssa"]);
  var ELIGIBILITY_CODES = Object.freeze({
    NONE: "NONE",
    PROTECTED_MEDIA: "PROTECTED_MEDIA",
    TORRENT_UNSUPPORTED: "TORRENT_UNSUPPORTED",
    MISSING_URL: "MISSING_URL",
    UNSUPPORTED_TYPE: "UNSUPPORTED_TYPE",
    CORS_ORIGIN_LIMITATION: "CORS_ORIGIN_LIMITATION",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    LIVE_STREAM_UNSUPPORTED: "LIVE_STREAM_UNSUPPORTED",
    UNKNOWN: "UNKNOWN"
  });

  // utils/sourceNormalizer.js
  function resolveSourceUrl(raw, baseUrl) {
    if (!raw || typeof raw !== "string") return null;
    try {
      return new URL(raw.trim(), baseUrl || void 0).href;
    } catch {
      return null;
    }
  }
  function canonicalizeUrl(raw, baseUrl) {
    const resolved = resolveSourceUrl(raw, baseUrl);
    if (!resolved) return null;
    try {
      const url = new URL(resolved);
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }
  function extensionOf(url) {
    try {
      return new URL(url).pathname.split(".").pop().toLowerCase();
    } catch {
      return "";
    }
  }
  function decodedPathname(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    } catch {
      try {
        return new URL(url).pathname.split("/").pop() || "";
      } catch {
        return "";
      }
    }
  }
  function normalizeSource(input = {}, pageUrl = null) {
    const src = resolveSourceUrl(input.src ?? input.url, pageUrl);
    const canonicalUrl = canonicalizeUrl(src, pageUrl);
    const mime = (input.mime ?? input.type ?? "").split(";")[0].trim().toLowerCase() || null;
    const extension = extensionOf(src ?? "");
    let streamType = "unknown";
    if (TORRENT_EXTENSIONS.has(extension) || /^magnet:/i.test(input.src ?? ""))
      streamType = "torrent";
    else if (SUBTITLE_EXTENSIONS.has(extension) || /^text\/(?:vtt|srt)/.test(mime ?? ""))
      streamType = "subtitle";
    else if (MANIFEST_EXTENSIONS.has(extension) || /mpegurl|dash\+xml/.test(mime ?? ""))
      streamType = extension === "mpd" || mime?.includes("dash") ? "dash" : "hls";
    else if (AUDIO_EXTENSIONS.has(extension) || mime?.startsWith("audio/")) streamType = "audio";
    else if (VIDEO_EXTENSIONS.has(extension) || mime?.startsWith("video/")) streamType = "direct";
    const width = Number.isFinite(Number(input.width)) && Number(input.width) > 0 ? Number(input.width) : null;
    const height = Number.isFinite(Number(input.height)) && Number(input.height) > 0 ? Number(input.height) : null;
    let originHost = null;
    try {
      originHost = new URL(src).host;
    } catch {
    }
    const title = input.label || input.title || (src ? decodedPathname(src) : "Media source");
    return {
      id: input.id || canonicalUrl || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      src,
      canonicalUrl,
      label: title || "Media source",
      pageTitle: input.pageTitle || null,
      pageUrl: pageUrl || input.pageUrl || null,
      thumbnail: input.thumbnail || null,
      resolution: input.resolution || (height ? `${height}p` : null),
      width,
      height,
      bitrate: Number(input.bitrate) || null,
      durationSeconds: Number(input.durationSeconds) || null,
      fps: Number(input.fps) || null,
      mime,
      codecs: input.codecs || null,
      streamType,
      originHost,
      estimatedSize: Number(input.estimatedSize) || null,
      discoveredAt: input.discoveredAt || Date.now(),
      subtitles: Array.isArray(input.subtitles) ? input.subtitles : [],
      variants: Array.isArray(input.variants) ? input.variants : [],
      protection: input.protection || {
        isProtected: false,
        category: "none",
        signals: [],
        reason: null,
        detectedAt: Date.now()
      },
      eligibility: input.eligibility || {}
    };
  }

  // utils/protectionDetector.js
  function detectPageProtection(element) {
    const text = `${element?.getAttribute?.("type") ?? ""} ${element?.getAttribute?.("data-protection") ?? ""}`.toLowerCase();
    const protectedSignal = /drm|encrypted|widevine|playready|fairplay/.test(text);
    return {
      isProtected: protectedSignal,
      category: protectedSignal ? "eme_indicator" : "none",
      signals: protectedSignal ? ["Public page-level protection metadata"] : [],
      reason: protectedSignal ? "The page declares protected media." : null,
      detectedAt: Date.now()
    };
  }

  // utils/sourceScanner.js
  var mediaAttributeNames = ["src", "href", "data-src", "data-video-url", "data-stream-url"];
  var supportedPath = /\.(mp4|webm|m4v|mov|mp3|m4a|ogg|wav|m3u8|mpd|torrent|vtt)(?:$|[?#])/i;
  function scanDocument(doc = document, page = globalThis.location?.href || "") {
    const results = /* @__PURE__ */ new Map();
    const add = (record) => {
      const source = normalizeSource(record, page);
      if (!source.src) return;
      source.protection = record.protection || source.protection;
      source.eligibility = {};
      const key = source.canonicalUrl || source.src;
      const existing = results.get(key);
      if (!existing || existing.streamType === "unknown" && source.streamType !== "unknown")
        results.set(key, source);
    };
    for (const element of doc.querySelectorAll(
      "video, audio, source, track, a[href], [data-src], [data-video-url], [data-stream-url]"
    )) {
      const values = mediaAttributeNames.map((name) => element.getAttribute(name)).filter(Boolean);
      if (element.currentSrc) values.unshift(element.currentSrc);
      for (const raw of values) {
        if (!supportedPath.test(raw) && !/^magnet:/i.test(raw) && !element.matches("video, audio, source, track") && !element.getAttribute("type"))
          continue;
        const tag = element.tagName.toLowerCase();
        add({
          src: raw,
          mime: element.getAttribute("type"),
          label: element.getAttribute("title") || element.getAttribute("aria-label") || element.getAttribute("alt"),
          width: element.videoWidth || null,
          height: element.videoHeight || null,
          durationSeconds: Number.isFinite(element.duration) ? element.duration : null,
          thumbnail: element.poster || null,
          protection: detectPageProtection(element)
        });
        if (tag === "track" && element.src) {
          const source = normalizeSource(
            {
              src: element.src,
              streamType: "subtitle",
              label: element.label || element.srclang || "Subtitle"
            },
            page
          );
          for (const item of results.values())
            if (item.src === element.parentElement?.currentSrc)
              item.subtitles.push({
                src: source.src,
                label: source.label,
                language: element.srclang || null
              });
        }
      }
    }
    for (const property of ["og:video", "og:video:url", "og:video:secure_url", "og:audio"]) {
      const value = doc.querySelector(`meta[property="${property}"]`)?.content;
      if (value) add({ src: value, label: doc.querySelector('meta[property="og:title"]')?.content });
    }
    for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const json = JSON.parse(node.textContent || "");
        const records = Array.isArray(json) ? json : [json];
        for (const item of records) {
          const type = [].concat(item["@type"] || []);
          if (!type.some((name) => ["VideoObject", "AudioObject"].includes(name))) continue;
          const url = item.contentUrl || item.embedUrl;
          if (url)
            add({
              src: url,
              label: item.name,
              thumbnail: Array.isArray(item.thumbnailUrl) ? item.thumbnailUrl[0] : item.thumbnailUrl,
              durationSeconds: null
            });
        }
      } catch {
      }
    }
    return [...results.values()];
  }

  // content.js
  if (!globalThis.__videoProFinderLoaded) {
    globalThis.__videoProFinderLoaded = true;
    const report = () => {
      const sources = scanDocument(document);
      chrome.runtime.sendMessage({
        type: "SOURCES_FOUND",
        sources,
        pageTitle: document.title,
        pageUrl: location.href
      }).catch(() => {
      });
    };
    let debounce;
    report();
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.addedNodes.length || record.type === "attributes")) return;
      clearTimeout(debounce);
      debounce = setTimeout(report, 500);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", "data-src"]
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SCAN_NOW") {
        report();
        sendResponse({ ok: true });
      }
    });
  }
})();
