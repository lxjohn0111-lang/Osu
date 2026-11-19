// Featured soundtrack: real recordings by Kevin MacLeod (incompetech.com), CC BY 4.0.
// Each file is the official incompetech MP3 (SHA-256 verified against the incompetech record),
// re-encoded to 128 kbps MP3 for the web. Beatmaps are pre-generated into music/charts.json by
// tools/make-charts.cjs. The credit lines below are shown in-game on the Credits screen.
export const LICENSE = { name: 'Creative Commons: By Attribution 4.0 License', url: 'http://creativecommons.org/licenses/by/4.0/' };
export const CHANGES = 'Re-encoded to 128 kbps MP3 for the web; synchronised with gameplay. No other changes.';

const KM = 'Kevin MacLeod';
const t = (id, title, bpm, isrc, genre, bg, palette) => ({
  id, title, artist: KM, bpm, isrc, genre, bg, palette,
  file: `music/${id}.mp3`,
  credit: `"${title}" ${KM} (incompetech.com)`,
  source: `https://incompetech.com/music/royalty-free/index.html?isrc=${isrc}`,
});

export const TRACKS = [
  t('local-forecast-elevator', 'Local Forecast - Elevator', 82, 'USUAN1300012', 'LOUNGE GROOVE', 4, ['#2b6cff', '#18c9c9', '#cfe9ff']),
  t('carefree', 'Carefree', 96, 'USUAN1400037', 'UKULELE POP', 0, ['#ff9e5e', '#ff5e9e', '#ffe08a']),
  t('bit-quest', 'Bit Quest', 100, 'USUAN1500073', 'CHIPTUNE', 5, ['#ff5e7e', '#ffc94b', '#53f5a4']),
  t('getting-it-done', 'Getting it Done', 135, 'USUAN1800004', 'SYNTH GROOVE', 1, ['#ff2d95', '#7a3cff', '#00e5ff']),
  t('8bit-dungeon-boss', '8bit Dungeon Boss', 134, 'USUAN1200067', '8-BIT ACTION', 3, ['#ff7a18', '#ff2e63', '#ffe45e']),
  t('meatball-parade', 'Meatball Parade', 150, 'USUAN1500014', 'BRASS PARTY', 0, ['#b517ff', '#ff3fa4', '#ffd166']),
  t('cipher', 'Cipher', 150, 'USUAN1100844', 'ELECTRO', 2, ['#3d7bff', '#b44bff', '#5ff4ff']),
  t('quirky-dog', 'Quirky Dog', 155, 'USUAN1500053', 'ELECTRO FUNK', 1, ['#00d68f', '#00b4ff', '#f5ff3d']),
  t('volatile-reaction', 'Volatile Reaction', 155, 'USUAN1400039', 'ORCHESTRAL ACTION', 2, ['#ff3b3b', '#b517ff', '#ffd166']),
];
