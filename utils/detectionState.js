const actionableTypes = new Set(['direct', 'audio', 'hls', 'dash']);

export function isScannablePage(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function getToolbarDetectionState(sources = []) {
  const protectedSource = sources.some((source) => source.protection?.isProtected);
  const actionableCount = sources.filter(
    (source) => actionableTypes.has(source.streamType) || source.protection?.isProtected,
  ).length;
  if (protectedSource) return { icon: 'protected', count: actionableCount, badge: '!' };
  if (actionableCount)
    return {
      icon: 'detected',
      count: actionableCount,
      badge: String(Math.min(actionableCount, 99)),
    };
  return { icon: 'default', count: 0, badge: '' };
}
