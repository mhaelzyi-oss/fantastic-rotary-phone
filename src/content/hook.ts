/**
 * Runs inside the page (world MAIN) at document_start. It only reads the response type of requests the
 * page makes itself, so media served from URLs with no file extension can still be found. It never
 * changes a request or a response, reads no bodies or cookies, and reads only content-type,
 * content-length and content-disposition. It sends nothing anywhere except to this page's own
 * content script through window.postMessage.
 *
 * No imports on purpose: a page-world script cannot load extension chunks.
 */
(() => {
  const w = window as unknown as { __VPF_HOOK__?: boolean };
  if (w.__VPF_HOOK__) return;
  w.__VPF_HOOK__ = true;

  const MEDIA = /^(video\/|audio\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i;

  // Players often start fetching long before the content script is ready (it runs after the page has loaded).
  // Keep what was seen and hand it over when the content script asks.
  const seen: { url: string; mime: string; bytes?: number; disposition?: string }[] = [];
  const MAX_SEEN = 200;

  function post(url: string, mime: string, bytes?: number, disposition?: string): void {
    try {
      window.postMessage({ source: "vpf-hook", url, mime, bytes, disposition }, window.location.origin);
    } catch {
      /* ignore */
    }
  }

  function report(url: string, mime: string, bytes?: number, disposition?: string): void {
    const prev = seen.find((s) => s.url === url);
    if (!prev) {
      if (seen.length >= MAX_SEEN) seen.shift();
      seen.push({ url, mime, bytes, disposition });
    } else {
      if (bytes && !prev.bytes) prev.bytes = bytes;
      if (disposition && !prev.disposition) prev.disposition = disposition;
    }
    post(url, mime, bytes, disposition);
  }

  function fileBits(get: (name: string) => string | null): { bytes?: number; disposition?: string } {
    const len = Number(get("content-length"));
    const bytes = Number.isFinite(len) && len > 0 ? len : undefined;
    const raw = get("content-disposition");
    const disposition = raw ? raw.slice(0, 300) : undefined;
    return { bytes, disposition };
  }

  window.addEventListener("message", (event) => {
    const data = event.data as { source?: unknown; type?: unknown } | null;
    if (event.source !== window || !data || data.source !== "vpf-content" || data.type !== "replay") return;
    for (const s of seen) post(s.url, s.mime, s.bytes, s.disposition);
  });

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
      const result = nativeFetch.apply(this, args);
      result.then(
        (res) => {
          try {
            const mime = res.headers.get("content-type");
            if (mime && MEDIA.test(mime) && res.url) {
              const bits = fileBits((name) => res.headers.get(name));
              report(res.url, mime, bits.bytes, bits.disposition);
            }
          } catch {
            /* opaque response */
          }
        },
        () => undefined,
      );
      return result;
    };
  }

  const proto = window.XMLHttpRequest?.prototype;
  if (proto) {
    const nativeOpen = proto.open;
    proto.open = function patchedOpen(this: XMLHttpRequest, ...args: unknown[]) {
      this.addEventListener("readystatechange", () => {
        if (this.readyState !== 2) return;
        try {
          const mime = this.getResponseHeader("content-type");
          if (mime && MEDIA.test(mime) && this.responseURL) {
            const bits = fileBits((name) => this.getResponseHeader(name));
            report(this.responseURL, mime, bits.bytes, bits.disposition);
          }
        } catch {
          /* cross-origin without CORS headers */
        }
      });
      return (nativeOpen as (...a: unknown[]) => void).apply(this, args);
    } as typeof proto.open;
  }
})();

export {};
