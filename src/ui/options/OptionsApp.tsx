import { type FormEvent, useEffect, useRef, useState } from "react";
import { CLI_SHELLS, CLI_TOOLS } from "../../shared/cli";
import { lintFilenameTemplate } from "../../shared/filename";
import { mergePrefs, parseHostList } from "../../shared/prefs";
import { DEFAULT_PREFS, type UserPrefs } from "../../shared/types";
import { Logo } from "../components/icons";
import { RETENTION_DAYS } from "../../shared/retention";
import { copyText } from "../lib/clipboard";
import { sendMessage } from "../lib/messaging";
import styles from "./options.module.css";

const empty = mergePrefs();

export function OptionsApp() {
  const [prefs, setPrefs] = useState<UserPrefs>(empty);
  const [saved, setSaved] = useState(false);
  const [diag, setDiag] = useState<{ text: string; count: number } | null>(null);
  const [diagNote, setDiagNote] = useState("");
  const [eraseStep, setEraseStep] = useState<"idle" | "confirm" | "done">("idle");
  const [saves, setSaves] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void sendMessage<UserPrefs>({ type: "GET_PREFS" }).then((next) => {
      setPrefs(mergePrefs(next ?? DEFAULT_PREFS));
    });
    void sendMessage<unknown[]>({ type: "GET_HISTORY" }).then((rows) => {
      setSaves(Array.isArray(rows) ? rows.length : 0);
    });
    return () => window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  function patch<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await sendMessage({ type: "SET_PREFS", prefs: mergePrefs(prefs) });
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1500);
  }

  const templateWarnings = lintFilenameTemplate(prefs.prompt);

  async function copyDiagnostics() {
    const res = await sendMessage<{ text: string; count: number }>({ type: "GET_DIAGNOSTICS" });
    setDiag(res ?? null);
    setDiagNote(res && res.count ? ((await copyText(res.text)) ? `Copied ${res.count} entries.` : "Could not copy.") : "No entries yet.");
  }

  async function clearDiagnostics() {
    await sendMessage({ type: "CLEAR_DIAGNOSTICS" });
    setDiag(null);
    setDiagNote("Cleared.");
  }

  async function erase() {
    if (eraseStep !== "confirm") {
      setEraseStep("confirm");
      return;
    }
    await sendMessage({ type: "ERASE_ALL_DATA" });
    setPrefs(mergePrefs());
    setDiag(null);
    setDiagNote("");
    setEraseStep("done");
  }

  const group = `${styles.glass} ${styles.fieldset}`;

  return (
    <div className={styles.page}>
      <div className={styles.ornaments} aria-hidden="true">
        <svg className={styles.o1} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o2} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o3} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
      </div>
      <header className={`${styles.glass} ${styles.top}`}>
        <Logo size={40} className={styles.logo} />
        <div>
          <h1 className={styles.h1}>KUI Video Extractor</h1>
          <p className={styles.sub}>Find the public file on this page.</p>
        </div>
      </header>
      <div className={`${styles.glass} ${styles.pulse}`} aria-label="On this device">
        <div>
          <b>1</b>
          <span>Here</span>
        </div>
        <div>
          <b>{saves}</b>
          <span>Saved</span>
        </div>
      </div>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
        <fieldset className={group}>
          <legend className={styles.legend}>Downloads</legend>
          <label className={styles.label}>
            Subfolder under Downloads
            <input className={styles.input} value={prefs.subfolder} onChange={(e) => patch("subfolder", e.target.value.trim())} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.saveAs} onChange={(e) => patch("saveAs", e.target.checked)} /> Ask where to save
          </label>
          <label className={styles.label}>
            If a file exists
            <select className={styles.select} value={prefs.conflict} onChange={(e) => patch("conflict", e.target.value as UserPrefs["conflict"])}>
              <option value="uniquify">Rename</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </label>
          <label className={styles.label}>
            Preferred quality
            <select
              className={styles.select}
              value={prefs.preferredQuality}
              onChange={(e) => patch("preferredQuality", e.target.value as UserPrefs["preferredQuality"])}
            >
              <option value="auto">Auto (1080 then 720 then 480)</option>
              <option value="2160">2160p</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
            </select>
          </label>
          <label className={styles.label}>
            Max height
            <select className={styles.select} value={prefs.maxHeight} onChange={(e) => patch("maxHeight", e.target.value as UserPrefs["maxHeight"])}>
              <option value="auto">No cap</option>
              <option value="2160">4K</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
            </select>
          </label>
          <label className={styles.label}>
            Filename template
            <input className={styles.input} value={prefs.prompt} onChange={(e) => patch("prompt", e.target.value)} />
          </label>
          <p className={styles.hint}>Tokens: {"{title}"} {"{YYYYMMDD}"} {"{quality}"} {"{host}"} {"{index}"} {"{ext}"}</p>
          {templateWarnings.map((w) => (
            <p key={w} className={styles.hint} role="alert">
              {w}
            </p>
          ))}
          <label className={styles.label}>
            Quality mode
            <select className={styles.select} value={prefs.qualityMode} onChange={(e) => patch("qualityMode", e.target.value as UserPrefs["qualityMode"])}>
              <option value="balanced">Balanced</option>
              <option value="best">Best available</option>
              <option value="smallest">Smallest file</option>
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.requireAuthority} onChange={(e) => patch("requireAuthority", e.target.checked)} /> Ask me to
            confirm my right to save before each download
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.includeSubtitles}
              onChange={(e) => patch("includeSubtitles", e.target.checked)}
            />
            Include subtitles by default
          </label>
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Command line</legend>
          <label className={styles.label}>
            Default tool
            <select className={styles.select} value={prefs.cliTool} onChange={(e) => patch("cliTool", e.target.value as UserPrefs["cliTool"])}>
              {CLI_TOOLS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Shell
            <select className={styles.select} value={prefs.cliShell} onChange={(e) => patch("cliShell", e.target.value as UserPrefs["cliShell"])}>
              <option value="auto">Match this computer</option>
              {CLI_SHELLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.cliReferer} onChange={(e) => patch("cliReferer", e.target.checked)} /> Send the page as
            Referer
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.cliUserAgent} onChange={(e) => patch("cliUserAgent", e.target.checked)} /> Send this
            browser&apos;s User-Agent
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.cliYtdlpPage} onChange={(e) => patch("cliYtdlpPage", e.target.checked)} /> yt-dlp: use
            the page URL (its own extractors, your quality cap and subtitles)
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.cliAudioOnly} onChange={(e) => patch("cliAudioOnly", e.target.checked)} /> Audio
            only (ffmpeg / yt-dlp copy the soundtrack, never decrypt)
          </label>
          <p className={styles.hint}>
            Commands are quoted for the chosen shell. If a tool does not handle a stream type, the next suitable one is used.
          </p>
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Scan</legend>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.scan.hidden}
              onChange={(e) => patch("scan", { ...prefs.scan, hidden: e.target.checked })}
            />
            Hidden players and data-* URLs
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.scan.scripts}
              onChange={(e) => patch("scan", { ...prefs.scan, scripts: e.target.checked })}
            />
            URLs inside scripts
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.scan.iframes}
              onChange={(e) => patch("scan", { ...prefs.scan, iframes: e.target.checked })}
            />
            Same-origin iframes
          </label>
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Sites</legend>
          <label className={styles.label}>
            Allow only (empty = all)
            <textarea
              className={styles.textarea}
              rows={3}
              value={prefs.allowHosts.join("\n")}
              onChange={(e) => patch("allowHosts", parseHostList(e.target.value))}
            />
          </label>
          <label className={styles.label}>
            Never scan
            <textarea
              className={styles.textarea}
              rows={3}
              value={prefs.blockHosts.join("\n")}
              onChange={(e) => patch("blockHosts", parseHostList(e.target.value))}
            />
          </label>
          <p className={styles.hint}>One host per line, e.g. vimeo.com</p>
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Toolbar</legend>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.showBadge} onChange={(e) => patch("showBadge", e.target.checked)} /> Show count badge
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.goldIcon} onChange={(e) => patch("goldIcon", e.target.checked)} /> Gold icon when
            files found
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.notifyDone} onChange={(e) => patch("notifyDone", e.target.checked)} /> Notify when a
            download finishes
          </label>
          <label className={styles.label}>
            Theme
            <select className={styles.select} value={prefs.theme} onChange={(e) => patch("theme", e.target.value as UserPrefs["theme"])}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Diagnostics</legend>
          <p className={styles.hint}>A short log of refusals and failures. Addresses and tokens are removed. Nothing is sent anywhere.</p>
          <div>
            <button type="button" className={styles.primary} onClick={() => void copyDiagnostics()}>
              Copy log
            </button>{" "}
            <button type="button" className={styles.primary} onClick={() => void clearDiagnostics()}>
              Clear log
            </button>
          </div>
          {diagNote ? (
            <p className={styles.hint} role="status">
              {diagNote}
              {diag ? "" : ""}
            </p>
          ) : null}
        </fieldset>

        <fieldset className={group}>
          <legend className={styles.legend}>Your data</legend>
          <p className={styles.hint}>
            Everything stays on this device. There is no account, no server and no analytics. Download history and the log are
            deleted after {RETENTION_DAYS} days. Your saved list stays until you remove items.
          </p>
          <div>
            <button type="button" className={styles.primary} onClick={() => void erase()}>
              {eraseStep === "confirm" ? "Click again to erase everything" : "Erase all data"}
            </button>
          </div>
          {eraseStep === "done" ? (
            <p className={styles.hint} role="status">
              Erased. Settings are back to their defaults.
            </p>
          ) : null}
        </fieldset>

        {saved ? (
          <p className={`${styles.hint} ${styles.saved}`} role="status">
            Saved.
          </p>
        ) : null}
        <button type="submit" className={styles.primary}>
          Save
        </button>
      </form>
      <p className={styles.legal}>Krypton Ultimate Inc II</p>
    </div>
  );
}
