export function variantPreferenceKey(variant) {
  return String(
    variant.id ??
      `${variant.height ?? 'x'}:${variant.bandwidth ?? 'x'}:${variant.codecs ?? ''}:${variant.frameRate ?? ''}:${variant.audioGroup ?? ''}:${variant.subtitleGroup ?? ''}`,
  );
}

export function recommendVariant(variants, mode = 'best_balance', options = {}) {
  const eligible = variants.filter(
    (variant) =>
      !variant.protection?.isProtected &&
      variant.eligible !== false &&
      (variant.height || variant.bitrate || variant.bandwidth || variant.estimatedSize),
  );
  if (!eligible.length) return { variant: null, reason: 'No eligible quality variant is known.' };
  const sorted = [...eligible].sort(
    (a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0),
  );
  const rememberedVariant =
    options.remembered &&
    eligible.find(
      (variant) =>
        variantPreferenceKey(variant) === String(options.remembered) ||
        variant.id === options.remembered ||
        variant.height === options.remembered,
    );
  if (rememberedVariant)
    return {
      variant: rememberedVariant,
      reason: 'Using your saved preference for this host.',
    };
  if (mode === 'best_quality')
    return {
      variant: sorted[0],
      reason: `Highest eligible resolution${sorted[0].height ? `: ${sorted[0].height}p` : ''}.`,
    };
  if (mode === 'smallest') {
    const variant = [...eligible].sort(
      (a, b) => (a.estimatedSize || Infinity) - (b.estimatedSize || Infinity),
    )[0];
    return { variant, reason: 'Smallest eligible estimated file.' };
  }
  if (mode === 'fastest') {
    const sized = eligible.filter((variant) => variant.estimatedSize > 0);
    if (!(options.bytesPerSecond > 0) || !sized.length)
      return {
        variant: null,
        reason:
          'A file-size estimate and observed download speed are needed to predict the fastest option.',
      };
    const ranked = sized.sort((a, b) => a.estimatedSize - b.estimatedSize);
    const withinTime = ranked.filter(
      (variant) => variant.estimatedSize / options.bytesPerSecond <= (options.targetSeconds || 300),
    );
    if (!withinTime.length)
      return {
        variant: ranked[0],
        reason: 'No option meets the target; selected the smallest estimated transfer.',
      };
    const variant = [...withinTime].sort(
      (a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0),
    )[0];
    return { variant, reason: 'Highest quality estimated to meet the target download time.' };
  }
  const preferred =
    sorted.find((variant) => variant.height === 1080) ||
    sorted.find((variant) => variant.height === 720) ||
    sorted.find((variant) => variant.height === 480) ||
    sorted[0];
  return {
    variant: preferred,
    reason: `${preferred.height ? `${preferred.height}p` : 'This option'} balances visual quality and estimated size.`,
  };
}
