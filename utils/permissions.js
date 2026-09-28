export async function requestOriginPermission(origin) {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('Only HTTP and HTTPS origins are supported.');
  return chrome.permissions.request({ origins: [`${parsed.origin}/*`] });
}

export async function listOriginPermissions() {
  return chrome.permissions.getAll();
}

export async function removeOriginPermission(origin) {
  const parsed = new URL(origin);
  return chrome.permissions.remove({ origins: [`${parsed.origin}/*`] });
}
