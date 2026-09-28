import { parseHlsManifest, parseHlsMediaPlaylist } from '../utils/playlistParser.js';

const master =
  '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="English",LANGUAGE="en",URI="captions.vtt"\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,CODECS="avc1.640028",FRAME-RATE=30,SUBTITLES="s"\nvideo.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480\nlow.m3u8';

test('parses and sorts HLS qualities and subtitle renditions', () => {
  const result = parseHlsManifest(master, 'https://media.test/path/master.m3u8');
  expect(result.variants.map((variant) => variant.height)).toEqual([1080, 480]);
  expect(result.variants[0].url).toBe('https://media.test/path/video.m3u8');
  expect(result.variants[0].bandwidth).toBe(4000000);
  expect(result.subtitles[0].url).toBe('https://media.test/path/captions.vtt');
});

test('detects encrypted HLS and identifies live playlists', () => {
  expect(
    parseHlsManifest('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', 'https://m.test/list.m3u8')
      .protection.isProtected,
  ).toBe(true);
  expect(
    parseHlsMediaPlaylist('#EXTM3U\n#EXTINF:5,\nsegment.ts', 'https://m.test/list.m3u8').live,
  ).toBe(true);
  expect(
    parseHlsMediaPlaylist(
      '#EXTM3U\n#EXTINF:5,\nsegment.ts\n#EXT-X-ENDLIST',
      'https://m.test/list.m3u8',
    ).live,
  ).toBe(false);
});
