import { describe, expect, it } from "vitest";
import { pruneByAge, pruneJobs, RETENTION_DAYS } from "./retention";
import type { DownloadJob } from "./types";

const DAY = 86_400_000;
const now = 1_000 * DAY;
const job = (patch: Partial<DownloadJob>): DownloadJob => ({
  id: "j", url: "https://x.example/a.mp4", filename: "a.mp4", title: "a", quality: "q", state: "complete", percent: 100, createdAt: now, ...patch,
});

describe("retention", () => {
  it("keeps thirty days", () => expect(RETENTION_DAYS).toBe(30));

  it("drops entries older than the window and keeps newer ones", () => {
    const items = [{ at: now - 31 * DAY }, { at: now - 29 * DAY }, { at: now }];
    expect(pruneByAge(items, (i) => i.at, now)).toEqual([{ at: now - 29 * DAY }, { at: now }]);
  });

  it("expires finished jobs but never one that is running or waiting to retry", () => {
    const old = now - 90 * DAY;
    const kept = pruneJobs(
      [
        job({ id: "done", createdAt: old }),
        job({ id: "failed", state: "interrupted", createdAt: old }),
        job({ id: "running", state: "in_progress", createdAt: old }),
        job({ id: "retrying", state: "interrupted", createdAt: old, nextRetryAt: now + 5_000 }),
        job({ id: "fresh", createdAt: now }),
      ],
      now,
    ).map((j) => j.id);
    expect(kept).toEqual(["running", "retrying", "fresh"]);
  });
});
