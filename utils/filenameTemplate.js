const forbidden = /[<>:"/\\|?*\u0000-\u001f]/g;
const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function sanitizeFilename(value, maxLength = 180) {
  let name = String(value || '')
    .replace(forbidden, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) name = 'media';
  if (reserved.test(name)) name = `_${name}`;
  return (
    [...name]
      .slice(0, maxLength)
      .join('')
      .replace(/[. ]+$/g, '') || 'media'
  );
}

export function renderFilename(template, values = {}) {
  const date = new Date(values.date ?? Date.now());
  const vars = {
    title: values.title || 'media',
    YYYYMMDD: date.toISOString().slice(0, 10).replaceAll('-', ''),
    quality: values.quality || 'unknown',
    bitrate: values.bitrate || 'unknown',
    origin: values.origin || 'media',
    ext: values.ext || 'mp4',
  };
  let rendered = String(template || '{title}.{ext}').replace(
    /\{([A-Za-z0-9_]+)\}/g,
    (_, key) => vars[key] ?? '',
  );
  const last = rendered.lastIndexOf('.');
  const ext = sanitizeFilename(vars.ext, 12).replace(/^\./, '');
  if (last < 0) rendered = `${rendered}.${ext}`;
  else if (rendered.slice(last + 1).toLowerCase() !== ext.toLowerCase())
    rendered = `${rendered.slice(0, last)}.${ext}`;
  return sanitizeFilename(rendered);
}
