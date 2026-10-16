// @vitest-environment node
import { describe, expect, it } from "vitest";
import { downloadHls, HlsError, withExtension } from "./hlsDownload";

type Entry = string | Uint8Array | number;

function fakeFetch(files: Record<string, Entry>, log: { url: string; range?: string }[] = [], delays = false): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const range = (init?.headers as Record<string, string> | undefined)?.Range;
    log.push({ url, range });
    if (delays) await new Promise((r) => setTimeout(r, Math.random() * 15));
    const entry = files[url];
    if (typeof entry === "number") return new Response("no", { status: entry });
    if (entry === undefined) return new Response("missing", { status: 404 });
    return new Response(entry as BodyInit, { status: 200 });
  }) as typeof fetch;
}

const noSleep = () => Promise.resolve();
const B = "https://cdn.example.com/v/";
const media = (body: string) => `#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n${body}#EXT-X-ENDLIST\n`;
const read = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe("downloadHls", () => {
  it("joins segments in playlist order even when they arrive out of order", async () => {
    const files: Record<string, Entry> = {
      [`${B}index.m3u8`]: media("#EXTINF:4,\ns0.ts\n#EXTINF:4,\ns1.ts\n#EXTINF:4,\ns2.ts\n#EXTINF:4,\ns3.ts\n#EXTINF:4,\ns4.ts\n"),
      [`${B}s0.ts`]: new Uint8Array([0, 0]),
      [`${B}s1.ts`]: new Uint8Array([1, 1]),
      [`${B}s2.ts`]: new Uint8Array([2, 2]),
      [`${B}s3.ts`]: new Uint8Array([3, 3]),
      [`${B}s4.ts`]: new Uint8Array([4, 4]),
    };
    const progress: number[] = [];
    const r = await downloadHls(`${B}index.m3u8`, {
      fetchFn: fakeFetch(files, [], true),
      sleep: noSleep,
      onProgress: (p) => progress.push(p.done),
    });
    expect(r.ext).toBe("ts");
    expect(r.segments).toBe(5);
    expect([...(await read(r.blob))]).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(progress.at(-1)).toBe(5);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("puts the fMP4 init segment first and keeps mp4", async () => {
    const files: Record<string, Entry> = {
      [`${B}index.m3u8`]: media('#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\na.m4s\n#EXTINF:4,\nb.m4s\n'),
      [`${B}init.mp4`]: new Uint8Array([9]),
      [`${B}a.m4s`]: new Uint8Array([1]),
      [`${B}b.m4s`]: new Uint8Array([2]),
    };
    const r = await downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files), sleep: noSleep });
    expect(r.ext).toBe("mp4");
    expect([...(await read(r.blob))]).toEqual([9, 1, 2]);
  });

  it("sends a Range header for byte-range segments", async () => {
    const log: { url: string; range?: string }[] = [];
    const files: Record<string, Entry> = {
      [`${B}index.m3u8`]: media("#EXTINF:4,\n#EXT-X-BYTERANGE:3@0\nall.mp4\n#EXTINF:4,\n#EXT-X-BYTERANGE:3\nall.mp4\n"),
      [`${B}all.mp4`]: new Uint8Array([1, 2, 3]),
    };
    await downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep, concurrency: 1 });
    expect(log.filter((l) => l.range).map((l) => l.range)).toEqual(["bytes=0-2", "bytes=3-5"]);
  });

  it("chooses the best clear quality from a master playlist, honouring the cap", async () => {
    const master =
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360\n360/i.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n720/i.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n1080/i.m3u8\n";
    const log: { url: string }[] = [];
    const files: Record<string, Entry> = {
      [`${B}master.m3u8`]: master,
      [`${B}720/i.m3u8`]: media("#EXTINF:4,\ns.ts\n"),
      [`${B}1080/i.m3u8`]: media("#EXTINF:4,\ns.ts\n"),
      [`${B}720/s.ts`]: new Uint8Array([7]),
      [`${B}1080/s.ts`]: new Uint8Array([8]),
    };
    const capped = await downloadHls(`${B}master.m3u8`, {
      fetchFn: fakeFetch(files, log),
      sleep: noSleep,
      quality: { preferred: "auto", maxHeight: "720", mode: "balanced" },
    });
    expect([...(await read(capped.blob))]).toEqual([7]);
    const open = await downloadHls(`${B}master.m3u8`, { fetchFn: fakeFetch(files), sleep: noSleep });
    expect([...(await read(open.blob))]).toEqual([8]);
  });

  it("refuses encrypted streams before fetching any segment", async () => {
    for (const key of ['#EXT-X-KEY:METHOD=AES-128,URI="k.bin"\n', '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"\n']) {
      const log: { url: string }[] = [];
      const files: Record<string, Entry> = {
        [`${B}index.m3u8`]: media(`${key}#EXTINF:4,\ns0.ts\n`),
        [`${B}s0.ts`]: new Uint8Array([1]),
        [`${B}k.bin`]: new Uint8Array([1]),
      };
      await expect(downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep })).rejects.toMatchObject({ code: "ENCRYPTED" });
      expect(log.map((l) => l.url)).toEqual([`${B}index.m3u8`]);
    }
  });

  it("refuses a protected master playlist without choosing a variant", async () => {
    const files: Record<string, Entry> = {
      [`${B}master.m3u8`]: '#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="skd://x"\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nv.m3u8\n',
    };
    const log: { url: string }[] = [];
    await expect(downloadHls(`${B}master.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep })).rejects.toMatchObject({ code: "ENCRYPTED" });
    expect(log).toHaveLength(1);
  });

  it("refuses live streams and empty playlists", async () => {
    const live: Record<string, Entry> = { [`${B}l.m3u8`]: "#EXTM3U\n#EXTINF:4,\ns.ts\n" };
    await expect(downloadHls(`${B}l.m3u8`, { fetchFn: fakeFetch(live), sleep: noSleep })).rejects.toMatchObject({ code: "LIVE" });
    const empty: Record<string, Entry> = { [`${B}e.m3u8`]: media("") };
    await expect(downloadHls(`${B}e.m3u8`, { fetchFn: fakeFetch(empty), sleep: noSleep })).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("retries a flaky segment, then gives up with a network error", async () => {
    let calls = 0;
    const flaky = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("index.m3u8")) return new Response(media("#EXTINF:4,\ns.ts\n"));
      calls += 1;
      if (calls < 3) throw new TypeError("network down");
      return new Response(new Uint8Array([5]));
    }) as typeof fetch;
    const ok = await downloadHls(`${B}index.m3u8`, { fetchFn: flaky, sleep: noSleep });
    expect([...(await read(ok.blob))]).toEqual([5]);
    expect(calls).toBe(3);

    const dead = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("index.m3u8")) return new Response(media("#EXTINF:4,\ns.ts\n"));
      throw new TypeError("network down");
    }) as typeof fetch;
    await expect(downloadHls(`${B}index.m3u8`, { fetchFn: dead, sleep: noSleep })).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("does not retry a refused segment", async () => {
    const log: { url: string }[] = [];
    const files: Record<string, Entry> = { [`${B}index.m3u8`]: media("#EXTINF:4,\ns.ts\n"), [`${B}s.ts`]: 403 };
    await expect(downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(log.filter((l) => l.url.endsWith("s.ts"))).toHaveLength(1);
  });

  it("stops when the size limit is passed", async () => {
    const files: Record<string, Entry> = {
      [`${B}index.m3u8`]: media("#EXTINF:4,\na.ts\n#EXTINF:4,\nb.ts\n"),
      [`${B}a.ts`]: new Uint8Array(10),
      [`${B}b.ts`]: new Uint8Array(10),
    };
    await expect(downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files), sleep: noSleep, maxBytes: 15, concurrency: 1 })).rejects.toBeInstanceOf(HlsError);
  });

  it("reports a refused playlist as forbidden", async () => {
    await expect(downloadHls(`${B}x.m3u8`, { fetchFn: fakeFetch({ [`${B}x.m3u8`]: 401 }), sleep: noSleep })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("withExtension", () => {
  it("swaps or adds the extension", () => {
    expect(withExtension("Clip_20260101_720p.mp4", "ts")).toBe("Clip_20260101_720p.ts");
    expect(withExtension("Clip", "mp4")).toBe("Clip.mp4");
  });
});

describe("hostile playlists", () => {
  it("never fetches anything that is not an http(s) address", async () => {
    for (const bad of ["blob:https://x.example/1", "data:video/mp2t;base64,AAAA", "file:///C:/secret.ts", "javascript:alert(1)", "ftp://x.example/a.ts"]) {
      const log: { url: string }[] = [];
      const files: Record<string, Entry> = { [`${B}index.m3u8`]: media(`#EXTINF:4,\n${bad}\n`) };
      await expect(downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep })).rejects.toBeInstanceOf(HlsError);
      expect(log.map((l) => l.url)).toEqual([`${B}index.m3u8`]);
    }
  });

  it("refuses a playlist address that is not http(s)", async () => {
    const log: { url: string }[] = [];
    await expect(downloadHls("file:///C:/a.m3u8", { fetchFn: fakeFetch({}, log), sleep: noSleep })).rejects.toBeInstanceOf(HlsError);
    expect(log).toHaveLength(0);
  });

  it("refuses a playlist with an absurd number of segments before fetching any", async () => {
    const body = Array.from({ length: 60_001 }, (_, i) => `#EXTINF:1,\ns${i}.ts\n`).join("");
    const log: { url: string }[] = [];
    const files: Record<string, Entry> = { [`${B}index.m3u8`]: media(body) };
    await expect(downloadHls(`${B}index.m3u8`, { fetchFn: fakeFetch(files, log), sleep: noSleep })).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(log).toHaveLength(1);
  });
});