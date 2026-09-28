export function detectHlsProtection(text = '') {
  const signals = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^#EXT-X-(?:SESSION-)?KEY:/i.test(line.trim())) continue;
    const method =
      /METHOD=([^,]+)/i.exec(line)?.[1]?.replaceAll('"', '').toUpperCase() || 'UNKNOWN';
    signals.push(method === 'NONE' ? 'EXT-X-KEY method NONE' : `HLS encryption method ${method}`);
  }
  const isProtected = signals.some((signal) => !signal.endsWith('method NONE'));
  return {
    isProtected,
    category: isProtected ? 'encrypted_hls' : 'none',
    signals,
    reason: isProtected ? 'This playlist declares encrypted media.' : null,
    detectedAt: Date.now(),
  };
}

export function detectDashProtection(text = '') {
  const signals = [];
  if (/<(?:\w+:)?ContentProtection\b/i.test(text)) signals.push('DASH ContentProtection element');
  for (const [name, pattern] of [
    ['Widevine', /widevine|edef8ba9/i],
    ['PlayReady', /playready|9a04f079/i],
    ['FairPlay', /fairplay|skd:/i],
  ]) {
    if (pattern.test(text)) signals.push(`${name} protection indicator`);
  }
  const isProtected = signals.length > 0;
  return {
    isProtected,
    category: isProtected ? 'drm_dash' : 'none',
    signals,
    reason: isProtected ? 'This DASH manifest declares protected media.' : null,
    detectedAt: Date.now(),
  };
}

export function detectPageProtection(element) {
  const text =
    `${element?.getAttribute?.('type') ?? ''} ${element?.getAttribute?.('data-protection') ?? ''}`.toLowerCase();
  const protectedSignal = /drm|encrypted|widevine|playready|fairplay/.test(text);
  return {
    isProtected: protectedSignal,
    category: protectedSignal ? 'eme_indicator' : 'none',
    signals: protectedSignal ? ['Public page-level protection metadata'] : [],
    reason: protectedSignal ? 'The page declares protected media.' : null,
    detectedAt: Date.now(),
  };
}
