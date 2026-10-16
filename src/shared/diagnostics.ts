import type { Diagnostic } from "./types";

export const MAX_DIAGNOSTICS = 200;

/** Remove anything that could carry a signed token: URLs and long opaque strings. */
export function redact(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[TOKEN]")
    .slice(0, 400);
}

export function addDiagnostic(
  list: Diagnostic[],
  entry: { severity?: Diagnostic["severity"]; code: string; message: string; host?: string },
  now: number = Date.now(),
  id: string = crypto.randomUUID(),
): Diagnostic[] {
  const item: Diagnostic = {
    id,
    at: now,
    severity: entry.severity ?? "info",
    code: entry.code,
    message: redact(entry.message),
    host: entry.host ? entry.host.slice(0, 120) : undefined,
  };
  return [...list, item].slice(-MAX_DIAGNOSTICS);
}

/** Plain text a user can paste into a bug report. Contains no URLs. */
export function exportDiagnostics(list: Diagnostic[]): string {
  if (!list.length) return "No diagnostics recorded.";
  return list
    .map((d) => `${new Date(d.at).toISOString()} ${d.severity.toUpperCase()} ${d.code}${d.host ? ` (${d.host})` : ""}: ${d.message}`)
    .join("\n");
}
