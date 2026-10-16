import { formatEta } from "../../shared/eta";
import { progressKey, useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";

export function DownloadBubble() {
  const progress = useFinderStore((s) => s.progress);
  const jobs = useFinderStore((s) => s.jobs);
  const active = Object.values(progress);
  const fromJobs = jobs.filter((j) => j.state === "in_progress" || j.state === "queued");
  if (!active.length && !fromJobs.length) return null;

  const running = active.filter((j) => j.state === "in_progress");
  const done = active.filter((j) => j.state === "complete").length;
  const failed = active.filter((j) => j.state === "interrupted");
  const avg =
    running.length > 0
      ? running.reduce((sum, j) => sum + j.percent, 0) / running.length
      : active.length && done === active.length
        ? 100
        : 0;

  return (
    <aside className={`${styles.glass} ${styles.bubble}`} aria-live="polite">
      <p className={styles.bubbleHead}>
        <span>
          {running.length ? `Downloading ${running.length} file${running.length === 1 ? "" : "s"}` : "Downloads"}
        </span>
        <span className={styles.badge}>{Math.round(avg)}%</span>
      </p>
      <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(avg)}>
        <span className={styles.fill} style={{ width: `${avg}%` }} />
      </div>
      <p className={styles.progressMeta}>
        {failed.length
          ? (failed[0]?.error ?? "A download was interrupted.")
          : `${formatEta(running[0]?.etaSeconds ?? null)} · ${done} saved`}
      </p>
      <ul className={styles.dlItems}>
        {active.slice(-4).map((job) => (
          <li key={progressKey(job)}>
            {job.filename ?? "file"} ·{" "}
            {job.state === "complete" ? "saved" : job.state === "interrupted" ? "failed" : `${Math.round(job.percent)}%`}
          </li>
        ))}
      </ul>
    </aside>
  );
}
