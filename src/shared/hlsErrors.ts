export type HlsErrorCode = "NETWORK" | "FORBIDDEN" | "ENCRYPTED" | "LIVE" | "EMPTY" | "TOO_LARGE" | "ABORTED";

export class HlsError extends Error {
  readonly code: HlsErrorCode;
  constructor(code: HlsErrorCode, message: string) {
    super(message);
    this.name = "HlsError";
    this.code = code;
  }
}

export function hlsStreamError(code: HlsErrorCode, message: string): HlsError {
  return new HlsError(code, message);
}

/** Interrupt-style codes so the queue's retry rules apply: only network trouble is worth retrying. */
export function hlsCodeToJobCode(code: HlsErrorCode): string {
  switch (code) {
    case "NETWORK":
      return "NETWORK_FAILED";
    case "FORBIDDEN":
      return "SERVER_FORBIDDEN";
    case "ENCRYPTED":
      return "BLOCKED";
    case "ABORTED":
      return "USER_CANCELED";
    case "TOO_LARGE":
      return "FILE_TOO_LARGE";
    case "LIVE":
    case "EMPTY":
      return "SERVER_BAD_CONTENT";
    default:
      return "START_FAILED";
  }
}
