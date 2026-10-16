import type { CliShell, CliTool, VideoKind } from "./types";
import { hostLooksDrm } from "./url";

export type { CliShell, CliTool } from "./types";

/**
 * Copy-ready extraction commands for public streams.
 *
 * Safety rules, enforced and tested:
 * - Page-controlled strings (URLs, titles, referers, user agents) are never interpolated raw.
 *   Every argument is quoted for the target shell, or the whole command is refused.
 * - DRM-protected items never produce a command, and no DRM-bypass flags are ever emitted
 *   (no decryption keys, no "allow unplayable formats", no CDM options).
 */

export type CliToolMeta = {
  id: CliTool;
  label: string;
  /** Stream kinds this tool is offered for. */
  kinds: readonly VideoKind[];
  hint: string;
};

export const CLI_TOOLS: readonly CliToolMeta[] = [
  { id: "yt-dlp", label: "yt-dlp", kinds: ["progressive", "hls", "dash"], hint: "Most capable all-round downloader." },
  { id: "ffmpeg", label: "ffmpeg", kinds: ["progressive", "hls", "dash"], hint: "Stream copy into MP4, no re-encode." },
  { id: "streamlink", label: "streamlink", kinds: ["hls", "dash"], hint: "Saves the live or VOD stream as .ts." },
  { id: "n-m3u8dl-re", label: "N_m3u8DL-RE", kinds: ["hls", "dash"], hint: "Fast segmented HLS/DASH downloader." },
  { id: "curl", label: "curl", kinds: ["progressive"], hint: "Plain file download." },
  { id: "wget", label: "wget", kinds: ["progressive"], hint: "Resumable file download." },
  { id: "aria2c", label: "aria2", kinds: ["progressive"], hint: "16-connection accelerated download." },
] as const;

export const CLI_SHELLS: readonly { id: CliShell; label: string }[] = [
  { id: "bash", label: "bash / zsh" },
  { id: "powershell", label: "PowerShell" },
  { id: "cmd", label: "cmd.exe" },
] as const;

export function toolsFor(kind: VideoKind): CliTool[] {
  return CLI_TOOLS.filter((t) => t.kinds.includes(kind)).map((t) => t.id);
}

export function resolveShell(pref: "auto" | CliShell, platform = ""): CliShell {
  if (pref !== "auto") return pref;
  return /^win/i.test(platform) ? "powershell" : "bash";
}

export type CliInput = {
  tool: CliTool;
  shell: CliShell;
  url: string;
  kind: VideoKind;
  /** Desired output file name, usually from the filename template. */
  filename: string;
  /** Page URL, sent as Referer when set. */
  referer?: string;
  userAgent?: string;
  encrypted?: boolean;
  /** cmd.exe only: quote for a .bat file (percent doubled) instead of the interactive prompt. */
  cmdBatch?: boolean;
  /**
   * yt-dlp only: give yt-dlp the page URL instead of the stream URL, so its own site extractors resolve
   * the media. `maxHeight` and `subtitles` only apply in this mode (a direct stream URL has already
   * fixed the quality and carries no subtitle list).
   */
  ytdlpPage?: boolean;
  pageUrl?: string;
  maxHeight?: number;
  subtitles?: boolean;
};

export type CliResult = { ok: true; command: string } | { ok: false; reason: string };

 
const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
const BARE = /^[A-Za-z0-9_./:-]+$/;

/**
 * Quote one argument for a shell. Returns null when the value cannot be carried safely
 * (control characters, double quotes, or an empty argument where the shell drops it).
 */
export function quoteArg(shell: CliShell, arg: string, opts: { cmdBatch?: boolean } = {}): string | null {
  if (CONTROL.test(arg) || arg.includes('"')) return null;
  if (arg === "") return shell === "bash" ? "''" : shell === "cmd" ? '""' : null;
  if (BARE.test(arg)) return arg;
  if (shell === "bash") return `'${arg.replace(/'/g, `'\\''`)}'`;
  if (shell === "powershell") {
    if (/\s/.test(arg) && /\\$/.test(arg)) return null;
    return `'${arg.replace(/['\u2018\u2019\u201A\u201B]/g, (c) => c + c)}'`;
  }
  const seg = (s: string) => `"${s.replace(/(\\+)$/, "$1$1")}"`;
  // A .bat file collapses %% to a literal percent, which is reliable.
  if (opts.cmdBatch) return seg(arg.replace(/%/g, "%%"));
  // The interactive cmd.exe prompt expands %VAR% even inside quotes and has parser quirks that
  // cannot be escaped reliably (some %NAME% shapes even freeze the prompt). Refuse instead.
  if (arg.includes("%")) return null;
  return seg(arg);
}

/** True when a value is only unsafe for the interactive cmd.exe prompt because of a percent sign. */
function cmdPercentOnly(shell: CliShell, arg: string, batch?: boolean): boolean {
  return shell === "cmd" && !batch && arg.includes("%") && !CONTROL.test(arg) && !arg.includes('"');
}

function cleanText(value: string, max = 300): string {
  return value.replace(CONTROL, " ").replace(/"/g, "'").replace(/\\+$/g, "").trim().slice(0, max);
}

function cleanUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href.replace(/"/g, "%22");
  } catch {
    return null;
  }
}

function safeFilename(value: string): string {
  let name = cleanText(value.replace(/[\\/]+/g, "_"), 150).replace(/[<>:|?*]/g, "");
  if (!name) name = "video.mp4";
  if (name.startsWith("-") || name.startsWith(".")) name = `_${name}`;
  return name;
}

function withExt(name: string, ext: string): string {
  return /\.[A-Za-z0-9]{2,4}$/.test(name) ? name.replace(/\.[A-Za-z0-9]{2,4}$/, `.${ext}`) : `${name}.${ext}`;
}

function stem(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{2,4}$/, "") || "video";
}

/** Build one command for one stream, or explain why it was refused. */
export function buildCliCommand(input: CliInput): CliResult {
  if (input.encrypted) {
    return { ok: false, reason: "This stream is DRM-protected. KUI Video Extractor does not generate commands for it." };
  }
  if (input.referer && hostLooksDrm(input.referer)) {
    return { ok: false, reason: "This site is a DRM streaming service. No commands are generated." };
  }
  const meta = CLI_TOOLS.find((t) => t.id === input.tool);
  if (!meta) return { ok: false, reason: "Unknown tool." };
  if (!meta.kinds.includes(input.kind)) {
    return { ok: false, reason: `${meta.label} is not offered for ${input.kind.toUpperCase()} streams. Pick another tool.` };
  }
  const url = cleanUrl(input.url);
  if (!url) return { ok: false, reason: "Only http(s) URLs can be turned into commands." };

  const pageMode = input.tool === "yt-dlp" && Boolean(input.ytdlpPage);
  const pageTarget = pageMode && input.pageUrl ? cleanUrl(input.pageUrl) : null;
  if (pageMode) {
    if (!pageTarget) return { ok: false, reason: "There is no http(s) page URL to give yt-dlp. Turn off page mode." };
    if (hostLooksDrm(pageTarget)) {
      return { ok: false, reason: "This site is a DRM streaming service. No commands are generated." };
    }
  }

  const referer = input.referer ? cleanUrl(input.referer) : null;
  const ua = input.userAgent ? cleanText(input.userAgent) : "";
  const file = safeFilename(input.filename);
  const win = input.shell !== "bash";

  let bin: string;
  let args: string[];

  switch (input.tool) {
    case "yt-dlp": {
      bin = "yt-dlp";
      const cap = input.maxHeight && input.maxHeight > 0 ? Math.floor(input.maxHeight) : 0;
      args = [
        "--no-playlist",
        // Best video+audio up to the cap, else the best single file. Only for page mode; a stream URL is already one choice.
        ...(pageTarget && cap ? ["-f", `bv*[height<=${cap}]+ba/b[height<=${cap}]/b`] : []),
        "--merge-output-format",
        "mp4",
        ...(pageTarget && input.subtitles ? ["--write-subs", "--sub-langs", "all"] : []),
        ...(referer && !pageTarget ? ["--referer", referer] : []),
        ...(ua ? ["--user-agent", ua] : []),
        "-o",
        withExt(file, "mp4"),
        pageTarget ?? url,
      ];
      break;
    }
    case "ffmpeg":
      bin = "ffmpeg";
      args = [
        "-hide_banner",
        ...(referer ? ["-referer", referer] : []),
        ...(ua ? ["-user_agent", ua] : []),
        "-i",
        url,
        "-c",
        "copy",
        ...(input.kind === "hls" ? ["-bsf:a", "aac_adtstoasc"] : []),
        withExt(file, "mp4"),
      ];
      break;
    case "streamlink":
      bin = "streamlink";
      args = [
        ...(referer ? ["--http-header", `Referer=${referer}`] : []),
        ...(ua ? ["--http-header", `User-Agent=${ua}`] : []),
        "-o",
        withExt(file, "ts"),
        `${input.kind === "dash" ? "dash" : "hls"}://${url}`,
        "best",
      ];
      break;
    case "n-m3u8dl-re":
      bin = "N_m3u8DL-RE";
      args = [
        url,
        "--save-name",
        stem(file),
        "--auto-select",
        "-M",
        "format=mp4",
        ...(referer ? ["-H", `Referer: ${referer}`] : []),
        ...(ua ? ["-H", `User-Agent: ${ua}`] : []),
      ];
      break;
    case "curl":
      bin = win && input.shell === "powershell" ? "curl.exe" : "curl";
      args = [
        "-L",
        "--fail",
        "--retry",
        "3",
        ...(referer ? ["-e", referer] : []),
        ...(ua ? ["-A", ua] : []),
        "-o",
        withExt(file, "mp4"),
        url,
      ];
      break;
    case "wget":
      bin = input.shell === "powershell" ? "wget.exe" : "wget";
      args = [
        "-c",
        ...(referer ? [`--referer=${referer}`] : []),
        ...(ua ? [`--user-agent=${ua}`] : []),
        "-O",
        withExt(file, "mp4"),
        url,
      ];
      break;
    case "aria2c":
      bin = "aria2c";
      args = [
        "-x",
        "16",
        "-s",
        "16",
        "-k",
        "1M",
        ...(referer ? [`--referer=${referer}`] : []),
        ...(ua ? [`--user-agent=${ua}`] : []),
        "-o",
        withExt(file, "mp4"),
        url,
      ];
      break;
    default:
      return { ok: false, reason: "Unknown tool." };
  }

  const quoted: string[] = [];
  for (const arg of args) {
    const q = quoteArg(input.shell, arg, { cmdBatch: input.cmdBatch });
    if (q == null) {
      if (cmdPercentOnly(input.shell, arg, input.cmdBatch)) {
        return {
          ok: false,
          reason: "This URL contains % escapes, which the interactive cmd.exe prompt cannot carry safely. Use the .bat script, or pick PowerShell or bash.",
        };
      }
      return {
        ok: false,
        reason: `A value in this command cannot be quoted safely for ${input.shell}. Try another shell.`,
      };
    }
    quoted.push(q);
  }
  return { ok: true, command: [bin, ...quoted].join(" ") };
}

export type BatchResult = { script: string; count: number; skipped: { index: number; reason: string }[] };

/** One runnable script for many streams. Refused items are listed, never silently emitted. */
export function buildBatchScript(inputs: CliInput[]): BatchResult {
  const shell = inputs[0]?.shell ?? "bash";
  const lines: string[] = [];
  const skipped: BatchResult["skipped"] = [];
  inputs.forEach((input, index) => {
    const res = buildCliCommand({ ...input, shell, cmdBatch: shell === "cmd" });
    if (res.ok) lines.push(res.command);
    else skipped.push({ index, reason: res.reason });
  });
  const note = "KUI Video Extractor by Krypton Ultimate Inc II. Public streams only.";
  const header =
    shell === "bash"
      ? `#!/usr/bin/env bash\n# ${note}\nset -u\n`
      : shell === "powershell"
        ? `# ${note}\n$ErrorActionPreference = 'Continue'\n`
        : `@echo off\r\nchcp 65001 >nul\r\nREM ${note}\r\n`;
  const eol = shell === "cmd" ? "\r\n" : "\n";
  return { script: header + lines.join(eol) + (lines.length ? eol : ""), count: lines.length, skipped };
}

/** Plain URL list, one per line, for `yt-dlp -a urls.txt` style batch input. */
export function buildUrlList(urls: string[]): string {
  const clean = urls.map(cleanUrl).filter((u): u is string => Boolean(u));
  return clean.length ? `${[...new Set(clean)].join("\n")}\n` : "";
}
