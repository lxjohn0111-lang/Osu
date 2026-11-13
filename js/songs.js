// Original soundtrack. Every track is composed here as data and synthesised in the
// browser by synth.js, so the game ships with zero third-party audio.
//
// Notation (one char = one 16th note, 16 chars per bar, bars separated by '|'):
//   melody : 1-7 scale degrees, qwertyu = one octave up, zxcvbnm = one octave down,
//            '-' holds the previous note, '.' is a rest
//   drums  : x hit, X accent, g ghost, o open hat
//   bass   : o root, O root+octave, 5 fifth, '-' hold
//   arp    : 0-7 index into the stacked chord tones
//   stab   : x chord hit, '-' hold

const K4 = 'x...x...x...x...';
const SN = '....x.......x...';
const H8 = 'x.x.x.x.x.x.x.x.';
const HO = '..o...o...o...o.';
const HX = 'x.o.x.o.x.o.x.o.';
const H16 = 'x.xxx.xxx.xxx.xx';
const NONE = '................';
const A16 = '0123012301230123';

// ---------------------------------------------------------------- Neon Skyline
const neonVerse = '5---3---5-7-q---|q--7--5-----3-4-|5---7---5-4-3---|4-----2-4-------|5---3---5-7-q---|e--q--7-----5-7-|e---7---5-7-e---|w-------7-w-r---';
const neonChorus = 'q-q-7-5-..5-7-q-|e-e-q-6-..6-q-e-|t-t-e-7-..7-e-t-|r-r-w-7-..w-r-w-|q-e-t-e-q-7-5-7-|6-q-e-q-6-5-6-q-|7-e-t-e-7-e-t-u-|r---w---7-------';
const neon = {
  id: 'neon-skyline', title: 'Neon Skyline', artist: 'Starpulse Sound Team', genre: 'SYNTHWAVE',
  bpm: 108, root: 57, scale: 'minor', bg: 1, palette: ['#ff2d95', '#7a3cff', '#00e5ff'],
  inst: {
    duck: 0.45,
    lead: { wave: 'sawtooth', det: 11, oct: 12, cut: [900, 4600], vib: 7, delay: 0.38, reverb: 0.3, vol: 0.34 },
    bass: { wave: 'sawtooth', cut: [160, 1500], dec: 0.09, sus: 0.35, vol: 0.5 },
    chord: { padCut: 1100, padVol: 0.16, stabVol: 0.2, stabCut: [700, 5200] },
    arp: { wave: 'square', vol: 0.12, cut: [800, 3600] },
    bell: { vol: 0.3, oct: 12 },
    drums: { snare: 0.75, snareDec: 0.11, snareRev: 0.5, hat: 0.2 },
  },
  sections: [
    { name: 'intro', bars: 4, chords: [1, 6, 3, 7], pad: 1, arp: '0.2.1.2.3.2.1.2.', hat: [NONE, NONE, H8, H8], filter: [500, 9000], energy: 0.25 },
    { name: 'verse', bars: 8, chords: [1, 6, 3, 7], pad: 1, kick: K4, snare: SN, hat: H8, bass: 'o.o.o.o.o.o.o.o.', lead: neonVerse, arp: '0...2...1...2...', energy: 0.55, impact: 1 },
    { name: 'build', bars: 4, chords: [6, 6, 7, 7], pad: 1, kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], bass: 'o.o.o.o.o.o.o.o.', arp: A16, roll: 2, riser: 4, spin: 1, filter: [2500, 14000], energy: 0.6 },
    { name: 'chorus', bars: 8, chords: [1, 6, 3, 7], pad: 1, stab: 'x..x..x...x.x...', kick: K4, snare: SN, hat: H16, bass: 'o.O.o.O.o.O.o.O.', lead: neonChorus, fever: 1, energy: 1, impact: 1 },
    { name: 'break', bars: 4, chords: [1, 6, 3, 7], pad: 1, bell: neonVerse.split('|').slice(0, 4), hat: HO, energy: 0.3 },
    { name: 'build2', bars: 2, chords: [7, 7], pad: 1, kick: [K4, 'x.x.x.x.xxxxxxxx'], arp: A16, roll: 1, riser: 2, energy: 0.6 },
    { name: 'chorus2', bars: 8, chords: [1, 6, 3, 7], pad: 1, stab: 'x..x..x...x.x...', kick: K4, snare: SN, hat: H16, bass: 'o.O.o.O.o.O.o.O.', lead: neonChorus, arp: '0.2.1.2.3.2.1.2.', fever: 1, energy: 1, impact: 1 },
    { name: 'outro', bars: 4, chords: [1, 6, 3, 1], pad: 1, arp: '0.2.1.2.3.2.1.2.', bell: ['5---3---5-7-q---', 'q--7--5---------', '5---7---5-4-3---', '1---------------'], hat: [H8, H8, HO, NONE], filter: [9000, 600], energy: 0.3 },
  ],
};

// -------------------------------------------------------------- Starlight Rush
const rushVerse = '3-----1-3-5-----|2-----m-2-4-----|1---3---5---q---|7-5-3-----------';
const rushDrop = '3--3--5-3--3--1-|2--2--4-2--2--m-|3--3--5-q--7-5--|4-3-1-----1-3-4-|5--5--q-5--5--3-|4--4--7-4--4--2-|5--q--w-e--w-q--|w-q-7-5-----1-2-';
const rush = {
  id: 'starlight-rush', title: 'Starlight Rush', artist: 'Starpulse Sound Team', genre: 'FUTURE HOUSE',
  bpm: 128, root: 50, scale: 'minor', bg: 2, palette: ['#3d7bff', '#b44bff', '#5ff4ff'],
  inst: {
    duck: 0.65,
    lead: { wave: 'sawtooth', det: 14, oct: 24, cut: [1400, 6500], vib: 4, delay: 0.3, reverb: 0.28, vol: 0.3, glide: 0.01 },
    bass: { wave: 'square', cut: [140, 1100], dec: 0.1, sus: 0.5, vol: 0.5 },
    chord: { padCut: 1300, padVol: 0.14, stabVol: 0.26, stabCut: [900, 7000], oct: 12 },
    arp: { wave: 'sawtooth', vol: 0.11, cut: [900, 4200], oct: 24 },
    bell: { vol: 0.3, oct: 24, ratio: 2 },
    drums: { kick: 1.05, snare: 0.0, clap: 0.6, hat: 0.2 },
  },
  sections: [
    { name: 'intro', bars: 4, chords: [6, 7, 1, 1], pad: 1, arp: '0.1.2.1.0.1.2.3.', hat: [NONE, NONE, HO, HO], filter: [400, 7000], energy: 0.25 },
    { name: 'verse', bars: 8, chords: [6, 7, 1, 1], pad: 1, kick: K4, clap: SN, hat: HO, bass: '..o...o...o...o.', bell: rushVerse, energy: 0.5, impact: 1 },
    { name: 'build', bars: 4, chords: [6, 7, 1, 1], pad: 1, kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], arp: A16, roll: 2, riser: 4, spin: 1, filter: [1800, 15000], energy: 0.6 },
    { name: 'drop', bars: 16, chords: [6, 7, 1, 1, 6, 7, 1, 5], stab: 'x--x--x-x--x--x-', kick: K4, clap: SN, hat: HX, bass: 'o--o--o-o--o--o-', lead: rushDrop, fever: 1, energy: 1, impact: 1 },
    { name: 'break', bars: 8, chords: [6, 7, 1, 1], pad: 1, bell: rushVerse, arp: '0...2...1...3...', energy: 0.3 },
    { name: 'build2', bars: 4, chords: [6, 7, 1, 1], pad: 1, kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], arp: A16, roll: 2, riser: 4, spin: 1, filter: [1800, 15000], energy: 0.6 },
    { name: 'drop2', bars: 16, chords: [6, 7, 1, 1, 6, 7, 1, 5], stab: 'x--x--x-x--x--x-', kick: K4, clap: SN, hat: HX, bass: 'o--o--o-o--o--o-', lead: rushDrop, arp: A16, fever: 1, energy: 1, impact: 1 },
    { name: 'outro', bars: 4, chords: [6, 7, 1, 1], pad: 1, bell: ['3-----1-3-5-----', '2-----m-2-4-----', '1---3---5---q---', '1---------------'], filter: [8000, 500], energy: 0.25 },
  ],
};

// ----------------------------------------------------------------- Pixel Heart
const pixA = '1-3-5-q-5-3-5---|2-5-7-w-7-5-7---|3-6-q-e-q-6-q---|4-6-q-6-4---5-7-|q---7-q-5---3---|w---q-w-7---5---|e-w-q-7-q---6---|6-q-r-e-w-q-7-w-';
const pixC = 't--e--q-t--e--q-|w--7--5-w--7--5-|e--q--6-e--q--6-|r-e-w-q-7-q-w---|t--e--q-u--t--e-|w--7--5-r--w--7-|e-e-w-q-w-q-7-6-|q-------t-q-----';
const pixel = {
  id: 'pixel-heart', title: 'Pixel Heart', artist: 'Starpulse Sound Team', genre: 'CHIPTUNE',
  bpm: 150, root: 60, scale: 'major', bg: 5, palette: ['#ff5e7e', '#ffc94b', '#53f5a4'],
  inst: {
    duck: 0.2, reverbVol: 0.3,
    lead: { wave: 'square', det: 4, oct: 12, cut: [3000, 9000], vib: 9, delay: 0.25, reverb: 0.12, vol: 0.2, sub: 0, sus: 0.75 },
    bass: { wave: 'triangle', cut: [900, 2400], dec: 0.12, sus: 0.7, vol: 0.62, sub: 0.2 },
    chord: { wave: 'square', det: 5, padCut: 1500, padVol: 0.05, stabVol: 0.12, stabCut: [1200, 6000], oct: -12 },
    arp: { wave: 'square', vol: 0.085, cut: [2500, 7000], dec: 0.05, oct: 12 },
    bell: { vol: 0.26, oct: 12, ratio: 1, index: 1.5 },
    drums: { kick: 0.85, kickHi: 220, kickDec: 0.05, snare: 0.55, snareHz: 3200, snareDec: 0.05, hat: 0.16, snareRev: 0.1 },
  },
  sections: [
    { name: 'intro', bars: 4, chords: [1, 5, 6, 4], arp: A16, bass: 'o.o.O.o.o.o.O.o.', hat: [NONE, NONE, H8, H8], filter: [900, 12000], energy: 0.35 },
    { name: 'verse', bars: 8, chords: [1, 5, 6, 4], kick: K4, snare: SN, hat: H8, bass: 'o.o.O.o.o.o.O.o.', lead: pixA, energy: 0.55, impact: 1 },
    { name: 'verse2', bars: 8, chords: [1, 5, 6, 4], kick: 'x...x..x..x.x...', snare: '....x.......x..x', hat: H8, bass: 'o.o.O.o.o.o.O.o.', lead: pixA, arp: A16, energy: 0.65 },
    { name: 'build', bars: 4, chords: [4, 4, 5, 5], kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], bass: 'o.o.o.o.o.o.o.o.', arp: A16, roll: 2, riser: 4, spin: 1, energy: 0.6 },
    { name: 'chorus', bars: 16, chords: [1, 5, 6, 4], kick: 'x...x..x..x.x...', snare: '....x.......x..x', hat: H16, bass: 'o.O.o.O.o.O.o.O.', stab: 'x.....x...x.....', lead: pixC, arp: A16, fever: 1, energy: 1, impact: 1 },
    { name: 'break', bars: 8, chords: [1, 5, 6, 4], pad: 1, bell: '1---5---q---5---|2---5---w---7---|3---6---q---e---|4---6---q---7---|q-------5---3---|w-------7---5---|e---w---q---6---|6---r---w-------', bass: 'o-------o-------', energy: 0.3 },
    { name: 'build2', bars: 4, chords: [4, 4, 5, 5], kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], bass: 'o.o.o.o.o.o.o.o.', arp: A16, roll: 2, riser: 4, spin: 1, energy: 0.6 },
    { name: 'chorus2', bars: 16, chords: [1, 5, 6, 4], kick: 'x...x..x..x.x...', snare: '....x.......x..x', hat: H16, bass: 'o.O.o.O.o.O.o.O.', stab: 'x.....x...x.....', lead: pixC, arp: A16, fever: 1, energy: 1, impact: 1 },
    { name: 'outro', bars: 4, chords: [1, 5, 4, 1], arp: A16, bass: 'o.o.O.o.o.o.O.o.', lead: ['q---7-q-5---3---', 'w---q-w-7---5---', '6-q-r-e-w-q-7-w-', 'q---------------'], hat: [H8, H8, H8, NONE], energy: 0.4 },
  ],
};

// --------------------------------------------------------------- Midnight Tide
const tideVerse = '5-------3---1---|4-------3---1---|3-----5---q-----|w---7---4-------|q-------7---5---|6-------5---3---|5---3---5---q---|w-------7-------';
const tideChorus = 'q---7-5-7---5-3-|6---5-3-4---3-1-|3-5-q-5-e---w-q-|w---7-w-r---w---|t---e-q-e---q-7-|q---6-4-6---q---|e-w-q-7-q---5---|7-----w-4-------';
const tide = {
  id: 'midnight-tide', title: 'Midnight Tide', artist: 'Starpulse Sound Team', genre: 'CHILLWAVE',
  bpm: 88, root: 52, scale: 'minor', bg: 4, palette: ['#2b6cff', '#18c9c9', '#cfe9ff'],
  inst: {
    duck: 0.3, reverbVol: 0.75,
    lead: { wave: 'triangle', wave2: 'sine', det: 7, oct: 12, cut: [1200, 3800], vib: 8, delay: 0.42, reverb: 0.45, vol: 0.42, atk: 0.012, glide: 0.03 },
    bass: { wave: 'sine', cut: [300, 900], dec: 0.3, sus: 0.8, vol: 0.62, sub: 0.3 },
    chord: { padCut: 900, padVol: 0.2, stabVol: 0.12, stabCut: [600, 2800], oct: 12 },
    arp: { wave: 'triangle', vol: 0.16, cut: [1200, 3000], dec: 0.16, oct: 12 },
    bell: { vol: 0.36, oct: 12, ratio: 3.5, index: 2.5, dec: 0.7 },
    drums: { kick: 0.9, kickDec: 0.12, snare: 0.4, snareHz: 1500, hat: 0.11, snareRev: 0.5 },
  },
  sections: [
    { name: 'intro', bars: 4, chords: [1, 4, 6, 7], pad: 1, arp: '0...1...2...1...', filter: [500, 6000], energy: 0.2 },
    { name: 'verse', bars: 8, chords: [1, 4, 6, 7], pad: 1, kick: 'x.....x...x.....', snare: SN, hat: H8, bass: 'o-----o---o-----', bell: tideVerse, arp: '0...1...2...1...', energy: 0.5 },
    { name: 'chorus', bars: 8, chords: [1, 4, 6, 7], pad: 1, kick: 'x.....x...x..x..', snare: SN, hat: H8, bass: 'o-----o---o-O---', lead: tideChorus, arp: '0.1.2.1.3.2.1.2.', fever: 1, energy: 0.9, impact: 1 },
    { name: 'break', bars: 4, chords: [1, 4, 6, 7], pad: 1, bell: tideVerse.split('|').slice(0, 4), energy: 0.25 },
    { name: 'chorus2', bars: 8, chords: [1, 4, 6, 7], pad: 1, kick: 'x.....x...x..x..', snare: SN, hat: H8, bass: 'o-----o---o-O---', lead: tideChorus, stab: 'x.....x.........', arp: '0.1.2.1.3.2.1.2.', fever: 1, energy: 0.9, impact: 1 },
    { name: 'outro', bars: 4, chords: [1, 4, 6, 1], pad: 1, bell: ['5-------3---1---', '4-------3---1---', '3-----5---q-----', 'q---------------'], arp: '0...1...2...1...', filter: [6000, 500], energy: 0.2 },
  ],
};

// ------------------------------------------------------------------ Hyperdrive
const hypA = '5-------3-------|1---3---5---7---|q-------7-------|5---3---5-------|7-------5-------|3---5---7---q---|w-------q-------|7---5---4---2---';
const hypDrop = 'q-7-5-7-q-7-5-3-|5-3-1-3-5-------|q-7-6-7-q-7-6-3-|6-5-3-5-6-------|e-w-7-w-e-w-7-5-|7-5-3-5-7-------|r-e-w-e-r-e-w-7-|w---7---4---5---';
const DK = 'x.........x.....';
const DS = ['....x.......x...', '....x..g.g..x...'];
const hyper = {
  id: 'hyperdrive', title: 'Hyperdrive', artist: 'Starpulse Sound Team', genre: 'DRUM & BASS',
  bpm: 174, root: 55, scale: 'minor', bg: 3, palette: ['#ff7a18', '#ff2e63', '#ffe45e'],
  inst: {
    duck: 0.4,
    lead: { wave: 'sawtooth', det: 13, oct: 12, cut: [1500, 7000], vib: 5, delay: 0.3, reverb: 0.3, vol: 0.3 },
    bass: { wave: 'sawtooth', reese: 19, cut: [220, 700], dec: 0.25, sus: 0.85, vol: 0.5, fdec: 0.2 },
    chord: { padCut: 1400, padVol: 0.15, stabVol: 0.2, stabCut: [900, 6000] },
    arp: { wave: 'square', vol: 0.1, cut: [1200, 5000], oct: 12 },
    bell: { vol: 0.3, oct: 12 },
    drums: { kick: 1.0, kickHi: 190, kickDec: 0.07, snare: 0.8, snareHz: 2100, snareDec: 0.08, hat: 0.17 },
  },
  sections: [
    { name: 'intro', bars: 8, chords: [1, 1, 6, 6, 3, 3, 7, 7], pad: 1, arp: '0.2.1.2.0.2.1.3.', hat: [NONE, NONE, NONE, NONE, H8, H8, H8, H8], filter: [400, 9000], energy: 0.3 },
    { name: 'verse', bars: 16, chords: [1, 1, 6, 6, 3, 3, 7, 7], pad: 1, kick: DK, snare: DS, hat: H8, bass: 'o-----o---o-----|o---------o-o---', lead: hypA, energy: 0.6, impact: 1 },
    { name: 'build', bars: 8, chords: [6, 6, 6, 6, 7, 7, 7, 7], pad: 1, kick: [K4, K4, K4, K4, H8, H8, H8, 'xxxxxxxxxxxx....'], arp: A16, roll: 4, riser: 8, spin: 2, filter: [1500, 15000], energy: 0.6 },
    { name: 'drop', bars: 16, chords: [1, 1, 6, 6, 3, 3, 7, 7], kick: DK, snare: DS, hat: H8, bass: 'o-----o---o-----|o---------o-o---', stab: 'x.....x.........', lead: hypDrop, fever: 1, energy: 1, impact: 1 },
    { name: 'break', bars: 8, chords: [1, 1, 6, 6, 3, 3, 7, 7], pad: 1, bell: hypA, hat: HO, energy: 0.3 },
    { name: 'drop2', bars: 16, chords: [1, 1, 6, 6, 3, 3, 7, 7], kick: DK, snare: DS, hat: H8, bass: 'o-----o---o-----|o---------o-o---', stab: 'x.....x.........', lead: hypDrop, arp: '0.2.1.2.0.2.1.3.', fever: 1, energy: 1, impact: 1 },
    { name: 'outro', bars: 4, chords: [1, 1, 1, 1], pad: 1, bell: ['5-------3-------', '1---3---5---7---', 'q---------------', NONE], filter: [9000, 500], energy: 0.25 },
  ],
};

// ----------------------------------------------------------------- Final Bloom
const bloom = '3---3-4-5---q---|q---q-7-6---5---|5---5-6-7---e---|w---w-q-7---5-7-|q---q-w-e---t---|e---e-w-q---7---|5---7---e---t---|r---w---q-7-w---';
const TB = '..o...o...o...o.';
const TA = '0121312101213121';
const final = {
  id: 'final-bloom', title: 'Final Bloom', artist: 'Starpulse Sound Team', genre: 'UPLIFTING TRANCE',
  bpm: 140, root: 59, scale: 'minor', bg: 0, palette: ['#b517ff', '#ff3fa4', '#ffd166'],
  inst: {
    duck: 0.7, reverbVol: 0.65,
    lead: { wave: 'sawtooth', det: 17, oct: 12, cut: [1600, 7500], vib: 5, delay: 0.4, reverb: 0.4, vol: 0.32 },
    bass: { wave: 'sawtooth', cut: [150, 1300], dec: 0.1, sus: 0.45, vol: 0.5 },
    chord: { det: 18, padCut: 1500, padVol: 0.16, stabVol: 0.2, stabCut: [1000, 8000] },
    arp: { wave: 'sawtooth', vol: 0.12, cut: [1000, 5200], oct: 12, delay: 0.45 },
    bell: { vol: 0.32, oct: 12, ratio: 2, index: 2 },
    drums: { kick: 1.1, snare: 0.0, clap: 0.6, hat: 0.2 },
  },
  sections: [
    { name: 'intro', bars: 8, chords: [1, 6, 3, 7], pad: 1, arp: TA, kick: [NONE, NONE, NONE, NONE, K4, K4, K4, K4], hat: [NONE, NONE, NONE, NONE, HO, HO, HO, HO], filter: [350, 8000], energy: 0.35 },
    { name: 'verse', bars: 8, chords: [1, 6, 3, 7], pad: 1, kick: K4, clap: SN, hat: HO, bass: TB, bell: bloom, energy: 0.55, impact: 1 },
    { name: 'build', bars: 8, chords: [6, 6, 7, 7], pad: 1, kick: [K4, K4, K4, K4, H8, H8, H8, 'xxxxxxxxxxxx....'], arp: TA, roll: 4, riser: 8, spin: 2, filter: [1200, 16000], energy: 0.6 },
    { name: 'drop', bars: 16, chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: HX, bass: TB, stab: 'x..x..x..x..x.x.', lead: bloom, arp: TA, fever: 1, energy: 1, impact: 1 },
    { name: 'break', bars: 8, chords: [1, 6, 3, 7], pad: 1, bell: bloom, arp: '0...2...1...3...', energy: 0.3 },
    { name: 'build2', bars: 4, chords: [6, 6, 7, 7], pad: 1, kick: [K4, K4, H8, 'xxxxxxxxxxxx....'], arp: TA, roll: 2, riser: 4, spin: 1, filter: [1200, 16000], energy: 0.6 },
    { name: 'drop2', bars: 16, chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: HX, bass: 'o.ooo.ooo.ooo.oo', stab: 'x..x..x..x..x.x.', lead: bloom, arp: TA, fever: 1, energy: 1, impact: 1 },
    { name: 'outro', bars: 4, chords: [1, 6, 3, 1], pad: 1, bell: ['3---3-4-5---q---', 'q---q-7-6---5---', '5---5-6-7---e---', 'q---------------'], arp: '0...2...1...3...', filter: [8000, 500], energy: 0.25 },
  ],
};

export const SONGS = [tide, neon, rush, pixel, final, hyper];
