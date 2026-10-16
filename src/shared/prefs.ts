import { DEFAULT_PREFS, type UserPrefs } from "./types";

/** Fill missing keys after storage upgrades so old installs keep working. */
export function mergePrefs(partial?: Partial<UserPrefs> | null): UserPrefs {
  return {
    ...DEFAULT_PREFS,
    ...partial,
    scan: { ...DEFAULT_PREFS.scan, ...partial?.scan },
    allowHosts: partial?.allowHosts ?? DEFAULT_PREFS.allowHosts,
    blockHosts: partial?.blockHosts ?? DEFAULT_PREFS.blockHosts,
    activeBubbles: partial?.activeBubbles ?? DEFAULT_PREFS.activeBubbles,
  };
}

export function parseHostList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}
