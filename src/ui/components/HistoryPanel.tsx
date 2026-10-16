import { filterHistory } from "../../shared/history";
import { copyText } from "../lib/clipboard";
import { useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";
import { CheckIcon, CopyIcon, DownloadIcon, LockIcon } from "./icons";

export function HistoryPanel() {
  const history = useFinderStore((s) => s.history);
  const query = useFinderStore((s) => s.historyQuery);
  const setHistoryQuery = useFinderStore((s) => s.setHistoryQuery);
  const clearHistory = useFinderStore((s) => s.clearHistory);
  const retryHistory = useFinderStore((s) => s.retryHistory);
  const rows = filterHistory(history, query);

  return (
    <section>
      <div className={styles.listBar}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search downloads"
          value={query}
          onChange={(e) => setHistoryQuery(e.target.value)}
        />
        <button type="button" className={styles.ghost} onClick={() => void clearHistory()}>
          Clear
        </button>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>No downloads yet.</p>
      ) : (
        <ul className={styles.history}>
          {rows.map((item) => (
            <li key={item.id} className={styles.historyRow}>
              <span className={`${styles.tile} ${item.ok ? styles.tileOk : styles.tileFail}`} aria-hidden="true">
                {item.ok ? <CheckIcon size={18} /> : <LockIcon size={18} />}
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{item.filename}</span>
                <span className={styles.rowSub}>
                  {item.ok ? "Saved" : "Failed"} · {item.quality} · {new Date(item.at).toLocaleString()}
                </span>
              </span>
              <span className={styles.rowActions}>
                <button
                  type="button"
                  className={`${styles.actionTile} ${styles.actionMuted}`}
                  aria-label="Copy URL"
                  title="Copy URL"
                  onClick={() => void copyText(item.url)}
                >
                  <CopyIcon size={14} />
                </button>
                <button
                  type="button"
                  className={styles.actionTile}
                  aria-label="Retry"
                  title="Retry"
                  onClick={() => retryHistory(item)}
                >
                  <DownloadIcon size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
