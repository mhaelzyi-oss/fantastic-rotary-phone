import { describe, expect, it } from "vitest";
import { checkDownloadRequest, safeFilename, type TrustContext } from "./trust";
import type { MediaItem } from "./types";

const source = (patch: Partial<MediaItem> = {}): MediaItem => ({
  url: "https://cdn.example.com/a.mp4",
  kind: "progressive",
  originHost: "cdn.example.com",
  title: "a",
  pageUrl: "https://example.com/watch",
  source: "dom",
  encrypted: false,
  variants: [{ url: "https://cdn.example.com/a.mp4", label: "720p", height: 720, encrypted: false, kind: "progressive" }],
  subtitles: [{ url: "https://cdn.example.com/a.vtt", label: "English" }],
  ...patch,
});

const ctx = (patch: Partial<TrustContext> = {}): TrustContext => ({
  sources: [source()],
  knownUrls: new Set(),
  requireAuthority: false,
  ...patch,
});

describe("safeFilename", () => {
  it("keeps names inside Downloads", () => {
    expect(safeFilename("../../etc/passwd")).toBe("etc/passwd");
    expect(safeFilename("C:\\Windows\\evil.mp4")).toBe("Windows/evil.mp4");
    expect(safeFilename("/abs/path/a.mp4")).toBe("abs/path/a.mp4");
    expect(safeFilename("Sub/a<b>.mp4")).toBe("Sub/ab.mp4");
    expect(safeFilename("")).toBe("video.mp4");
    expect(safeFilename("..")).toBe("video.mp4");
    expect(safeFilename("a".repeat(500)).length).toBe(180);
  });
});

describe("checkDownloadRequest", () => {
  const req = { url: "https://cdn.example.com/a.mp4", filename: "a.mp4" };

  it("accepts a detected file", () => {
    expect(checkDownloadRequest(req, ctx())).toMatchObject({ ok: true, filename: "a.mp4" });
  });

  it("rejects non-http schemes", () => {
    for (const url of ["file:///C:/a.mp4", "javascript:alert(1)", "data:video/mp4;base64,AAAA", "chrome://settings", "nope"]) {
      expect(checkDownloadRequest({ ...req, url }, ctx())).toMatchObject({ ok: false, code: "INVALID_URL" });
    }
  });

  it("rejects a URL that was never detected, unless it was accepted before", () => {
    const other = { ...req, url: "https://evil.example/x.mp4" };
    expect(checkDownloadRequest(other, ctx())).toMatchObject({ ok: false, code: "NOT_DETECTED" });
    expect(checkDownloadRequest(other, ctx({ knownUrls: new Set([other.url]) }))).toMatchObject({ ok: true });
  });

  it("refuses encrypted sources, encrypted variants and DRM service pages", () => {
    expect(checkDownloadRequest(req, ctx({ sources: [source({ encrypted: true })] }))).toMatchObject({ ok: false, code: "DRM" });
    const lockedVariant = source({
      variants: [{ url: req.url, label: "1080p", encrypted: true, kind: "progressive" }],
    });
    expect(checkDownloadRequest(req, ctx({ sources: [lockedVariant] }))).toMatchObject({ ok: false, code: "DRM" });
    expect(
      checkDownloadRequest(req, ctx({ sources: [source({ pageUrl: "https://www.netflix.com/watch/1" })] })),
    ).toMatchObject({ ok: false, code: "DRM" });
  });

  it("only passes subtitles that the source lists", () => {
    const r = checkDownloadRequest(
      { ...req, subtitleUrls: ["https://cdn.example.com/a.vtt", "https://evil.example/steal.vtt", "javascript:1"] },
      ctx(),
    );
    expect(r).toMatchObject({ ok: true, subtitleUrls: ["https://cdn.example.com/a.vtt"] });
  });

  it("forces the file name back inside Downloads", () => {
    expect(checkDownloadRequest({ ...req, filename: "../../x.mp4" }, ctx())).toMatchObject({ ok: true, filename: "x.mp4" });
  });

  it("asks for a rights declaration only when the option is on", () => {
    const on = ctx({ requireAuthority: true });
    expect(checkDownloadRequest(req, on)).toMatchObject({ ok: false, code: "AUTHORITY_REQUIRED" });
    expect(checkDownloadRequest({ ...req, authority: { basis: "owner", confirmed: false } }, on)).toMatchObject({ ok: false });
    expect(checkDownloadRequest({ ...req, authority: { basis: "whatever", confirmed: true } }, on)).toMatchObject({ ok: false });
    const ok = checkDownloadRequest({ ...req, authority: { basis: "owner", confirmed: true } }, on, 123);
    expect(ok).toMatchObject({ ok: true, authority: { basis: "owner", attestedAt: 123 } });
  });
});
