# KUI Video Extractor

![Krypton Ultimate Inc II](branding/krypton-ultimate-inc-ii.svg)

Find the public file on this page.

Publisher: **Krypton Ultimate Inc II**.

**Extractor** is the browser extension. It finds the public file on the page you are watching and lets you save it.

These local file tools run inside the extension (Tools tab) and from a downloaded zip. They read files you already have. They do not fetch media from the web:

- **Video Converter** — remux a local file to a clean MP4
- **Video Compressor** — make a local video smaller
- **Video Trimmer** — keep a time range
- **Video Merger** — join local clips
- **Video to GIF** — turn a local clip into a GIF
- **Audio Extractor** — pull the soundtrack from a local video
- **Add Music** — mux a local audio file onto a local video

## Install

```bash
npm install
npm run build
```

Chrome / Edge / Brave: `chrome://extensions` (or `edge://extensions` / `brave://extensions`) → Developer mode → Load unpacked → `dist`.

Firefox:

```bash
npm run build:firefox
```

Then `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist-firefox/manifest.json`.

## Develop

```bash
npm test
npm run demo
```
