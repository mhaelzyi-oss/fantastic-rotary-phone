export function findTrustedSource(tabRecord, requestedSource) {
  if (!tabRecord || !requestedSource) return null;
  return (
    tabRecord.sources?.find(
      (source) =>
        source.id === requestedSource.id &&
        source.canonicalUrl === requestedSource.canonicalUrl &&
        source.src === requestedSource.src,
    ) || null
  );
}

export function mergeSourceAnalysis(source, analysis) {
  const incomingProtection = analysis?.protection || {};
  const existingProtection = source.protection || {};
  const isProtected = Boolean(existingProtection.isProtected || incomingProtection.isProtected);
  const signals = [
    ...new Set([...(existingProtection.signals || []), ...(incomingProtection.signals || [])]),
  ];
  return {
    ...source,
    variants: Array.isArray(analysis?.variants) ? analysis.variants : source.variants,
    subtitles: Array.isArray(analysis?.subtitles) ? analysis.subtitles : source.subtitles,
    live: typeof analysis?.live === 'boolean' ? analysis.live : source.live,
    protection: {
      ...existingProtection,
      ...incomingProtection,
      isProtected,
      signals,
      category: isProtected
        ? (incomingProtection.isProtected && incomingProtection.category) ||
          existingProtection.category
        : 'none',
      reason: isProtected ? incomingProtection.reason || existingProtection.reason : null,
    },
  };
}
