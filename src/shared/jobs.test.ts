import { describe, expect, it } from "vitest";
import { canRetry, canTransition, inspectQueue, isRetryable, reconcileJobs, retryDelayMs } from "./jobs";
import type { DownloadJob } from "./types";

const job = (patch: Partial<DownloadJob> = {}): DownloadJob => ({
  id: "j1",
  url: "https://cdn.example.com/a.mp4",
  filename: "a.mp4",
  title: "a",
  quality: "720p",
  state: "in_progress",
  percent: 10,
  createdAt: 1_000,
  chromeDownloadId: 7,
  ...patch,
});

describe("state machine", () => {
  it("allows only forward moves", () => {
    expect(canTransition("queued", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "complete")).toBe(true);
    expect(canTransition("interrupted", "queued")).toBe(true);
    expect(canTransition("complete", "in_progress")).toBe(false);
    expect(canTransition("complete", "interrupted")).toBe(false);
    expect(canTransition("queued", "queued")).toBe(true);
  });
});

describe("retry policy", () => {
  it("retries network failures and never permanent ones", () => {
    expect(isRetryable("NETWORK_FAILED")).toBe(true);
    expect(isRetryable("SERVER_FAILED")).toBe(true);
    expect(isRetryable("SERVER_FORBIDDEN")).toBe(false);
    expect(isRetryable("USER_CANCELED")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });

  it("stops after three attempts", () => {
    expect(canRetry(job({ state: "interrupted", errorCode: "NETWORK_FAILED", attempts: 2 }))).toBe(true);
    expect(canRetry(job({ state: "interrupted", errorCode: "NETWORK_FAILED", attempts: 3 }))).toBe(false);
    expect(canRetry(job({ state: "complete", errorCode: "NETWORK_FAILED" }))).toBe(false);
  });

  it("backs off exponentially, capped, with bounded jitter", () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1, () => 0)).toBe(2_000);
    expect(retryDelayMs(2, () => 0)).toBe(4_000);
    expect(retryDelayMs(3, () => 0)).toBe(8_000);
    expect(retryDelayMs(20, () => 0)).toBe(60_000);
    expect(retryDelayMs(1, () => 1)).toBe(2_500);
  });
});

describe("reconcileJobs after the worker was asleep", () => {
  it("completes a job that finished while the worker was stopped", () => {
    const r = reconcileJobs([job()], [{ id: 7, state: "complete" }], 5_000);
    expect(r.jobs[0]).toMatchObject({ state: "complete", percent: 100 });
    expect(r.changed).toHaveLength(1);
  });

  it("marks an interrupted download and keeps the reason", () => {
    const r = reconcileJobs([job()], [{ id: 7, state: "interrupted", error: "NETWORK_FAILED" }], 5_000);
    expect(r.jobs[0]).toMatchObject({ state: "interrupted", errorCode: "NETWORK_FAILED" });
  });

  it("flags a download Chrome no longer knows about", () => {
    const r = reconcileJobs([job()], [], 5_000);
    expect(r.jobs[0]).toMatchObject({ state: "interrupted", errorCode: "ORPHANED_DOWNLOAD" });
  });

  it("leaves a still-running download alone", () => {
    const r = reconcileJobs([job()], [{ id: 7, state: "in_progress" }], 5_000);
    expect(r.changed).toHaveLength(0);
    expect(r.jobs[0]?.state).toBe("in_progress");
  });

  it("fails a job that never got a browser id after the grace period", () => {
    const stuck = job({ state: "queued", chromeDownloadId: undefined });
    expect(reconcileJobs([stuck], [], 1_000 + 30_000).changed).toHaveLength(0);
    expect(reconcileJobs([stuck], [], 1_000 + 61_000).jobs[0]).toMatchObject({ state: "interrupted", errorCode: "START_INTERRUPTED" });
  });
});

describe("reconcileJobs for page-engine jobs", () => {
  const pageJob = (patch: Partial<DownloadJob> = {}) =>
    job({ engine: "page", chromeDownloadId: undefined, startedAt: 1_000, lastAt: 1_000, ...patch });

  it("keeps a job whose page is still reporting", () => {
    expect(reconcileJobs([pageJob()], [], 1_000 + 60_000).changed).toHaveLength(0);
  });

  it("stalls a job whose page went silent", () => {
    const r = reconcileJobs([pageJob()], [], 1_000 + 130_000);
    expect(r.jobs[0]).toMatchObject({ state: "interrupted", errorCode: "STALLED" });
  });

  it("leaves a job alone once the blob is handed to the browser", () => {
    expect(reconcileJobs([pageJob({ blobUrl: "blob:https://x/1" })], [], 1_000 + 500_000).changed).toHaveLength(0);
  });
});

describe("inspectQueue", () => {
  it("finds stale and duplicate live jobs", () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const stale = job({ id: "old", url: "https://cdn.example.com/old.mp4", createdAt: 1, chromeDownloadId: 1 });
    const a = job({ id: "a", createdAt: now - 1000 });
    const dup = job({ id: "b", createdAt: now - 500 });
    const done = job({ id: "c", state: "complete", createdAt: 1 });
    const r = inspectQueue([stale, a, dup, done], now);
    expect(r.staleIds).toEqual(["old"]);
    expect(r.duplicateIds).toEqual(["b"]);
  });
});
