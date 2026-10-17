// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildBatchScript,
  buildCliCommand,
  buildUrlList,
  CLI_TOOLS,
  quoteArg,
  resolveShell,
  toolsFor,
  type CliInput,
  type CliShell,
} from "./cli";

const SHELLS: CliShell[] = ["bash", "powershell", "cmd"];

const base: Omit<CliInput, "tool" | "shell" | "kind"> = {
  url: "https://cdn.example.com/video/master.m3u8?token=abc&x=1",
  filename: "My_Clip_20261013_1080p.mp4",
  referer: "https://example.com/watch?v=1",
};

/** Minimal POSIX tokenizer for the grammar quoteArg emits: bare chars, 'single quotes', \' */
function posixTokens(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) throw new Error("unterminated quote");
      cur += line.slice(i + 1, end);
      has = true;
      i = end + 1;
    } else if (c === "\\") {
      cur += line[i + 1];
      has = true;
      i += 2;
    } else if (c === " ") {
      if (has) out.push(cur);
      cur = "";
      has = false;
      i += 1;
    } else {
      expect(c, `unquoted metacharacter in: ${line}`).toMatch(/[A-Za-z0-9_./:-]/);
      cur += c;
      has = true;
      i += 1;
    }
  }
  if (has) out.push(cur);
  return out;
}

describe("tool matrix", () => {
  it("offers the right tools per stream kind", () => {
    expect(toolsFor("progressive")).toEqual(["yt-dlp", "ffmpeg", "curl", "wget", "aria2c"]);
    expect(toolsFor("hls")).toEqual(["yt-dlp", "ffmpeg", "streamlink", "n-m3u8dl-re"]);
    expect(toolsFor("dash")).toEqual(["yt-dlp", "ffmpeg", "streamlink", "n-m3u8dl-re"]);
    expect(CLI_TOOLS).toHaveLength(7);
  });

  it("resolves auto shell from platform", () => {
    expect(resolveShell("auto", "Win32")).toBe("powershell");
    expect(resolveShell("auto", "MacIntel")).toBe("bash");
    expect(resolveShell("auto", "Darwin")).toBe("bash");
    expect(resolveShell("auto", "Linux x86_64")).toBe("bash");
    expect(resolveShell("cmd", "MacIntel")).toBe("cmd");
  });
});

describe("buildCliCommand", () => {
  const kinds = { "yt-dlp": "hls", ffmpeg: "hls", streamlink: "hls", "n-m3u8dl-re": "hls", curl: "progressive", wget: "progressive", aria2c: "progressive" } as const;

  for (const tool of Object.keys(kinds) as (keyof typeof kinds)[]) {
    for (const shell of SHELLS) {
      it(`${tool} / ${shell} builds a command that carries the exact URL`, () => {
        const url = tool === "curl" || tool === "wget" || tool === "aria2c" ? "https://cdn.example.com/a.mp4?t=1&u=2" : base.url;
        const res = buildCliCommand({ ...base, url, tool, shell, kind: kinds[tool] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.command.length).toBeGreaterThan(10);
        expect(res.command).not.toMatch(/[\r\n]/);
        if (shell === "bash") {
          const tokens = posixTokens(res.command);
          expect(tokens.some((t) => t.includes(url))).toBe(true);
          expect(tokens.some((t) => t.includes("https://example.com/watch?v=1"))).toBe(true);
        }
      });
    }
  }

  it("uses curl.exe and wget.exe in PowerShell so the Invoke-WebRequest aliases are not hit", () => {
    const curl = buildCliCommand({ ...base, tool: "curl", shell: "powershell", kind: "progressive" });
    const wget = buildCliCommand({ ...base, tool: "wget", shell: "powershell", kind: "progressive" });
    expect(curl.ok && curl.command.startsWith("curl.exe ")).toBe(true);
    expect(wget.ok && wget.command.startsWith("wget.exe ")).toBe(true);
  });

  it("emits the documented flags for each tool", () => {
    const get = (tool: CliInput["tool"], kind: CliInput["kind"]) => {
      const r = buildCliCommand({ ...base, tool, kind, shell: "bash", userAgent: "UA/1.0" });
      if (!r.ok) throw new Error(r.reason);
      return posixTokens(r.command);
    };
    const y = get("yt-dlp", "hls");
    expect(y.slice(0, 3)).toEqual(["yt-dlp", "--no-playlist", "--merge-output-format"]);
    expect(y).toContain("--referer");
    expect(y).toContain("--user-agent");
    expect(y[y.indexOf("-o") + 1]).toBe("My_Clip_20261013_1080p.mp4");
    expect(y.at(-1)).toBe(base.url);

    const f = get("ffmpeg", "hls");
    expect(f).toEqual(expect.arrayContaining(["-referer", "-user_agent", "-i", "-c", "copy", "-bsf:a", "aac_adtstoasc"]));
    expect(f.at(-1)).toBe("My_Clip_20261013_1080p.mp4");
    expect(get("ffmpeg", "dash")).not.toContain("aac_adtstoasc");
    expect(get("ffmpeg", "progressive")).not.toContain("aac_adtstoasc");

    const s = get("streamlink", "hls");
    expect(s).toContain(`hls://${base.url}`);
    expect(s.at(-1)).toBe("best");
    expect(s[s.indexOf("-o") + 1]).toBe("My_Clip_20261013_1080p.ts");
    expect(get("streamlink", "dash")).toContain(`dash://${base.url}`);

    const n = get("n-m3u8dl-re", "hls");
    expect(n[0]).toBe("N_m3u8DL-RE");
    expect(n[1]).toBe(base.url);
    expect(n[n.indexOf("--save-name") + 1]).toBe("My_Clip_20261013_1080p");
    expect(n).toEqual(expect.arrayContaining(["--auto-select", "-M", "format=mp4"]));
    expect(n).toContain("Referer: https://example.com/watch?v=1");

    const c = get("curl", "progressive");
    expect(c).toEqual(expect.arrayContaining(["-L", "--fail", "--retry", "3", "-e", "-A"]));
    const w = get("wget", "progressive");
    expect(w).toContain("--referer=https://example.com/watch?v=1");
    expect(w).toContain("--user-agent=UA/1.0");
    const a = get("aria2c", "progressive");
    expect(a).toEqual(expect.arrayContaining(["-x", "16", "-s", "16", "-k", "1M"]));
  });

  describe("yt-dlp page mode", () => {
    const page = "https://example.com/watch?v=1&t=5";
    const run = (over: Partial<CliInput> = {}, shell: CliInput["shell"] = "bash") => {
      const r = buildCliCommand({ ...base, tool: "yt-dlp", kind: "hls", shell, ytdlpPage: true, pageUrl: page, ...over });
      return r.ok ? { ok: true as const, tokens: posixTokens(r.command), command: r.command } : r;
    };

    it("hands yt-dlp the page URL instead of the stream URL", () => {
      const r = run();
      if (!r.ok) throw new Error(r.reason);
      expect(r.tokens.at(-1)).toBe(page);
      expect(r.command).not.toContain("master.m3u8");
      expect(r.tokens).not.toContain("--referer");
    });

    it("turns the height cap into a format selector", () => {
      const r = run({ maxHeight: 720 });
      if (!r.ok) throw new Error(r.reason);
      expect(r.tokens[r.tokens.indexOf("-f") + 1]).toBe("bv*[height<=720]+ba/b[height<=720]/b");
      const none = run({ maxHeight: undefined });
      if (!none.ok) throw new Error(none.reason);
      expect(none.tokens).not.toContain("-f");
    });

    it("adds subtitles only when asked", () => {
      const on = run({ subtitles: true });
      const off = run({ subtitles: false });
      if (!on.ok || !off.ok) throw new Error("expected commands");
      expect(on.tokens).toEqual(expect.arrayContaining(["--write-subs", "--sub-langs", "all"]));
      expect(off.tokens).not.toContain("--write-subs");
    });

    it("ignores page mode for every other tool and for stream-URL mode", () => {
      const ff = buildCliCommand({ ...base, tool: "ffmpeg", kind: "hls", shell: "bash", ytdlpPage: true, pageUrl: page });
      expect(ff.ok && ff.command).toContain("master.m3u8");
      const direct = buildCliCommand({ ...base, tool: "yt-dlp", kind: "hls", shell: "bash", maxHeight: 720, subtitles: true });
      if (!direct.ok) throw new Error(direct.reason);
      expect(direct.command).not.toMatch(/-f |--write-subs/);
      expect(direct.command).toContain("master.m3u8");
    });

    it("still refuses DRM-protected streams and DRM service pages", () => {
      expect(run({ encrypted: true }).ok).toBe(false);
      const svc = run({ pageUrl: "https://www.netflix.com/watch/1" });
      expect(svc.ok).toBe(false);
    });

    it("refuses when there is no usable page URL", () => {
      expect(run({ pageUrl: undefined }).ok).toBe(false);
      expect(run({ pageUrl: "about:blank" }).ok).toBe(false);
    });

    it("quotes the format selector for every shell", () => {
      for (const shell of ["bash", "powershell", "cmd"] as const) {
        const r = buildCliCommand({ ...base, tool: "yt-dlp", kind: "hls", shell, ytdlpPage: true, pageUrl: page, maxHeight: 1080 });
        if (!r.ok) throw new Error(r.reason);
        expect(r.command, shell).toMatch(/["']bv\*\[height<=1080\]\+ba\/b\[height<=1080\]\/b["']/);
      }
    });
  });

  it("omits Referer and User-Agent unless asked", () => {
    const r = buildCliCommand({ ...base, referer: undefined, tool: "yt-dlp", shell: "bash", kind: "hls" });
    expect(r.ok && r.command).not.toMatch(/referer|user-agent/i);
  });

  it("refuses tools that do not fit the stream kind", () => {
    const r = buildCliCommand({ ...base, tool: "curl", shell: "bash", kind: "hls" });
    expect(r).toMatchObject({ ok: false });
    expect(buildCliCommand({ ...base, tool: "streamlink", shell: "bash", kind: "progressive" })).toMatchObject({ ok: false });
  });

  it("refuses non-http URLs", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/plain,hi", "ftp://x/a.mp4", "not a url", ""]) {
      expect(buildCliCommand({ ...base, url, tool: "yt-dlp", shell: "bash", kind: "hls" })).toMatchObject({ ok: false });
    }
  });

  it("never produces a command for DRM-protected items", () => {
    for (const tool of CLI_TOOLS) {
      for (const shell of SHELLS) {
        const kind = tool.kinds[0]!;
        const locked = buildCliCommand({ ...base, tool: tool.id, shell, kind, encrypted: true });
        expect(locked.ok).toBe(false);
        if (!locked.ok) expect(locked.reason).toMatch(/DRM/);
        const host = buildCliCommand({ ...base, tool: tool.id, shell, kind, referer: "https://www.netflix.com/watch/1" });
        expect(host.ok).toBe(false);
      }
    }
  });

  it("extracts audio with ffmpeg or yt-dlp and still refuses DRM", () => {
    const ff = buildCliCommand({ ...base, tool: "ffmpeg", shell: "bash", kind: "hls", audioOnly: true });
    expect(ff.ok && ff.command).toMatch(/ffmpeg /);
    expect(ff.ok && ff.command).toMatch(/-vn/);
    expect(ff.ok && ff.command).toMatch(/-c:a copy/);
    expect(ff.ok && ff.command).toMatch(/\.m4a/);
    const ytdlp = buildCliCommand({ ...base, tool: "yt-dlp", shell: "bash", kind: "hls", audioOnly: true });
    expect(ytdlp.ok && ytdlp.command).toMatch(/-x --audio-format m4a/);
    expect(ytdlp.ok && ytdlp.command).not.toMatch(/decrypt|--key\b/i);
    expect(buildCliCommand({ ...base, tool: "ffmpeg", shell: "bash", kind: "hls", audioOnly: true, encrypted: true }).ok).toBe(false);
    expect(buildCliCommand({ ...base, tool: "curl", shell: "bash", kind: "progressive", audioOnly: true }).ok).toBe(false);
    const audioFile = buildCliCommand({
      ...base,
      url: "https://cdn.example.com/talk.mp3",
      tool: "curl",
      shell: "bash",
      kind: "progressive",
      audioOnly: true,
    });
    expect(audioFile.ok && audioFile.command).toMatch(/talk\.mp3|\.m4a/);
  });

  it("never emits a DRM-bypass or decryption flag", () => {
    const banned = /--key\b|--allow-unplayable|--use-shaka|--decryption|--cdm|widevine|playready|fairplay|--enable-drm|decrypt/i;
    for (const tool of CLI_TOOLS) {
      for (const shell of SHELLS) {
        for (const kind of tool.kinds) {
          const r = buildCliCommand({ ...base, tool: tool.id, shell, kind, userAgent: "UA" });
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.command).not.toMatch(banned);
        }
      }
    }
  });

  it("neutralises hostile page-controlled values", () => {
    const hostile = {
      url: "https://evil.example/a b.mp4?x=$(calc)&y=`whoami`;rm -rf /#frag'quote",
      referer: "https://evil.example/page?'\";calc;\"'",
      userAgent: "Mozilla \"5.0\" \u2018smart\u2019 $(calc) `id` ; & | > <\\",
      filename: "-rf ../../etc/passwd; $(calc) \"quoted\".mp4",
    };
    for (const shell of SHELLS) {
      for (const tool of CLI_TOOLS) {
        const kind = tool.kinds[0]!;
        // The hostile URL normalises to %20/%27 escapes, which interactive cmd refuses; .bat is the cmd path.
        const r = buildCliCommand({ ...hostile, tool: tool.id, shell, kind, cmdBatch: shell === "cmd" });
        expect(r.ok, `${tool.id}/${shell}`).toBe(true);
        if (!r.ok) continue;
        expect(r.command).not.toMatch(/[\r\n]/);
        if (shell === "bash") {
          const tokens = posixTokens(r.command);
          // No token may be an option smuggled in through the file name.
          const nameIdx = tokens.findIndex((t) => /passwd/.test(t));
          expect(tokens[nameIdx]!.startsWith("-")).toBe(false);
          expect(tokens[nameIdx]).not.toMatch(/[\\/]/);
          // The hostile URL survives as ONE argument, byte for byte after URL normalisation.
          const href = new URL(hostile.url).href;
          expect(tokens.filter((t) => t.includes(href))).toHaveLength(1);
        }
      }
    }
  });

  it("explains the interactive cmd.exe refusal and offers the .bat route", () => {
    const url = "https://cdn.example.com/a%20b.mp4";
    const prompt = buildCliCommand({ ...base, url, tool: "yt-dlp", shell: "cmd", kind: "hls" });
    expect(prompt.ok).toBe(false);
    if (!prompt.ok) expect(prompt.reason).toMatch(/\.bat/);
    expect(buildCliCommand({ ...base, url, tool: "yt-dlp", shell: "cmd", kind: "hls", cmdBatch: true }).ok).toBe(true);
    expect(buildCliCommand({ ...base, url, tool: "yt-dlp", shell: "powershell", kind: "hls" }).ok).toBe(true);
    expect(buildCliCommand({ ...base, url, tool: "yt-dlp", shell: "bash", kind: "hls" }).ok).toBe(true);
  });

  it("keeps a file name from becoming an option", () => {
    const r = buildCliCommand({ ...base, filename: "--exec=calc.mp4", tool: "yt-dlp", shell: "bash", kind: "hls" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(posixTokens(r.command)[posixTokens(r.command).indexOf("-o") + 1]).toBe("_--exec=calc.mp4");
    const dot = buildCliCommand({ ...base, filename: ".hidden", tool: "curl", shell: "bash", kind: "progressive" });
    expect(dot.ok && posixTokens(dot.command)).toContain("_.hidden.mp4");
  });
});

describe("quoteArg", () => {
  it("leaves plain words bare and quotes everything else", () => {
    for (const shell of SHELLS) {
      expect(quoteArg(shell, "--no-playlist")).toBe("--no-playlist");
      expect(quoteArg(shell, "16")).toBe("16");
      expect(quoteArg(shell, "a b")).not.toBe("a b");
    }
  });

  it("refuses control characters and double quotes", () => {
    for (const shell of SHELLS) {
      expect(quoteArg(shell, "a\nb")).toBeNull();
      expect(quoteArg(shell, "a\rb")).toBeNull();
      expect(quoteArg(shell, "a\0b")).toBeNull();
      expect(quoteArg(shell, "a\u2028b")).toBeNull();
      expect(quoteArg(shell, 'a"b')).toBeNull();
    }
  });

  it("escapes single quotes per shell", () => {
    expect(quoteArg("bash", "it's")).toBe(`'it'\\''s'`);
    expect(quoteArg("powershell", "it's")).toBe("'it''s'");
    expect(quoteArg("powershell", "\u2018x\u2019")).toBe("'\u2018\u2018x\u2019\u2019'");
  });

  it("refuses % at the interactive cmd prompt but doubles it for .bat files", () => {
    expect(quoteArg("cmd", "%PATH%")).toBeNull();
    expect(quoteArg("cmd", "%COMSPEC%")).toBeNull();
    expect(quoteArg("cmd", "100%")).toBeNull();
    expect(quoteArg("cmd", "100%", { cmdBatch: true })).toBe('"100%%"');
    expect(quoteArg("cmd", "%COMSPEC%", { cmdBatch: true })).toBe('"%%COMSPEC%%"');
    expect(quoteArg("cmd", "50 percent")).toBe('"50 percent"');
    expect(quoteArg("powershell", "100%")).toBe("'100%'");
    expect(quoteArg("bash", "100%")).toBe("'100%'");
  });

  it("doubles trailing backslashes before a closing cmd quote", () => {
    expect(quoteArg("cmd", "C:\\dir\\ x\\")).toBe('"C:\\dir\\ x\\\\"');
  });
});

describe("batch + url list", () => {
  const inputs = (shell: CliShell): CliInput[] => [
    { ...base, tool: "yt-dlp", shell, kind: "hls", filename: "one.mp4" },
    { ...base, tool: "yt-dlp", shell, kind: "progressive", url: "https://cdn.example.com/b.mp4", filename: "two.mp4" },
    { ...base, tool: "yt-dlp", shell, kind: "hls", filename: "locked.mp4", encrypted: true },
  ];

  it("builds a script per shell and reports skipped DRM items", () => {
    const bash = buildBatchScript(inputs("bash"));
    expect(bash.script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(bash.count).toBe(2);
    expect(bash.skipped).toEqual([{ index: 2, reason: expect.stringMatching(/DRM/) }]);
    expect(bash.script).not.toContain("locked.mp4");

    const ps = buildBatchScript(inputs("powershell"));
    expect(ps.script).toContain("$ErrorActionPreference");
    const cmd = buildBatchScript(inputs("cmd"));
    expect(cmd.script.startsWith("@echo off\r\n")).toBe(true);
    expect(cmd.script).toContain("\r\n");
  });

  it("returns an empty script body when nothing is allowed", () => {
    const r = buildBatchScript([{ ...base, tool: "curl", shell: "bash", kind: "hls" }]);
    expect(r.count).toBe(0);
    expect(r.skipped).toHaveLength(1);
  });

  it("builds a de-duplicated http(s) URL list", () => {
    const list = buildUrlList(["https://a.com/x.mp4", "https://a.com/x.mp4", "ftp://nope/x", "garbage", "https://b.com/y.m3u8"]);
    expect(list).toBe("https://a.com/x.mp4\nhttps://b.com/y.m3u8\n");
    expect(buildUrlList([])).toBe("");
  });
});
