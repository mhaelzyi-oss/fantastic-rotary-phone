const known = new Set(['title', 'YYYYMMDD', 'quality', 'bitrate', 'origin', 'ext']);

export function lintFilenameTemplate(template) {
  const warnings = [];
  const tokens = [...String(template).matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
  for (const token of tokens) if (!known.has(token)) warnings.push(`Unknown variable: {${token}}`);
  if ((String(template).match(/\{/g) || []).length !== tokens.length)
    warnings.push('Missing or extra brace detected.');
  if (!String(template).trim()) warnings.push('Filename template is empty.');
  if (/[<>:"/\\|?*]/.test(String(template)))
    warnings.push('Unsafe filename characters will be replaced.');
  return {
    warnings,
    suggestedTemplate: String(template).replace(/\{([^{}]*)\}/g, (_, token) =>
      known.has(token) ? `{${token}}` : '',
    ),
    valid: warnings.length === 0,
  };
}
