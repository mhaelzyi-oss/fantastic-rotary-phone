import type { CSSProperties } from "react";
import type { MediaItem } from "../../shared/types";
import { layoutBlips } from "../lib/radar";
import styles from "./Radar.module.css";

type Props = {
  sources: MediaItem[];
  selectedIndex: number | null;
  onPick: (index: number) => void;
  compact?: boolean;
};

/**
 * Download radar. The beam sweeps once every 3.2s; each detected stream sits at a fixed spot and
 * pings at the moment the beam crosses it. Higher quality sits nearer the center.
 */
export function Radar({ sources, selectedIndex, onPick, compact = false }: Props) {
  const blips = layoutBlips(sources);
  const label = sources.length ? `${sources.length} stream${sources.length === 1 ? "" : "s"}` : "Scanning";

  return (
    <div className={styles.wrap}>
      <div className={compact ? `${styles.radar} ${styles.compact}` : styles.radar} role="group" aria-label={label} data-testid="radar" data-state={sources.length ? "found" : "scanning"}>
        <span className={`${styles.ring} ${styles.r1}`} />
        <span className={`${styles.ring} ${styles.r2}`} />
        <span className={`${styles.ring} ${styles.r3}`} />
        <span className={styles.crossH} />
        <span className={styles.crossV} />
        <span className={styles.sweep} />
        <span className={styles.core}>
          <strong>{sources.length}</strong>
          <small>{sources.length === 1 ? "stream" : "streams"}</small>
        </span>
        {blips.map((b) => (
          <button
            key={b.id}
            type="button"
            className={styles.blip}
            data-locked={b.locked}
            data-selected={selectedIndex === b.index}
            data-testid="radar-blip"
            style={{ left: `${b.x}%`, top: `${b.y}%`, "--a": b.angle } as CSSProperties}
            aria-label={b.label}
            title={b.label}
            onClick={() => onPick(b.index)}
          />
        ))}
      </div>
    </div>
  );
}
