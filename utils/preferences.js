export function applyPreferences(settings, root = document.documentElement) {
  const theme = settings?.theme || 'dark';
  const motion = settings?.reduceMotionOverride || 'system';
  const glass = settings?.liquidGlassIntensity || 'standard';
  root.dataset.theme =
    theme === 'system'
      ? globalThis.matchMedia?.('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  root.dataset.motion =
    motion === 'system'
      ? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'reduce'
        : 'full'
      : motion;
  root.style.setProperty(
    '--glass-blur',
    glass === 'low' ? '10px' : glass === 'high' ? '32px' : '22px',
  );
}
