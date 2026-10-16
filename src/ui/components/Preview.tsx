import { useEffect, useState } from "react";
import type { Variant } from "../../shared/types";
import styles from "../finder.module.css";

type Props = { variant?: Variant; medium?: "video" | "audio" };

function isWebUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

function isAudio(variant: Variant, medium?: "video" | "audio"): boolean {
  return medium === "audio" || /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?|$)/i.test(variant.url);
}

function canPlay(variant: Variant, medium?: "video" | "audio"): boolean {
  if (!isWebUrl(variant.url)) return false;
  if (isAudio(variant, medium)) return true;
  return variant.kind === "progressive" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(variant.url);
}

export function Preview({ variant, medium }: Props) {
  const [armed, setArmed] = useState<string | null>(null);
  const url = variant?.url;
  useEffect(() => setArmed(null), [url]);

  if (!variant || variant.encrypted || !canPlay(variant, medium)) {
    return null;
  }

  if (armed === variant.url) {
    return isAudio(variant, medium) ? (
      <audio className={styles.preview} controls preload="metadata" src={variant.url} />
    ) : (
      <video className={styles.preview} controls playsInline preload="metadata" src={variant.url} />
    );
  }

  return (
    <button type="button" className={styles.stage} onClick={() => setArmed(variant.url)} aria-label="Play">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5-11-6.5z" />
      </svg>
    </button>
  );
}
