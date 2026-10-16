import { useState } from "react";
import { parseTags } from "../../shared/library";
import { copyText } from "../lib/clipboard";
import { useFinderStore, visibleLibrary } from "../state/finderStore";
import styles from "../finder.module.css";
import { CopyIcon, DownloadIcon, FilmIcon, TrashIcon } from "./icons";

export function SavedPanel() {
  const library = useFinderStore((s) => s.library);
  const query = useFinderStore((s) => s.libraryQuery);
  const setQuery = useFinderStore((s) => s.setLibraryQuery);
  const update = useFinderStore((s) => s.updateLibraryItem);
  const remove = useFinderStore((s) => s.removeLibraryItem);
  const download = useFinderStore((s) => s.downloadLibraryItem);
  const [editing, setEditing] = useState<string | null>(null);
  const rows = visibleLibrary(library, query);

  return (
    <section aria-label="Saved sources">
      <div className={styles.listBar}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search saved (title, tag, note)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>{library.length ? "Nothing matches." : "Nothing saved yet. Use the bookmark on a stream."}</p>
      ) : (
        <ul className={styles.history}>
          {rows.map((item) => (
            <li key={item.id} className={styles.historyRow}>
              <span className={styles.tile} aria-hidden="true">
                <FilmIcon size={18} />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle} title={item.url}>
                  {item.title}
                </span>
                <span className={styles.rowSub}>
                  {item.originHost}
                  {item.tags.length ? ` · ${item.tags.map((t) => `#${t}`).join(" ")}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
                {editing === item.id ? (
                  <input
                    className={styles.search}
                    aria-label="Tags, separated by commas"
                    placeholder="tags, separated, by commas"
                    defaultValue={item.tags.join(", ")}
                    autoFocus
                    onBlur={(e) => {
                      void update(item.id, { tags: parseTags(e.target.value) });
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                ) : null}
              </span>
              <span className={styles.rowActions}>
                <button type="button" className={`${styles.actionTile} ${styles.actionMuted}`} aria-label="Edit tags" title="Edit tags" onClick={() => setEditing(item.id)}>
                  #
                </button>
                <button type="button" className={`${styles.actionTile} ${styles.actionMuted}`} aria-label="Copy URL" title="Copy URL" onClick={() => void copyText(item.url)}>
                  <CopyIcon size={14} />
                </button>
                <button type="button" className={`${styles.actionTile} ${styles.actionMuted}`} aria-label="Remove from library" title="Remove" onClick={() => void remove(item.id)}>
                  <TrashIcon size={14} />
                </button>
                <button type="button" className={styles.actionTile} aria-label="Download" title="Download" onClick={() => void download(item)}>
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
