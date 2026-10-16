import { useState } from "react";
import { buildCliCommand, resolveShell } from "../../shared/cli";
import { copyText } from "../lib/clipboard";
import { useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";
import { CheckIcon, CopyIcon } from "./icons";

/**
 * Some players (YouTube style) feed the video from memory, so there is no file URL to fetch.
 * yt-dlp knows those sites, so offer it the page address instead.
 */
export function PageFallback() {
  const scan = useFinderStore((s) => s.scan);
  const prefs = useFinderStore((s) => s.prefs);
  const [copied, setCopied] = useState(false);
  if (!scan.blobPlayback) return null;
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  const result = buildCliCommand({
    tool: "yt-dlp",
    shell: resolveShell(prefs.cliShell, platform),
    url: scan.pageUrl,
    kind: "progressive",
    filename: `${scan.pageTitle || "video"}.mp4`,
    ytdlpPage: true,
    pageUrl: scan.pageUrl,
    maxHeight: prefs.maxHeight === "auto" ? undefined : Number(prefs.maxHeight),
    subtitles: prefs.includeSubtitles,
  });
  return (
    <div className={styles.fallback} data-testid="page-fallback">
      <p className={styles.infoHint}>
        This page plays video from memory, so there is no file address to fetch here. yt-dlp can often save it from the page address.
      </p>
      {result.ok ? (
        <div className={styles.fallbackRow}>
          <code className={styles.fallbackCode}>{result.command}</code>
          <button
            type="button"
            className={styles.ghost}
            onClick={async () => {
              if (await copyText(result.command)) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }
            }}
          >
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className={styles.infoHint}>{result.reason}</p>
      )}
    </div>
  );
}
