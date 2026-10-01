# Video Pro Finder

![Krypton Ultimate Inc II](branding/krypton-ultimate-inc-ii.svg)

Video Pro Finder is an original Manifest V3 extension for finding media URLs already exposed by a page, classifying them locally, and starting browser-native downloads only for eligible direct sources after an authority declaration.

Publisher: Krypton Ultimate Inc II.

## Product boundaries

The extension is local-first and does not send detected URLs, titles, history, declarations, or diagnostics to a service. Telemetry is disabled. Detection is not proof of ownership, permission, or a right to redistribute media.

Protected or encrypted media is blocked. Video Pro Finder never retrieves encryption keys, requests licences, inspects CDM or protected-player internals, decrypts content, captures decrypted output, or bypasses protected playback. Torrent files and magnet links are unsupported and are never parsed, resolved, or downloaded. The extension does not bypass authentication, CORS, signed URLs, paywalls, geo-restrictions, rate limits, or platform restrictions.

## Features

- On-demand scan of ordinary media elements, typed links, Open Graph metadata, and JSON-LD.
- Source classification for direct video/audio, HLS, DASH, subtitles, unknown URLs, and unsupported torrent/magnet links.
- HLS master/media parser and DASH manifest parser modules; protection detection is shared with eligibility checks.
- Protected-media and unsupported-source blocking before download controls are offered.
- Authority declaration before eligible direct downloads through `chrome.downloads`.
- Local queue, history, saved-source library, settings, and diagnostic helpers.
- Quality recommendation, safe filename generation, throughput/ETA helpers, and bounded retry policy.
- Editable default prompt and local presets, manually authorized retry, and sanitized diagnostic export.
- Authority-gated caption saving for listed, accessible VTT/SRT sidecars when enabled in settings.
- Context actions for scanning, inspecting/preparing links, saving references, and copying URLs.
- Atomic library/host-preference updates and startup recovery for interrupted queue entries.
- Full-page dashboard opened from the toolbar, with native direct-media preview, expanded media metadata, a live download radar, and opt-in automatic detection for granted sites.
- Popup, settings, local library, resources/privacy pages, fictional demo fixtures, tests, and ZIP packaging.

## Source support and limitations

Direct MP4, WebM, M4V, MOV, MP3, M4A, OGG, WAV sources and listed VTT/SRT sidecars can be saved through the browser downloads API after an authority declaration, when browser policy and server access permit. The popup can explicitly analyze accessible HLS/DASH manifests and display quality variants and subtitle renditions, but this browser-only UI does not download or package adaptive-stream variants, merge segments, or convert them into files. Live streams are not downloadable. The fastest-quality recommendation is shown only when file-size and observed-throughput estimates are available; otherwise the UI explains why it cannot estimate.

CORS and host permissions limit which manifests can be read. Authenticated sources and signed URLs can fail, expire, or require official provider workflows. Native HLS playback varies by browser. DASH playback and packaging are not provided. Browser-native downloads handle large files without buffering them in extension memory, but available disk space, network throughput, server behavior, download policy, and service-worker suspension remain browser/platform constraints. Speed and ETA are estimates; the extension cannot exceed browser, server, or network limits. No universal video downloading or conversion is claimed.

## Architecture

- `background.js`: synchronously registers MV3 listeners, initializes context menus, coordinates local storage and browser downloads.
- `content.js` and `utils/sourceScanner.js`: scan ordinary DOM media metadata after an explicit user action; no fetch/XHR interception or credential access.
- `utils/sourceNormalizer.js`, `sourceEligibility.js`, and `protectionDetector.js`: shared source classification and hard policy gates.
- `utils/playlistParser.js`: parsers for accessible manifests. The popup's explicit Analyze action fetches a bounded manifest without credentials, subject to page-origin CORS, then stores variants and public protection signals locally.
- `utils/storage.js` and `schema.js`: versioned `chrome.storage.local` state and basic migration/recovery.
- `dashboard.html` / `dashboard.js`: full-page scan, review, analyze, save, copy, native preview, authority-gated download, quality advice, and download radar. The toolbar opens this page with the originating tab ID.
- `popup.html` / `popup.js`: compact legacy popup UI, retained for compatibility and isolated UI tests; the toolbar action opens the dashboard instead.
- `options.html`, `library.html`, and `resources.html`: local preferences and permissions, saved references with notes/tags/sorting, history, and policy guidance.

The content scanner does not instrument EME, inspect private application state, read cookies/forms, or inspect browser memory. `demo/edge_tabs_fixture.json` is inert sample JSON; it is not executed, navigated to, or fetched.

## Permissions

- `activeTab`: allows a user-requested scan of the current tab without default permanent host access.
- `storage`: stores settings, source references, queue, history, and diagnostics locally.
- `downloads`: starts and observes browser-native direct downloads.
- `contextMenus`: offers page scan, link staging, local save, and explicit clipboard-copy actions. Preparing a link never bypasses the authority gate.
- `scripting`: injects the bundled scanner only after the user requests a scan.
- `offscreen` and `clipboardWrite`: copy a link after the user selects the context-menu copy action, using an offscreen clipboard document.
- Optional `http` / `https` host access: declared as optional for explicit user grants; broad access is not requested automatically.
- Optional `notifications`: reserved, not currently used.

No remote executable code or analytics are used. Interface fonts use local system fallbacks; extension pages do not load third-party font resources.

## Install in Chrome or Edge

1. Run `npm ci` and `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode and choose **Load unpacked**.
4. Select the repository's `chrome-extension/` directory.
5. Open a normal HTTP(S) page and select the extension icon to open the full-page dashboard. Use Scan page for a one-time scan, or explicitly grant all-sites permission in the dashboard to enable automatic HTTP(S) page scans.

Browser-internal pages, extension stores, and some PDF/viewer pages do not permit content-script injection. Granting an optional host permission does not override those browser restrictions.

## Development

Requirements: Node.js 22 LTS and npm. Linux E2E uses the bundled serverless Chromium binary; on macOS and Windows install a Playwright browser with `npx playwright install chromium`.

```sh
npm ci
npm run dev
npm run watch
npm run build
npm run lint
npm run format
npm run format:check
npm test
npm run test:e2e
npm run package
npm run ci
```

The local fixtures are served by Vite at `/demo/test.html`. Fixture media is intentionally non-playable text; no external sites or media services are used. `npm run build` creates a visible, loadable extension in `chrome-extension/`. `npm run package` also writes a Chrome-compatible CRX3 at `release/video-pro-finder.crx` and a companion ZIP at `release/video-pro-finder.zip`. Its signing key is kept at `release/video-pro-finder.pem`, which is ignored by Git. Keep a private backup of that PEM to publish updates with the same extension ID. CRX3 is generated by CRX3 tooling because Chrome itself is not installed in the build container.

## Tests and CI

Jest unit tests cover normalization, hard eligibility blocks, HLS parsing/protection, quality selection, filenames, authorization, queue transitions, retry limits, diagnostics, bandwidth, ETA, and watch-later helpers. Playwright exercises the local fixture page and scanner. GitHub Actions runs format checks, lint, unit tests, build, E2E, ZIP packaging, and uploads the ZIP artifact and failure test output.

## Local records and data controls

Settings, saved-source metadata, download history, and queue records live in `chrome.storage.local`. Source URLs can contain short-lived access tokens, so treat exports and local browser profiles as sensitive. The library JSON export asks for confirmation. Settings includes a clear-local-data action. Authority declarations are not verified; remembering a basis is not equivalent to silently reusing a declaration.

## Legal and ethics notice

Users are responsible for verifying their authority to save media. Detection does not establish ownership or permission. Non-DRM does not automatically mean free to redistribute. Video Pro Finder does not bypass DRM, encryption, authentication, CORS, signed URLs, paywalls, or access controls. Video Pro Finder does not support torrent files or magnet links. Media should only be saved where permitted by law, licence, rights holder, and applicable platform terms.

## Troubleshooting

- **No source found:** use a page that exposes a standard media element, supported URL, Open Graph field, or VideoObject/AudioObject JSON-LD record.
- **Scan unavailable:** browser pages and restricted URLs do not allow extension script injection.
- **Manifest unavailable:** browser CORS and host-permission rules can block access; use official provider options instead of attempting a bypass.
- **Download fails:** the URL may have expired, require an authenticated session, or be blocked by the server or browser. Revalidate through the provider.
- **No HLS/DASH file output:** manifest parsing does not mean stream packaging or conversion; this build intentionally does not merge or remux segments.
- **Protected warning:** the source cannot enter a download job. Check for official downloads or contact the provider/rights holder.

## Security model

The extension requests minimal required permissions by default, injects only after a user gesture, treats page metadata as untrusted text, uses `textContent` for rendered titles, persists extension-controlled state locally, and validates eligibility again in the background before a download call. It does not fetch or log encryption key URLs. The authority declaration is an accountability reminder, not an authorization mechanism or restriction override.

## Release checklist

- Run `npm run ci` on the target Node LTS environment.
- Load `chrome-extension/` unpacked in current Chrome and Edge and inspect the permissions prompt.
- Confirm the protected DASH fixture never offers a download action.
- Confirm the fixture torrent and magnet sources remain blocked.
- Verify all generated manifest paths exist in the packaged ZIP.
- Review source changes, permissions, and browser-store policies before distribution.

## Contributions

Keep changes modular, local-first, and covered by tests. Do not add site-specific extraction, credential collection, key/licence handling, DRM circumvention, torrent support, remote executable code, or default telemetry. Document browser limits instead of promising that a restricted workflow can be bypassed.# fantastic-rotary-phone
