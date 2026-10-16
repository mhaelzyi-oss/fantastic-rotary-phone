import { useEffect, useRef, useState } from "react";
import { buildBatchScript, buildCliCommand, CLI_SHELLS, CLI_TOOLS } from "../../shared/cli";
import { copyText } from "../lib/clipboard";
import { useFinderStore } from "../state/finderStore";
import { CheckIcon, CopyIcon, LockIcon, ScriptIcon, TerminalIcon } from "./icons";
import styles from "./CommandPanel.module.css";

type Props = { index: number };

export function CommandPanel({ index }: Props) {
  const prefs = useFinderStore((s) => s.prefs);
  useFinderStore((s) => s.variantUrl);
  const exists = useFinderStore((s) => Boolean(s.scan.sources[index]));
  const cliInputFor = useFinderStore((s) => s.cliInputFor);
  const setCli = useFinderStore((s) => s.setCli);
  const [copied, setCopied] = useState<"cmd" | "script" | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const input = exists ? cliInputFor(index) : undefined;
  if (!input) return null;

  const { tool, shell, kind } = input;
  const locked = Boolean(input.encrypted);
  const result = buildCliCommand(input);
  // For cmd this is a .bat script (percent signs doubled); for the others a runnable script.
  const script = buildBatchScript([input]);

  async function copy(which: "cmd" | "script", text: string) {
    if (!(await copyText(text))) return;
    setCopied(which);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className={styles.panel} aria-label="Command line extraction" data-testid="command-panel">
      <header className={styles.head}>
        <span className={styles.title}>
          <TerminalIcon size={14} /> Command
        </span>
        <span className={styles.hint}>{CLI_TOOLS.find((t) => t.id === tool)?.hint}</span>
      </header>

      <div className={styles.seg} role="tablist" aria-label="Tool">
        {CLI_TOOLS.map((t) => {
          const ok = t.kinds.includes(kind);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tool === t.id}
              disabled={!ok}
              title={ok ? t.hint : `${t.label} does not handle ${kind.toUpperCase()}`}
              className={tool === t.id ? `${styles.pill} ${styles.on}` : styles.pill}
              onClick={() => setCli({ cliTool: t.id })}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={styles.row}>
        <div className={styles.seg} role="tablist" aria-label="Shell">
          {CLI_SHELLS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={shell === s.id}
              className={shell === s.id ? `${styles.pill} ${styles.on}` : styles.pill}
              onClick={() => setCli({ cliShell: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={prefs.cliReferer} onChange={(e) => setCli({ cliReferer: e.target.checked })} />
          Referer
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={prefs.cliUserAgent} onChange={(e) => setCli({ cliUserAgent: e.target.checked })} />
          User-Agent
        </label>
        {tool === "yt-dlp" ? (
          <label className={styles.check} title="Let yt-dlp resolve the media from the page itself, with your quality cap and subtitles setting">
            <input type="checkbox" checked={prefs.cliYtdlpPage} onChange={(e) => setCli({ cliYtdlpPage: e.target.checked })} />
            Use page URL
          </label>
        ) : null}
      </div>

      {result.ok ? (
        <div className={styles.code} data-testid="command-output">
          <code>{result.command}</code>
          <button
            type="button"
            className={styles.copy}
            aria-label="Copy command"
            title="Copy command"
            onClick={() => void copy("cmd", result.command)}
          >
            {copied === "cmd" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </div>
      ) : (
        <div className={styles.note} data-locked={locked} role="status" data-testid="command-refused">
          {locked ? <LockIcon size={14} /> : <TerminalIcon size={14} />}
          <span>{result.reason}</span>
        </div>
      )}

      {!locked ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            aria-label={shell === "cmd" ? "Copy .bat" : "Copy as script"}
            disabled={script.count === 0}
            onClick={() => void copy("script", script.script)}
          >
            {copied === "script" ? <CheckIcon size={13} /> : <ScriptIcon size={13} />}
            {copied === "script" ? "Copied" : shell === "cmd" ? "Copy .bat" : "Copy as script"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
