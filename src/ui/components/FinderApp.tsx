import { useStorage } from "../lib/useStorage";
import { useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";
import { AuthorityDialog } from "./AuthorityDialog";
import { DownloadBubble } from "./DownloadBubble";
import { HistoryPanel } from "./HistoryPanel";
import { BookmarkIcon, ChevronIcon, ClockIcon, DownloadIcon, Logo, PanelIcon, RadioIcon, RefreshIcon, SlidersIcon, WrenchIcon } from "./icons";
import { ToolsPanel } from "./ToolsPanel";
import { Radar } from "./Radar";
import { SavedPanel } from "./SavedPanel";
import { StreamList } from "./StreamList";

const CHIPS = ["auto", "1080", "720", "480", "short", "subs"] as const;

type Props = { layout: "popup" | "panel" };

export function FinderApp({ layout }: Props) {
  useStorage();
  const prefs = useFinderStore((s) => s.prefs);
  const scan = useFinderStore((s) => s.scan);
  const tab = useFinderStore((s) => s.tab);
  const status = useFinderStore((s) => s.status);
  const openIndex = useFinderStore((s) => s.openIndex);
  const setTab = useFinderStore((s) => s.setTab);
  const setPrompt = useFinderStore((s) => s.setPrompt);
  const setSubs = useFinderStore((s) => s.setSubs);
  const applyChip = useFinderStore((s) => s.applyChip);
  const setOpenIndex = useFinderStore((s) => s.setOpenIndex);
  const rescan = useFinderStore((s) => s.rescan);
  const openOptions = useFinderStore((s) => s.openOptions);
  const openSidePanel = useFinderStore((s) => s.openSidePanel);

  const pressed = (id: string) =>
    (id === "subs" && prefs.includeSubtitles) ||
    (id === "short" && prefs.activeBubbles.includes("short")) ||
    (id === "auto" && prefs.preferredQuality === "auto") ||
    (id === "1080" && prefs.preferredQuality === "1080") ||
    (id === "720" && prefs.preferredQuality === "720") ||
    (id === "480" && prefs.preferredQuality === "480");

  return (
    <div className={`${styles.shell} ${layout === "panel" ? styles.panel : styles.popup}`}>
      <div className={styles.ornaments} aria-hidden="true">
        <svg className={styles.o1} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o2} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o3} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o4} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
        <svg className={styles.o5} viewBox="0 0 96 96"><path d="M48 7 83 27v42L48 89 13 69V27z" /><path d="m35 27 0 42m0-21 27-21M35 48l29 21" /></svg>
      </div>
      <header className={`${styles.glass} ${styles.top}`}>
        <div className={styles.brand}>
          <Logo size={30} className={styles.logo} />
          <div>
            <h1 className={styles.h1}>KUI Video Extractor</h1>
            <p className={styles.lede}>Find the public file on this page.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconBtn} aria-label="Rescan" title="Rescan" onClick={rescan}>
            <RefreshIcon size={15} />
          </button>
          {layout === "popup" && typeof chrome !== "undefined" && "sidePanel" in chrome ? (
            <button type="button" className={styles.iconBtn} aria-label="Side panel" title="Open side panel" onClick={openSidePanel}>
              <PanelIcon size={15} />
            </button>
          ) : null}
          <button type="button" className={styles.iconBtn} aria-label="Settings" title="Settings" onClick={openOptions}>
            <SlidersIcon size={15} />
          </button>
        </div>
      </header>

      <section className={`${styles.glass} ${styles.card} ${styles.radarCard}`} aria-label="Download radar">
        <div className={styles.sectionHead}>
          <h2 className={styles.h3}>{scan.sources.length ? `${scan.sources.length} stream${scan.sources.length === 1 ? "" : "s"}` : "Download radar"}</h2>
          <span className={styles.live}>
            <RadioIcon size={14} className={styles.liveIcon} /> Live
          </span>
        </div>
        <div className={styles.radarBody}>
          <Radar
            compact={layout === "popup"}
            sources={scan.sources}
            selectedIndex={openIndex}
            onPick={(index) => {
              setTab("streams");
              setOpenIndex(index);
            }}
          />
          {layout === "popup" ? (
            <p
              className={status.error ? `${styles.infoMain} ${styles.error}` : styles.infoMain}
              role="status"
              aria-live="polite"
            >
              {status.text || "Scanning this page…"}
            </p>
          ) : null}
        </div>
        {layout === "panel" ? (
          <p className={status.error ? `${styles.status} ${styles.error}` : styles.status} role="status" aria-live="polite">
            {status.text}
          </p>
        ) : null}
      </section>

      <nav className={`${styles.glass} ${styles.tabs}`} role="tablist" aria-label="Sections">
        <button
          type="button"
          role="tab"
          className={tab === "streams" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          aria-selected={tab === "streams"}
          onClick={() => setTab("streams")}
        >
          <DownloadIcon size={14} /> Streams
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "saved" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          aria-selected={tab === "saved"}
          onClick={() => setTab("saved")}
        >
          <BookmarkIcon size={14} /> Saved
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "history" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          <ClockIcon size={14} /> History
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "tools" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          aria-selected={tab === "tools"}
          onClick={() => setTab("tools")}
        >
          <WrenchIcon size={14} /> Tools
        </button>
      </nav>

      <section className={`${styles.glass} ${styles.cardTight}`}>
        {tab === "streams" ? <StreamList /> : tab === "saved" ? <SavedPanel /> : tab === "history" ? <HistoryPanel /> : <ToolsPanel compact={layout === "popup"} />}
      </section>
      <details className={`${styles.glass} ${styles.output}`}>
        <summary className={styles.summary}>
          <span>Output &amp; quality</span>
          <ChevronIcon size={14} className={styles.chev} />
        </summary>
        <div className={styles.outputBody}>
          <label className={styles.label} htmlFor="prompt">
            Filename template
          </label>
          <textarea
            id="prompt"
            className={styles.textarea}
            rows={2}
            spellCheck={false}
            value={prefs.prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className={styles.chips} role="group" aria-label="Presets">
            {CHIPS.map((id) => (
              <button
                key={id}
                type="button"
                className={pressed(id) ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                aria-pressed={pressed(id)}
                onClick={() => applyChip(id)}
              >
                {id === "auto" ? "Auto" : id === "subs" ? "Subs" : id === "short" ? "Short" : `${id}p`}
              </button>
            ))}
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={prefs.includeSubtitles} onChange={(e) => setSubs(e.target.checked)} />{" "}
            Include subtitles
          </label>
        </div>
      </details>
      <DownloadBubble />
      <AuthorityDialog />
      <p className={styles.footer}>Krypton Ultimate Inc II</p>
    </div>
  );
}
