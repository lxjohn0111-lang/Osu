// Procedural music engine: compiles a song spec (songs.js) into note events, renders it
// to an AudioBuffer with OfflineAudioContext, and exposes the same events as chart material
// so every built-in beatmap is locked to the exact notes of the music.
//
// The synth is a fixed set of always-running voices driven purely by parameter automation
// (no per-note node creation), which keeps offline rendering fast even on phones.

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
const DEG = '1234567', UP = 'qwertyu', DN = 'zxcvbnm';

const DEF = {
  duck: 0.5, reverbVol: 0.6, reverbTime: 1.5, delayFb: 0.36,
  lead: { wave: 'sawtooth', wave2: 'square', det: 10, oct: 12, cut: [1200, 5000], q: 1.5, vib: 5, delay: 0.3, reverb: 0.25, vol: 0.3, sub: 0.25, atk: 0.004, dec: 0.18, sus: 0.7, rel: 0.03, fdec: 0.2, fsus: 0.35, glide: 0, pan: 0 },
  bass: { wave: 'sawtooth', reese: 0, cut: [180, 1300], q: 3, dec: 0.12, sus: 0.5, vol: 0.5, sub: 0.6, fdec: 0.1 },
  chord: { wave: 'sawtooth', det: 14, oct: 0, padCut: 1100, padVol: 0.15, stabVol: 0.22, stabCut: [800, 6000], stabDec: 0.14 },
  arp: { wave: 'square', wave2: null, det: 6, oct: 12, cut: [900, 4200], q: 1.2, vol: 0.11, dec: 0.07, sus: 0, delay: 0.4, reverb: 0.2, pan: 0.25, fdec: 0.06, fsus: 0, sub: 0, atk: 0.003, rel: 0.02, vib: 0, glide: 0 },
  bell: { ratio: 3.5, index: 3, dec: 0.45, vol: 0.3, oct: 12, delay: 0.3, reverb: 0.4 },
  drums: { vol: 0.9, kick: 1, kickHi: 165, kickLo: 44, kickDec: 0.09, snare: 0.7, snareHz: 1900, snareDec: 0.07, snareRev: 0.25, clap: 0.5, hat: 0.2, crash: 0.3 },
};

function mergeInst(inst = {}) {
  const out = {};
  for (const k of Object.keys(DEF)) {
    out[k] = typeof DEF[k] === 'object' ? Object.assign({}, DEF[k], inst[k] || {}) : (inst[k] !== undefined ? inst[k] : DEF[k]);
  }
  return out;
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function degIndex(ch) {
  let i = DEG.indexOf(ch); if (i >= 0) return i;
  i = UP.indexOf(ch); if (i >= 0) return i + 7;
  i = DN.indexOf(ch); if (i >= 0) return i - 7;
  return null;
}
function degToMidi(root, scale, idx) {
  const o = Math.floor(idx / 7), d = ((idx % 7) + 7) % 7;
  return root + 12 * o + scale[d];
}
function expand(p, bars) {
  if (!p) return null;
  const arr = Array.isArray(p) ? p : p.split('|');
  let out = '';
  for (let b = 0; b < bars; b++) out += (arr[b % arr.length] + '................').slice(0, 16);
  return out;
}
function parseLine(str) {
  const out = []; let cur = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '-') { if (cur) cur.len++; }
    else { cur = null; if (c !== '.') { cur = { s: i, len: 1, ch: c }; out.push(cur); } }
  }
  return out;
}

/** Expand a song spec into absolute, step-timed events for every instrument. */
export function compile(spec) {
  if (spec._c) return spec._c;
  const I = mergeInst(spec.inst);
  const scale = SCALES[spec.scale || 'minor'];
  const stepDur = 60 / spec.bpm / 4, t0 = 0.08;
  const T = { kick: [], snare: [], clap: [], hat: [], crash: [], bass: [], lead: [], bell: [], arp: [], stab: [], pad: [], fx: [] };
  const sections = [];

  const chordIdx = (deg) => (deg - 1 >= 4 ? deg - 8 : deg - 1);
  const chordStack = (deg, base) => [0, 2, 4].map((k) => degToMidi(base, scale, chordIdx(deg) + k));
  const voiced = (deg) => {
    const base = spec.root + I.chord.oct;
    const t = chordStack(deg, spec.root).map((m) => { while (m >= base + 12) m -= 12; while (m < base) m += 12; return m; }).sort((a, b) => a - b);
    t.push(t[0] + 12);
    return t;
  };
  const bassRoot = (deg) => { let m = degToMidi(spec.root, scale, deg - 1); while (m >= 43) m -= 12; while (m < 31) m += 12; return m; };

  let s0 = 0;
  for (const sec of spec.sections) {
    const n = sec.bars * 16;
    const chordAt = (step) => {
      let c = sec.chords[Math.floor(step / 16) % sec.chords.length];
      if (Array.isArray(c)) c = c[step % 16 < 8 ? 0 : 1];
      return c;
    };
    for (const lane of ['kick', 'snare', 'clap', 'hat']) {
      const str = expand(sec[lane], sec.bars); if (!str) continue;
      for (let i = 0; i < n; i++) {
        const c = str[i]; if (c === '.' || c === '-') continue;
        T[lane].push({ s: s0 + i, v: c === 'X' ? 1.25 : c === 'g' ? 0.35 : 1, open: c === 'o' });
      }
    }
    if (sec.roll) {
      const len = sec.roll * 16, start = n - len, stop = len - 4;
      for (let i = 0; i < stop; i++) {
        const f = i / len, iv = f < 0.5 ? (sec.roll >= 2 ? 4 : 2) : f < 0.75 ? 2 : 1;
        if (i % iv === 0) T.snare.push({ s: s0 + start + i, v: 0.35 + 0.75 * f, roll: true });
      }
    }
    if (sec.bass) for (const nt of parseLine(expand(sec.bass, sec.bars))) {
      const r = bassRoot(chordAt(nt.s));
      const m = nt.ch === 'O' ? r + 12 : nt.ch === '5' ? r + 7 : r;
      T.bass.push({ s: s0 + nt.s, len: nt.len, midi: m });
    }
    for (const lane of ['lead', 'bell']) {
      if (!sec[lane]) continue;
      for (const nt of parseLine(expand(sec[lane], sec.bars))) {
        const idx = degIndex(nt.ch); if (idx === null) continue;
        T[lane].push({ s: s0 + nt.s, len: nt.len, midi: degToMidi(spec.root + I[lane].oct, scale, idx) });
      }
    }
    if (sec.arp) for (const nt of parseLine(expand(sec.arp, sec.bars))) {
      const k = parseInt(nt.ch, 10); if (isNaN(k)) continue;
      const ct = chordStack(chordAt(nt.s), spec.root + I.arp.oct);
      T.arp.push({ s: s0 + nt.s, len: nt.len, midi: ct[k % 3] + 12 * Math.floor(k / 3) });
    }
    if (sec.stab) for (const nt of parseLine(expand(sec.stab, sec.bars))) {
      T.stab.push({ s: s0 + nt.s, len: nt.len, chord: voiced(chordAt(nt.s)) });
    }
    if (sec.pad) {
      for (let b = 0; b < sec.bars; b++) {
        const c = sec.chords[b % sec.chords.length];
        if (Array.isArray(c)) {
          T.pad.push({ s: s0 + b * 16, len: 8, chord: voiced(c[0]) });
          T.pad.push({ s: s0 + b * 16 + 8, len: 8, chord: voiced(c[1]) });
        } else T.pad.push({ s: s0 + b * 16, len: 16, chord: voiced(c) });
      }
    }
    if (sec.riser) T.fx.push({ type: 'riser', s: s0 + n - sec.riser * 16, len: sec.riser * 16 });
    if (sec.impact) { T.fx.push({ type: 'impact', s: s0 }); T.crash.push({ s: s0, v: 1 }); }
    if (sec.fever) for (let b = 8; b < sec.bars; b += 8) T.crash.push({ s: s0 + b * 16, v: 0.7 });
    if (sec.filter) T.fx.push({ type: 'filter', s: s0, len: n, a: sec.filter[0], b: sec.filter[1] });
    sections.push({ name: sec.name, s0, s1: s0 + n, fever: !!sec.fever, energy: sec.energy ?? 0.5, spin: sec.spin || 0, hasMel: !!(sec.lead || sec.bell), hasArp: !!sec.arp });
    s0 += n;
  }
  const c = { I, stepDur, t0, totalSteps: s0, tracks: T, sections, duration: t0 + s0 * stepDur + 2.6, songEnd: t0 + s0 * stepDur };
  Object.defineProperty(spec, '_c', { value: c, enumerable: false });
  return c;
}

/** Chart material for mapgen: grid + candidate note events derived from the composition. */
export function chartSource(spec) {
  const c = compile(spec), T = c.tracks, n = c.totalSteps;
  const stepTimes = new Float64Array(n + 64);
  for (let i = 0; i < stepTimes.length; i++) stepTimes[i] = c.t0 + i * c.stepDur;
  const cands = [];
  const mel = T.lead.concat(T.bell);
  let lo = 999, hi = -999;
  for (const m of mel) { lo = Math.min(lo, m.midi); hi = Math.max(hi, m.midi); }
  const pn = (m) => (hi > lo ? (m - lo) / (hi - lo) : 0.5);
  const add = (s, o) => cands.push(Object.assign({ step: s, t: stepTimes[s], dur: 0, w: 0.5, mel: false, pitch: null, midi: null }, o));
  for (const m of mel) add(m.s, { dur: m.len, w: 1, mel: true, pitch: pn(m.midi), midi: m.midi });
  const secOf = (s) => c.sections.find((x) => s >= x.s0 && s < x.s1);
  let alo = 999, ahi = -999;
  for (const a of T.arp) { alo = Math.min(alo, a.midi); ahi = Math.max(ahi, a.midi); }
  for (const a of T.arp) {
    const sec = secOf(a.s), p = ahi > alo ? (a.midi - alo) / (ahi - alo) : 0.5;
    if (!sec.hasMel) { if (a.s % 2 === 0) add(a.s, { w: a.s % 4 === 0 ? 0.9 : 0.6, mel: true, pitch: p, midi: a.midi, dur: 1 }); }
    else add(a.s, { w: 0.35, pitch: p, midi: a.midi });
  }
  for (const k of T.kick) { const sec = secOf(k.s); add(k.s, { w: 0.7, mel: !sec.hasMel && !sec.hasArp }); }
  for (const k of T.snare.concat(T.clap)) { if (k.roll || k.v < 0.5) continue; const sec = secOf(k.s); add(k.s, { w: 0.75, mel: !sec.hasMel && !sec.hasArp }); }
  for (const k of T.hat) add(k.s, { w: 0.3 });
  cands.sort((a, b) => a.step - b.step || b.w - a.w);
  return {
    bpm: spec.bpm, stepTimes, nSteps: n, stepDur: c.stepDur, barSteps: 16, phase: 0,
    sections: c.sections.map((s) => ({ s0: s.s0, s1: s.s1, fever: s.fever, energy: s.energy, spin: s.spin })),
    cands, duration: c.duration, songEnd: c.songEnd, exact: true,
    preview: (() => { const f = c.sections.find((s) => s.fever); return f ? c.t0 + f.s0 * c.stepDur : c.duration * 0.3; })(),
  };
}

function makeIR(ctx, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr), buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, env = Math.pow(1 - t, 2.2) * Math.exp(-t * 3.2);
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.75 - 0.6 * t);
      d[i] = lp * env * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}

/** Render a song spec to a stereo AudioBuffer. onProgress(0..1) is best-effort. */
export function renderSong(spec, onProgress) {
  const c = compile(spec), I = c.I, T = c.tracks, sd = c.stepDur;
  const sr = 44100, len = Math.ceil(c.duration * sr);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, len, sr);
  const tAt = (s) => c.t0 + s * sd;

  const G = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const F = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const O = (type, f = 220, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.start(0); return o; };
  const P = (pan) => { if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; return p; } return G(1); };
  const con = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // ---- master + buses
  const out = G(0.36);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = (i / 1023.5 - 1) * 2.2; curve[i] = Math.tanh(x) / Math.tanh(2.2) * 0.98; }
  shaper.curve = curve;
  con(out, shaper, ctx.destination);
  const drumBus = G(I.drums.vol); drumBus.connect(out);
  const musicBus = G(1), duck = G(1), musicLP = F('lowpass', 20000, 0.5);
  con(musicBus, duck, musicLP, out);
  const revIn = G(1), rev = ctx.createConvolver(); rev.buffer = makeIR(ctx, I.reverbTime);
  con(revIn, rev, G(I.reverbVol), musicLP);
  const dlIn = G(1), dl = ctx.createDelay(1.5), dlLP = F('lowpass', 3600), fb = G(I.delayFb);
  dl.delayTime.value = sd * 3;
  con(dlIn, dl, dlLP, fb, dl); con(dlLP, G(0.85), duck);

  const noiseBuf = ctx.createBuffer(1, sr * 2, sr);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true; noise.start(0);

  // ---- drums
  const D = I.drums;
  if (T.kick.length) {
    const o = O('sine', D.kickLo), g = G(0); con(o, g, drumBus);
    const cg = G(0); con(noise, F('highpass', 2500), cg, drumBus);
    for (const h of T.kick) {
      const t = tAt(h.s), v = D.kick * h.v;
      o.frequency.setValueAtTime(D.kickHi, t); o.frequency.setTargetAtTime(D.kickLo, t, 0.026);
      g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t + 0.035, D.kickDec);
      cg.gain.setValueAtTime(0.22 * v, t); cg.gain.setTargetAtTime(0, t, 0.004);
      duck.gain.setValueAtTime(1 - I.duck, t); duck.gain.setTargetAtTime(1, t + 0.02, sd * 0.85);
    }
  }
  if (T.snare.length && D.snare > 0) {
    const g = G(0); con(noise, F('bandpass', D.snareHz, 0.8), F('highpass', 500), g, drumBus);
    con(g, G(D.snareRev), revIn);
    const o = O('triangle', 185), og = G(0); con(o, og, drumBus);
    for (const h of T.snare) {
      const t = tAt(h.s), v = D.snare * h.v;
      g.gain.setValueAtTime(v * 1.7, t); g.gain.setTargetAtTime(0, t + 0.008, D.snareDec);
      og.gain.setValueAtTime(v * 0.5, t); og.gain.setTargetAtTime(0, t, 0.03);
      o.frequency.setValueAtTime(240, t); o.frequency.setTargetAtTime(170, t, 0.02);
    }
  }
  const clapHits = T.clap.concat(D.snare > 0 ? [] : T.snare);
  if (clapHits.length) {
    const g = G(0); con(noise, F('bandpass', 1250, 1.1), g, drumBus); con(g, G(0.3), revIn);
    for (const h of clapHits) {
      const t = tAt(h.s), v = D.clap * h.v * 2.2;
      for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(v, t + k * 0.011); g.gain.setTargetAtTime(0, t + k * 0.011, k < 2 ? 0.004 : 0.075); }
    }
  }
  if (T.hat.length) {
    const g = G(0); con(noise, F('highpass', 8200), g, P(0.25), drumBus);
    for (const h of T.hat) {
      const t = tAt(h.s), v = D.hat * h.v * (h.s % 4 === 0 ? 1 : 0.75);
      g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t, h.open ? 0.085 : 0.016);
    }
  }
  if (T.crash.length) {
    const g = G(0); con(noise, F('highpass', 4200), g, drumBus); con(g, G(0.4), revIn);
    for (const h of T.crash) { const t = tAt(h.s); g.gain.setValueAtTime(D.crash * h.v, t); g.gain.setTargetAtTime(0, t + 0.02, 0.42); }
  }
  // ---- fx
  {
    const risers = T.fx.filter((f) => f.type === 'riser'), impacts = T.fx.filter((f) => f.type === 'impact'), filters = T.fx.filter((f) => f.type === 'filter');
    if (risers.length) {
      const bp = F('bandpass', 300, 1.6), g = G(0); con(noise, bp, g, out); con(g, G(0.5), revIn);
      for (const r of risers) {
        const a = tAt(r.s), b = tAt(r.s + r.len) - sd * 2;
        bp.frequency.setValueAtTime(280, a); bp.frequency.exponentialRampToValueAtTime(9500, b);
        g.gain.setValueAtTime(0.0005, a); g.gain.exponentialRampToValueAtTime(0.3, b); g.gain.setValueAtTime(0, b + 0.001);
      }
    }
    if (impacts.length) {
      const o = O('sine', 40), g = G(0); con(o, g, out);
      for (const r of impacts) {
        const t = tAt(r.s);
        o.frequency.setValueAtTime(95, t); o.frequency.setTargetAtTime(30, t, 0.22);
        g.gain.setValueAtTime(0.75, t); g.gain.setTargetAtTime(0, t + 0.08, 0.4);
      }
    }
    for (const f of filters) {
      const a = tAt(f.s), b = tAt(f.s + f.len);
      musicLP.frequency.setValueAtTime(f.a, a); musicLP.frequency.exponentialRampToValueAtTime(f.b, b - 0.002);
      if (!filters.some((x) => x.s === f.s + f.len)) musicLP.frequency.setValueAtTime(20000, b);
    }
  }
  // ---- bass
  if (T.bass.length) {
    const b = I.bass, mix = G(1), f = F('lowpass', b.cut[0], b.q), amp = G(0);
    const oscs = [O(b.wave)]; con(oscs[0], G(b.reese ? 0.5 : 0.8), mix);
    if (b.reese) { oscs.push(O(b.wave, 220, b.reese)); con(oscs[1], G(0.5), mix); }
    const sub = O('sine'); con(sub, G(b.sub), mix); oscs.push(sub);
    con(mix, f, amp, musicBus);
    for (const nt of T.bass) {
      const t = tAt(nt.s), off = tAt(nt.s + nt.len) - 0.012, fr = mtof(nt.midi);
      for (const o of oscs) o.frequency.setValueAtTime(fr, t);
      amp.gain.setTargetAtTime(b.vol, t, 0.004); amp.gain.setTargetAtTime(b.vol * b.sus, t + 0.015, b.dec); amp.gain.setTargetAtTime(0, off, 0.012);
      f.frequency.setTargetAtTime(b.cut[1], t, 0.004); f.frequency.setTargetAtTime(b.cut[0], t + 0.012, b.fdec);
    }
  }
  // ---- mono synth voice (lead / arp)
  const mono = (cfg, notes) => {
    if (!notes.length) return;
    const mix = G(1), f = F('lowpass', cfg.cut[0], cfg.q), amp = G(0), pan = P(cfg.pan || 0);
    const oscs = [O(cfg.wave, 220, -cfg.det), O(cfg.wave, 220, cfg.det)];
    oscs.forEach((o) => con(o, G(0.5), mix));
    let sub = null;
    if (cfg.sub > 0 && cfg.wave2) { sub = O(cfg.wave2); con(sub, G(cfg.sub), mix); }
    con(mix, f, amp, pan, musicBus); con(pan, G(cfg.delay), dlIn); con(pan, G(cfg.reverb), revIn);
    if (cfg.vib) { const l = O('sine', 5.6), lg = G(cfg.vib); l.connect(lg); oscs.forEach((o) => lg.connect(o.detune)); }
    let prevEnd = -1;
    for (const nt of notes) {
      const t = tAt(nt.s), off = tAt(nt.s + nt.len) - 0.012, fr = mtof(nt.midi), legato = cfg.glide > 0 && nt.s === prevEnd;
      for (const o of oscs) { if (legato) o.frequency.setTargetAtTime(fr, t, cfg.glide); else o.frequency.setValueAtTime(fr, t); }
      if (sub) sub.frequency.setValueAtTime(fr / 2, t);
      amp.gain.setTargetAtTime(cfg.vol, t, cfg.atk); amp.gain.setTargetAtTime(cfg.vol * cfg.sus, t + 0.02, cfg.dec); amp.gain.setTargetAtTime(0, off, cfg.rel);
      f.frequency.setTargetAtTime(cfg.cut[1], t, 0.005);
      f.frequency.setTargetAtTime(cfg.cut[0] + (cfg.cut[1] - cfg.cut[0]) * cfg.fsus, t + 0.02, cfg.fdec);
      prevEnd = nt.s + nt.len;
    }
  };
  mono(I.lead, T.lead);
  mono(I.arp, T.arp);
  // ---- FM bell, two alternating voices so notes ring over each other
  if (T.bell.length) {
    const b = I.bell, voices = [0, 1].map((k) => {
      const car = O('sine'), mod = O('sine'), mg = G(0), amp = G(0), pan = P(k ? 0.3 : -0.3);
      con(mod, mg); mg.connect(car.frequency); con(car, amp, pan, musicBus);
      con(pan, G(b.delay), dlIn); con(pan, G(b.reverb), revIn);
      return { car, mod, mg, amp };
    });
    T.bell.forEach((nt, i) => {
      const v = voices[i % 2], t = tAt(nt.s), fr = mtof(nt.midi);
      v.car.frequency.setValueAtTime(fr, t); v.mod.frequency.setValueAtTime(fr * b.ratio, t);
      v.mg.gain.setValueAtTime(b.index * fr, t); v.mg.gain.setTargetAtTime(b.index * fr * 0.12, t, 0.14);
      v.amp.gain.setTargetAtTime(b.vol, t, 0.002); v.amp.gain.setTargetAtTime(0, t + 0.012, b.dec);
    });
  }
  // ---- chords: shared 4-voice unison stack feeding a soft pad path and a bright stab path
  if (T.pad.length || T.stab.length) {
    const ch = I.chord, mix = G(1);
    const voices = [-0.55, 0.55, -0.2, 0.2].map((p) => {
      const a = O(ch.wave, 220, -ch.det), b = O(ch.wave, 220, ch.det), pan = P(p);
      con(a, G(0.5), pan); con(b, G(0.5), pan); pan.connect(mix);
      return [a, b];
    });
    const padF = F('lowpass', ch.padCut, 0.6), padA = G(0); con(mix, padF, padA, musicBus); con(padA, G(0.5), revIn);
    const stF = F('lowpass', ch.stabCut[0], 1.2), stA = G(0); con(mix, stF, stA, musicBus); con(stA, G(0.3), dlIn); con(stA, G(0.35), revIn);
    const setChord = (t, chord) => voices.forEach((v, i) => { const fr = mtof(chord[i]); v[0].frequency.setValueAtTime(fr, t); v[1].frequency.setValueAtTime(fr, t); });
    const ev = T.pad.map((p) => ({ k: 0, ...p })).concat(T.stab.map((p) => ({ k: 1, ...p }))).sort((a, b) => a.s - b.s);
    const padStarts = new Set(T.pad.map((p) => p.s));
    for (const e of ev) {
      const t = tAt(e.s); setChord(t, e.chord);
      if (e.k === 0) {
        padA.gain.setTargetAtTime(ch.padVol, t, 0.1);
        if (!padStarts.has(e.s + e.len)) padA.gain.setTargetAtTime(0, tAt(e.s + e.len) - 0.08, 0.14);
      } else {
        const gate = e.len * sd;
        stA.gain.setTargetAtTime(ch.stabVol, t, 0.003); stA.gain.setTargetAtTime(0, t + 0.014, Math.max(0.04, Math.min(ch.stabDec, gate * 0.6)));
        stF.frequency.setTargetAtTime(ch.stabCut[1], t, 0.003); stF.frequency.setTargetAtTime(ch.stabCut[0], t + 0.014, 0.11);
      }
    }
  }

  // ---- progress (OfflineAudioContext.suspend is not available everywhere)
  let fake = null;
  if (onProgress) {
    let real = false;
    try {
      if (typeof ctx.suspend === 'function') {
        const N = 16;
        for (let i = 1; i < N; i++) {
          const p = ctx.suspend((c.duration * i) / N);
          if (p && p.then) { real = true; p.then(() => { onProgress(i / N); ctx.resume(); }).catch(() => {}); }
        }
      }
    } catch (e) { /* fall back to a timer */ }
    if (!real) { let p = 0; fake = setInterval(() => { p += (0.95 - p) * 0.08; onProgress(p); }, 100); }
  }

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (buf) => {
      if (done) return; done = true; if (fake) clearInterval(fake);
      // normalise and fade the tail
      let peak = 0;
      for (let chn = 0; chn < buf.numberOfChannels; chn++) { const d = buf.getChannelData(chn); for (let i = 0; i < d.length; i += 2) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      const g = peak > 0 ? 0.92 / peak : 1, fadeN = Math.floor(sr * 0.6);
      for (let chn = 0; chn < buf.numberOfChannels; chn++) {
        const d = buf.getChannelData(chn), n = d.length;
        for (let i = 0; i < n; i++) d[i] *= g;
        for (let i = 0; i < fadeN; i++) d[n - 1 - i] *= i / fadeN;
      }
      if (onProgress) onProgress(1);
      resolve(buf);
    };
    ctx.oncomplete = (e) => finish(e.renderedBuffer);
    try { const r = ctx.startRendering(); if (r && r.then) r.then(finish, reject); } catch (e) { reject(e); }
  });
}

/** Dev helper: verify every pattern string is well-formed. */
export function validateSpec(spec) {
  const errs = [];
  for (const sec of spec.sections) {
    for (const k of ['kick', 'snare', 'clap', 'hat', 'bass', 'lead', 'bell', 'arp', 'stab']) {
      const p = sec[k]; if (!p) continue;
      const arr = Array.isArray(p) ? p : p.split('|');
      arr.forEach((s, i) => { if (s.length !== 16) errs.push(`${spec.id}/${sec.name}/${k}[${i}] len ${s.length}: "${s}"`); });
    }
  }
  return errs;
}
