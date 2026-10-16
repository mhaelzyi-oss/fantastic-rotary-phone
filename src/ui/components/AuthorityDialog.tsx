import { useEffect, useRef, useState } from "react";
import { AUTHORITY_BASES } from "../../shared/trust";
import { useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";

/** Optional gate (Settings > Ask before downloading). The background checks the answer again. */
export function AuthorityDialog() {
  const ask = useFinderStore((s) => s.authorityAsk);
  const confirm = useFinderStore((s) => s.confirmAuthority);
  const cancel = useFinderStore((s) => s.cancelAuthority);
  const [basis, setBasis] = useState<string>("");
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (ask) {
      setBasis("");
      first.current?.focus();
    }
  }, [ask]);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, cancel]);

  if (!ask) return null;
  return (
    <div className={styles.scrim} role="presentation">
      <div className={`${styles.glass} ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby="authority-title">
        <h2 id="authority-title" className={styles.h3}>
          Before you download
        </h2>
        <p className={styles.infoHint}>
          Confirm you may save {ask.length === 1 ? "this file" : `these ${ask.length} files`}.
        </p>
        <label className={styles.label} htmlFor="authority-basis">
          Why can you save it?
        </label>
        <select id="authority-basis" ref={first} className={styles.select} value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="">Choose one</option>
          {AUTHORITY_BASES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.ghost} onClick={cancel}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!basis} onClick={() => void confirm(basis)}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
