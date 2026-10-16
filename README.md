# KUI Video Extractor

![Krypton Ultimate Inc II](branding/krypton-ultimate-inc-ii.svg)

Extract the public video file from the page you are watching.

Publisher: **Krypton Ultimate Inc II**. Tools: Detect, Analyze, Quality, Library, Names.

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
