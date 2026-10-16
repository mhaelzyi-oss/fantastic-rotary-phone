import type { CSSProperties } from "react";
import { formatBytes } from "../../shared/eta";
import { pickDefaultVariant } from "../../shared/quality";
import { kindPill, sourceLabel, useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";
import { BookmarkIcon, CheckIcon, DownloadIcon, FilmIcon, LockIcon, TerminalIcon } from "./icons";

type RowData = { indexes: number[] };

type Props = { index: number; style: CSSProperties; data?: RowData };

export function StreamRow({ index, style, data }: Props) {
  const sourceIndex = data?.indexes[index] ?? index;
  const source = useFinderStore((s) => s.scan.sources[sourceIndex]);
  const prefs = useFinderStore((s) => s.prefs);
  const picked = useFinderStore((s) => s.selected.includes(sourceIndex));
  const open = useFinderStore((s) => s.openIndex === sourceIndex);
  const toggleSelected = useFinderStore((s) => s.toggleSelected);
  const setOpenIndex = useFinderStore((s) => s.setOpenIndex);
  const queueDownload = useFinderStore((s) => s.queueDownload);
  const saveToLibrary = useFinderStore((s) => s.saveToLibrary);
  const saved = useFinderStore((s) => s.library.some((l) => l.url === s.scan.sources[sourceIndex]?.url));

  if (!source) return null;

  const variant = pickDefaultVariant(source.variants, prefs.preferredQuality, prefs.maxHeight);
  // DASH keeps audio and video in separate files. The browser cannot join them, so it offers the command instead.
  const dashOnly = source.kind === "dash" && !source.variants.some((v) => v.kind !== "dash" && !v.encrypted);
  const placement = source.placement === "hidden" ? "hidden" : source.placement === "offscreen" ? "off screen" : "";
  const tileClass = [styles.tile, source.encrypted ? styles.tileLocked : "", picked ? styles.tilePicked : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={style} className={styles.rowWrap}>
      <div className={open ? `${styles.row} ${styles.rowActive}` : styles.row}>
        <button
          type="button"
          className={tileClass}
          disabled={source.encrypted}
          aria-pressed={picked}
          aria-label={picked ? "Deselect stream" : "Select stream"}
          title={source.encrypted ? "Locked" : "Select for batch download"}
          onClick={() => toggleSelected(sourceIndex)}
        >
          {source.encrypted ? <LockIcon size={18} /> : picked ? <CheckIcon size={18} /> : source.medium === "audio" ? <DownloadIcon size={18} /> : <FilmIcon size={18} />}
        </button>
        <button
          type="button"
          className={styles.rowBody}
          aria-expanded={open}
          onClick={() => setOpenIndex(open ? null : sourceIndex)}
        >
          <span className={styles.rowTitle} title={source.url}>
            {sourceLabel(source, sourceIndex)}
          </span>
          <span className={styles.rowSub}>
            <span className={styles.rowHost}>
              {source.originHost ? `${source.originHost} · ` : ""}
              {variant?.label ?? source.kind}
            </span>
            {source.sizeEstimate ? <span className={styles.metaChip}>{formatBytes(source.sizeEstimate)}</span> : null}
            {placement ? <span className={styles.metaChip}>{placement}</span> : null}
          </span>
        </button>
        <div className={styles.rowActions}>
          <span className={styles.badge}>{kindPill(source.kind, source.medium)}</span>
          <button
            type="button"
            className={`${styles.actionTile} ${styles.actionMuted}`}
            aria-label="Show command"
            title="Command line"
            disabled={source.encrypted}
            onClick={() => setOpenIndex(sourceIndex)}
          >
            <TerminalIcon size={14} />
          </button>
          <button
            type="button"
            className={`${styles.actionTile} ${styles.actionMuted}`}
            aria-label={saved ? "Saved to library" : "Save to library"}
            title={saved ? "Saved to library" : "Save to library"}
            disabled={source.encrypted || saved}
            onClick={() => void saveToLibrary(sourceIndex)}
          >
            {saved ? <CheckIcon size={14} /> : <BookmarkIcon size={14} />}
          </button>
          <button
            type="button"
            className={styles.actionTile}
            aria-label="Download"
            title={dashOnly ? "DASH cannot be joined in the browser. Open the command panel." : "Download"}
            disabled={source.encrypted || dashOnly}
            onClick={() => void queueDownload(sourceIndex)}
          >
            <DownloadIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
