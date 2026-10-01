import { test, expect } from '@playwright/test';

test('local fixture exposes direct, HLS, protected-DASH, captions, and unsupported links', async ({
  page,
}) => {
  await page.goto('/demo/test.html');
  const results = await page.evaluate(async () => {
    const { scanDocument } = await import('/utils/sourceScanner.js');
    return scanDocument(document).map((source) => ({
      src: source.src,
      type: source.streamType,
      label: source.label,
      subtitleCount: source.subtitles.length,
      mime: source.mime,
      codecs: source.codecs,
      bitrate: source.bitrate,
      estimatedSize: source.estimatedSize,
    }));
  });
  expect(results.some((source) => source.type === 'direct')).toBeTruthy();
  expect(results.some((source) => source.type === 'subtitle')).toBeTruthy();
  expect(
    results.some((source) => source.type === 'direct' && source.subtitleCount > 0),
  ).toBeTruthy();
  expect(
    results.some(
      (source) =>
        source.mime === 'video/mp4' &&
        source.codecs === 'avc1.640028' &&
        source.bitrate === 1800000 &&
        source.estimatedSize === 1048576,
    ),
  ).toBeTruthy();
  expect(results.some((source) => source.type === 'hls')).toBeTruthy();
  const manifestResults = await page.evaluate(async () => {
    const [{ parseHlsManifest, parseDashManifest }, { recommendVariant }, { evaluateEligibility }] =
      await Promise.all([
        import('/utils/playlistParser.js'),
        import('/utils/qualityAdvisor.js'),
        import('/utils/sourceEligibility.js'),
      ]);
    const masterUrl = new URL('/demo/fixtures/master.m3u8', location.href).href;
    const hlsText = await (await fetch(masterUrl)).text();
    const hls = parseHlsManifest(hlsText, masterUrl);
    const protectedUrl = new URL('/demo/fixtures/protected-sample.mpd', location.href).href;
    const dashText = await (await fetch(protectedUrl)).text();
    const dash = parseDashManifest(dashText, protectedUrl);
    const magnetEligibility = evaluateEligibility({
      src: 'magnet:?xt=urn:btih:fictional',
      streamType: 'torrent',
    });
    return {
      heights: hls.variants.map((variant) => variant.height),
      subtitleCount: hls.subtitles.length,
      recommendedHeight: recommendVariant(hls.variants, 'best_quality').variant.height,
      protected: dash.protection.isProtected,
      magnetBlockCode: magnetEligibility.blockCode,
    };
  });
  expect(manifestResults.heights).toEqual([2160, 1440, 1080, 720, 480]);
  expect(manifestResults.subtitleCount).toBe(1);
  expect(manifestResults.recommendedHeight).toBe(2160);
  expect(manifestResults.protected).toBeTruthy();
  expect(manifestResults.magnetBlockCode).toBe('TORRENT_UNSUPPORTED');
  await page.goto('/demo/fixtures/torrent-like-index.html');
  const unsupported = await page.evaluate(async () => {
    const { scanDocument } = await import('/utils/sourceScanner.js');
    return scanDocument(document).filter((source) => source.streamType === 'torrent').length;
  });
  expect(unsupported).toBeGreaterThanOrEqual(2);
  await page.addInitScript(() => {
    const state = {
      schemaVersion: 1,
      settings: {
        theme: 'light',
        liquidGlassIntensity: 'low',
        reduceMotionOverride: 'reduce',
        defaultQualityMode: 'best_balance',
        filenameTemplate: '{title}_{YYYYMMDD}_{quality}.{ext}',
        defaultPrompt: 'Default local prompt',
        defaultDownloadSubtitles: true,
        maxHistoryItems: 100,
      },
      queue: [
        {
          id: 'active-download',
          status: 'downloading',
          source: { label: 'Radar fixture' },
          progress: {
            percent: 42,
            bytesReceived: 42,
            totalBytes: 100,
            bytesPerSecond: 1,
            etaSeconds: 58,
          },
        },
      ],
      history: [
        {
          id: 'history-1',
          filename: 'authorized_fixture.mp4',
          originHost: 'media.example',
          authorizationBasis: 'owner',
          createdAt: 1,
          completedAt: 2,
        },
      ],
      library: [
        {
          id: 'saved-1',
          title: 'Local reference',
          sourceUrl: 'https://media.example/item.mp4',
          originHost: 'media.example',
          streamType: 'direct',
          eligibilityStatus: 'NONE',
          protectionStatus: 'none',
          createdAt: 1,
          tags: [],
          notes: '',
        },
      ],
      presets: [
        {
          id: 'preset-1',
          name: 'Existing preset',
          prompt: 'Saved prompt',
          filenameTemplate: '{title}.{ext}',
          createdAt: 1,
        },
      ],
      hostPreferences: { 'media.example': { height: 720, updatedAt: 1 } },
      diagnostics: [
        {
          id: 'diag-1',
          createdAt: 1,
          severity: 'warning',
          title: 'Fixture diagnostic',
          userMessage: 'Local test message',
          code: 'FIXTURE',
          category: 'scan',
        },
      ],
      errorSnapshots: [],
    };
    globalThis.__testState = state;
    const permissions = ['https://media.example/*'];
    const directSource = {
      id: 'source-direct',
      src: 'https://media.example/sample.mp4',
      canonicalUrl: 'https://media.example/sample.mp4',
      pageUrl: 'http://127.0.0.1:4173/demo/test.html',
      label: 'Authorized fixture',
      originHost: 'media.example',
      streamType: 'direct',
      resolution: '720p',
      protection: { isProtected: false, category: 'none', signals: [] },
      eligibility: { canDownloadDirectly: true, canPreview: true, blockCode: 'NONE' },
      subtitles: [{ language: 'en', label: 'English', url: 'https://media.example/captions.vtt' }],
      variants: [],
    };
    const protectedSource = {
      ...directSource,
      id: 'source-protected',
      src: 'https://media.example/protected.mp4',
      canonicalUrl: 'https://media.example/protected.mp4',
      label: 'Protected fixture',
      protection: { isProtected: true, category: 'drm_dash', signals: ['Fixture protection'] },
      eligibility: { canDownloadDirectly: false, blockCode: 'PROTECTED_MEDIA' },
    };
    const analyzedManifest = {
      id: 'source-manifest',
      src: 'https://media.example/master.m3u8',
      canonicalUrl: 'https://media.example/master.m3u8',
      pageUrl: 'http://127.0.0.1:4173/demo/test.html',
      label: 'Quality fixture',
      originHost: 'media.example',
      streamType: 'hls',
      protection: { isProtected: false, category: 'none', signals: [] },
      eligibility: { canDownloadDirectly: false, blockCode: 'LIVE_STREAM_UNSUPPORTED' },
      subtitles: [],
      variants: [
        { bandwidth: 900000, url: 'https://media.example/low.m3u8' },
        { height: 720, bandwidth: 2400000, url: 'https://media.example/high.m3u8' },
      ],
    };
    const sentMessages = [];
    globalThis.__sentMessages = sentMessages;
    globalThis.chrome = {
      runtime: {
        sendMessage: async (message) => {
          sentMessages.push(message);
          if (message.type === 'GET_STATE') return { ok: true, state };
          if (message.type === 'GET_TAB_SOURCES')
            return {
              ok: true,
              sources: [directSource, protectedSource, analyzedManifest],
              scannedAt: Date.now(),
            };
          if (message.type === 'SAVE_PRESETS') {
            state.presets = message.presets;
            return { ok: true };
          }
          if (message.type === 'UPDATE_SETTINGS') {
            Object.assign(state.settings, message.settings);
            return { ok: true };
          }
          if (message.type === 'CLEAR_DIAGNOSTICS') {
            state.diagnostics = [];
            return { ok: true };
          }
          if (message.type === 'UPDATE_LIBRARY_ITEM') {
            const item = state.library.find((entry) => entry.id === message.itemId);
            if (item) Object.assign(item, message.patch);
            return { ok: true };
          }
          if (message.type === 'REMOVE_LIBRARY_ITEMS') {
            state.library = state.library.filter((item) => !message.itemIds.includes(item.id));
            return { ok: true };
          }
          if (message.type === 'RESET_HOST_PREFERENCE') {
            delete state.hostPreferences[message.host];
            return { ok: true };
          }
          if (message.type === 'CLEAR_HOST_PREFERENCES') {
            state.hostPreferences = {};
            return { ok: true };
          }
          if (message.type === 'UPDATE_HOST_PREFERENCE') {
            state.hostPreferences[message.host] = { variantKey: message.variantKey };
            return { ok: true };
          }
          if (message.type === 'START_DOWNLOAD') return { ok: true, jobId: 'download-job' };
          if (message.type === 'START_SUBTITLE_DOWNLOAD') return { ok: true, jobId: 'caption-job' };
          return { ok: true };
        },
        getURL: (path) => path,
        openOptionsPage: () => {},
      },
      tabs: {
        query: async () => [{ id: 5, url: 'http://127.0.0.1:4173/demo/test.html' }],
        get: async (id) => ({ id, url: 'http://127.0.0.1:4173/demo/test.html' }),
        create: async () => {},
      },
      permissions: {
        getAll: async () => ({ origins: permissions }),
        remove: async ({ origins }) => {
          for (const origin of origins) permissions.splice(permissions.indexOf(origin), 1);
          return true;
        },
        request: async () => true,
      },
      storage: {
        onChanged: { addListener: () => {} },
        local: {
          set: async ({ state: next }) => Object.assign(state, next),
          clear: async () => {},
        },
      },
    };
    globalThis.confirm = () => true;
  });
  await page.goto('/library.html');
  await expect(page.getByText('Local reference')).toBeVisible();
  await page.getByLabel('Tags for Local reference').fill('review, local');
  await page.getByLabel('Tags for Local reference').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => globalThis.__testState.library[0].tags))
    .toEqual(['review', 'local']);
  await page.getByLabel('Search saved sources').fill('media.example');
  await page.getByLabel('Sort saved sources').selectOption('host');
  await page.goto('/options.html');
  await expect(page.getByText('https://media.example/*')).toBeVisible();
  await expect(page.getByText(/authorized_fixture.mp4.*owner/)).toBeVisible();
  await page.getByLabel('Default prompt').fill('My authorized workflow');
  await page.getByLabel('Preset name').fill('Fixture preset');
  await page.getByRole('button', { name: 'Save current prompt as preset' }).click();
  await expect(page.getByText('Fixture preset')).toBeVisible();
  await expect(page.getByText('Existing preset')).toBeVisible();
  await expect(page.getByText(/Fixture diagnostic/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Preset name').fill('Updated preset');
  await page.getByLabel('Default prompt').fill('Updated saved prompt');
  await page.getByRole('button', { name: 'Save preset changes' }).click();
  await expect(page.getByText('Updated preset')).toBeVisible();
  await expect(page.getByText('Existing preset')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use' }).first().click();
  await expect(page.getByText('Applied preset: Updated preset.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await page.goto('/popup.html');
  await expect(page.getByText('Authorized fixture')).toBeVisible();
  const qualitySelect = page.getByLabel('Preferred media quality for this host');
  await qualitySelect.selectOption({ label: 'Unknown · 900 kbps' });
  await expect
    .poll(() =>
      page.evaluate(() => globalThis.__testState.hostPreferences['media.example']?.variantKey),
    )
    .toMatch(/^x:900000:/);
  await expect(qualitySelect.locator('option:checked')).toHaveText('Unknown · 900 kbps');
  await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Download' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your authority' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start download' })).toBeDisabled();
  await page.getByLabel('Authority basis').selectOption('owner');
  await page.getByLabel(/I confirm that I have authority/).check();
  await expect(page.getByRole('button', { name: 'Start download' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start download' }).click();
  expect(
    await page.evaluate(() =>
      globalThis.__sentMessages.some(
        (message) => message.type === 'START_DOWNLOAD' && message.tabId === 5,
      ),
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Save English' }).click();
  await page.getByLabel('Authority basis').selectOption('permission');
  await page.getByLabel(/I confirm that I have authority/).check();
  await page.getByRole('button', { name: 'Start download' }).click();
  expect(
    await page.evaluate(() =>
      globalThis.__sentMessages.some(
        (message) =>
          message.type === 'START_SUBTITLE_DOWNLOAD' &&
          message.subtitleUrl === 'https://media.example/captions.vtt',
      ),
    ),
  ).toBeTruthy();
  await page.goto('/dashboard.html?tabId=5');
  await expect(page.getByRole('heading', { name: 'Detected media' })).toBeVisible();
  await expect(page.getByText('Quality fixture')).toBeVisible();
  await page.locator('.media-details summary').first().click();
  await expect(page.locator('.media-data dt').filter({ hasText: 'Format' }).first()).toBeVisible();
  await expect(page.locator('.media-data dt').filter({ hasText: 'Bitrate' }).first()).toBeVisible();
  await expect(page.locator('#radar')).toHaveClass(/is-active/);
  await expect(page.getByText('Radar fixture')).toBeVisible();
  const gradientRules = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .filter((rule) => /(?:linear|radial|conic)-gradient/i.test(rule)),
  );
  expect(gradientRules).toEqual([]);
  await page.getByRole('button', { name: 'Play preview' }).click();
  await expect(page.locator('#player-stage video')).toHaveAttribute(
    'src',
    'https://media.example/sample.mp4',
  );
});
