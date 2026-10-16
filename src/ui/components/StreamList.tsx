import { useEffect, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import { buildBatchScript, buildUrlList } from "../../shared/cli";
import { formatBytes } from "../../shared/eta";
import { variantLabel } from "../../shared/quality";
import type { MediaItem } from "../../shared/types";
import { copyText } from "../lib/clipboard";
import { useFinderStore } from "../state/finderStore";
import styles from "../finder.module.css";
import { CommandPanel } from "./CommandPanel";
import { CheckIcon, DownloadIcon, ScriptIcon } from "./icons";
import { PageFallback } from "./PageFallback";
import { Preview } from "./Preview";
import { StreamRow } from "./StreamRow";

const ROW = 71; // 61px row + 10px gap
const MAX_VISIBLE = 4;

type MediumFilter = "all" | "video" | "audio";

function matchesFilter(source: MediaItem, filter: MediumFilter): boolean {
  if (filter === "audio") return source.medium === "audio";
  if (filter === "video") return source.medium !== "audio";
  return true;
}

export function StreamList() {
  const sources = useFinderStore((s) => s.scan.sources);
  const openIndex = useFinderStore((s) => s.openIndex);
  const selected = useFinderStore((s) => s.selected);
  const setOpenIndex = useFinderStore((s) => s.setOpenIndex);
  const toggleSelectAll = useFinderStore((s) => s.toggleSelectAll);
  const queueSelected = useFinderStore((s) => s.queueSelected);
  const queueDownload = useFinderStore((s) => s.queueDownload);
  const setVariantUrl = useFinderStore((s) => s.setVariantUrl);
  const variantFor = useFinderStore((s) => s.variantFor);
  const cliInputFor = useFinderStore((s) => s.cliInputFor);
  useFinderStore((s) => s.variantUrl);
  const [copied, setCopied] = useState<"script" | "urls" | "url" | null>(null);
  const [filter, setFilter] = useState<MediumFilter>("all");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const downloadable = sources.filter((s) => !s.encrypted);
  const indexes = sources.flatMap((source, index) => (matchesFilter(source, filter) ? [index] : []));
  const visibleDownloadable = indexes.filter((index) => sources[index] && !sources[index].encrypted);
  const chosen = (filter === "all" ? selected : selected.filter((index) => indexes.includes(index))).filter(
    (index) => sources[index] && !sources[index].encrypted,
  );

  useEffect(() => {
    if (openIndex == null) return;
    const source = sources[openIndex];
    if (!source || matchesFilter(source, filter)) return;
    setFilter(source.medium === "audio" ? "audio" : "video");
  }, [openIndex, sources, filter]);
  const open = openIndex != null ? sources[openIndex] : undefined;
  const variant = openIndex != null ? variantFor(openIndex) : undefined;
  const allOn =
    filter === "all"
      ? downloadable.length > 0 && selected.length === downloadable.length
      : visibleDownloadable.length > 0 && visibleDownloadable.every((index) => selected.includes(index));

  function chooseFilter(next: MediumFilter) {
    setFilter(next);
    if (openIndex != null && sources[openIndex] && !matchesFilter(sources[openIndex], next)) setOpenIndex(null);
  }

  function selectVisible(on: boolean) {
    if (filter === "all") {
      toggleSelectAll(on);
      return;
    }
    const visible = new Set(visibleDownloadable);
    const current = useFinderStore.getState().selected;
    useFinderStore.setState({
      selected: on ? [...new Set([...current, ...visibleDownloadable])] : current.filter((index) => !visible.has(index)),
    });
  }

  function flash(kind: "script" | "urls" | "url") {
    setCopied(kind);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1600);
  }

  async function copyBatch(kind: "script" | "urls") {
    const inputs = chosen.flatMap((i) => {
      const input = cliInputFor(i);
      return input ? [input] : [];
    });
    const text =
      kind === "script"
        ? buildBatchScript(inputs).script
        : buildUrlList(inputs.filter((i) => !i.encrypted).map((i) => i.url));
    if (!text || !(await copyText(text))) return;
    flash(kind);
  }

  async function copyOpenUrl() {
    const url = variant?.url ?? open?.url;
    if (!url || open?.encrypted || variant?.encrypted || !(await copyText(url))) return;
    flash("url");
  }

  async function downloadChosen() {
    if (filter === "all") {
      await queueSelected();
      return;
    }
    if (!chosen.length) {
      useFinderStore.setState({ status: { text: "Select one or more files, then download.", error: true } });
      return;
    }
    for (const index of chosen) await queueDownload(index);
  }

  const openVisible = openIndex != null && indexes.includes(openIndex);
  const urlLocked = Boolean(open?.encrypted || variant?.encrypted);

  return (
    <div>
      {sources.length > 0 ? (
        <div className={styles.filters} role="group" aria-label="Stream type">
          {(["all", "video", "audio"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={filter === id ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              aria-pressed={filter === id}
              onClick={() => chooseFilter(id)}
            >
              {id === "all" ? "All" : id === "video" ? "Video" : "Audio"}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.listBar}>
        <label className={styles.selectAll}>
          <input type="checkbox" checked={allOn} onChange={(e) => selectVisible(e.target.checked)} /> Select all
        </label>
        <button type="button" className={styles.primary} disabled={filter === "all" ? !downloadable.length : !visibleDownloadable.length} onClick={() => void downloadChosen()}>
          <DownloadIcon size={14} /> Download selected
        </button>
      </div>
      {chosen.length > 0 ? (
        <div className={styles.batch} data-testid="batch-bar">
          <button type="button" className={styles.ghost} onClick={() => void copyBatch("script")}>
            {copied === "script" ? <CheckIcon size={13} /> : <ScriptIcon size={13} />}
            {copied === "script" ? "Copied" : `Copy script (${chosen.length})`}
          </button>
          <button type="button" className={styles.ghost} onClick={() => void copyBatch("urls")}>
            {copied === "urls" ? <CheckIcon size={13} /> : <ScriptIcon size={13} />}
            {copied === "urls" ? "Copied" : "Copy URL list"}
          </button>
        </div>
      ) : null}
      {sources.length === 0 ? (
        <>
          <p className={styles.empty}>No streams yet. Play the page, then rescan.</p>
          <PageFallback />
        </>
      ) : indexes.length === 0 ? (
        <p className={styles.empty}>{filter === "audio" ? "No audio on this page." : "No video on this page."}</p>
      ) : (
        <div className={styles.listHost} data-testid="stream-list">
          <FixedSizeList
            height={Math.min(indexes.length, MAX_VISIBLE) * ROW}
            itemCount={indexes.length}
            itemSize={ROW}
            width="100%"
            itemData={{ indexes }}
          >
            {StreamRow}
          </FixedSizeList>
        </div>
      )}
      {open && openVisible ? (
        <div className={`${styles.glass} ${styles.detail}`}>
          <Preview variant={variant} medium={open.medium} />
          {open.encrypted ? null : (
            <label>
              <span className={styles.label}>Quality</span>
              <select
                className={styles.select}
                value={variant?.url ?? ""}
                onChange={(e) => setVariantUrl(openIndex, e.target.value)}
              >
                {open.variants.map((v) => (
                  <option key={v.url} value={v.url} disabled={v.encrypted}>
                    {variantLabel(v)}
                    {v.encrypted ? " (encrypted)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <dl className={styles.facts}>
            <dt className={styles.dt}>Title</dt>
            <dd className={styles.dd}>{open.title || "—"}</dd>
            <dt className={styles.dt}>Size</dt>
            <dd className={styles.dd}>{open.sizeEstimate ? formatBytes(open.sizeEstimate) : "—"}</dd>
            <dt className={styles.dt}>Resolution</dt>
            <dd className={styles.dd}>
              {variant?.height ? `${variant.width ?? "?"}×${variant.height}` : open.resolution ?? "—"}
            </dd>
            <dt className={styles.dt}>Codec</dt>
            <dd className={styles.dd}>{variant?.codecs ?? open.codec ?? "—"}</dd>
            <dt className={styles.dt}>URL</dt>
            <dd className={`${styles.dd} ${styles.urlLine}`}>
              <span className={styles.urlText}>{variant?.url ?? open.url}</span>
              {urlLocked ? null : (
                <button type="button" className={styles.ghost} aria-label="Copy stream URL" onClick={() => void copyOpenUrl()}>
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              )}
            </dd>
            <dt className={styles.dt}>Host</dt>
            <dd className={styles.dd}>{open.originHost || "—"}</dd>
          </dl>
          <CommandPanel index={openIndex} />
          <div style={{ marginTop: 12 }}>
            <button type="button" className={styles.primary} disabled={open.encrypted} onClick={() => void queueDownload(openIndex)}>
              <DownloadIcon size={14} /> Download
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
