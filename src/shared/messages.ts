import type { DownloadJob, DownloadProgress, LibraryItem, ScanPayload, UserPrefs } from "./types";

/** Answer to START_DOWNLOAD. */
export type StartResult = { ok: true; jobId: string } | { ok: false; error: string; code?: string };

export type RuntimeMessage =
  | { type: "SCAN_RESULT"; payload: ScanPayload }
  | { type: "SOURCE_FOUND"; count: number }
  | { type: "GET_SCAN" }
  | { type: "SCAN_PAGE"; prefs: UserPrefs }
  | { type: "RESAN" }
  | { type: "GET_PREFS" }
  | { type: "SET_PREFS"; prefs: UserPrefs }
  | { type: "GET_HISTORY" }
  | { type: "CLEAR_HISTORY" }
  | { type: "OPEN_OPTIONS" }
  | { type: "OPEN_SIDEPANEL" }
  | { type: "GET_QUEUE" }
  | {
      type: "START_DOWNLOAD";
      url: string;
      filename: string;
      title: string;
      quality: string;
      subtitleUrls?: string[];
      authority?: { basis: string; confirmed: boolean };
    }
  | { type: "HLS_RUN"; jobId: string; url: string; filename: string; prefs: UserPrefs }
  | { type: "HLS_PROGRESS"; jobId: string; done: number; total: number; bytes: number }
  | { type: "HLS_READY"; jobId: string; blobUrl: string; filename: string; bytes: number }
  | { type: "HLS_FAILED"; jobId: string; code: string; message: string }
  | { type: "GET_LIBRARY" }
  | { type: "ADD_LIBRARY"; url: string }
  | { type: "UPDATE_LIBRARY"; id: string; patch: Partial<Pick<LibraryItem, "title" | "tags" | "note">> }
  | { type: "REMOVE_LIBRARY"; id: string }
  | { type: "GET_DIAGNOSTICS" }
  | { type: "CLEAR_DIAGNOSTICS" }
  | { type: "ERASE_ALL_DATA" }

  | { type: "DOWNLOAD_PROGRESS"; progress: DownloadProgress }
  | { type: "QUEUE_UPDATED"; jobs: DownloadJob[] }
  | { type: "DOWNLOAD_ERROR"; message: string };

export function isMessage(value: unknown): value is RuntimeMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}
