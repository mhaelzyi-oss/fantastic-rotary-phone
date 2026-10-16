/** Allow/block host rules. Empty allow list means all hosts (except block list). */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

export function hostFromUrl(pageUrl: string): string {
  try {
    return normalizeHost(new URL(pageUrl).hostname);
  } catch {
    return "";
  }
}

export function hostMatches(pageHost: string, rule: string): boolean {
  const host = normalizeHost(pageHost);
  const r = normalizeHost(rule);
  if (!host || !r) return false;
  return host === r || host.endsWith(`.${r}`);
}

export function hostAllowed(pageUrl: string, allow: string[], block: string[]): boolean {
  const host = hostFromUrl(pageUrl);
  if (!host) return false;
  if (block.some((r) => hostMatches(host, r))) return false;
  if (allow.length && !allow.some((r) => hostMatches(host, r))) return false;
  return true;
}
