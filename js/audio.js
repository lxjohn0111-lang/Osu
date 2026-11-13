// Live audio: music transport with a smooth, latency-compensated clock, synthesised
// sound effects, and an analyser that drives the visuals.
import { clamp } from './util.js';

function mk(ctx, dur, fn) {
  const sr = ctx.sampleRate, n = Math.floor(dur * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = fn(i / sr, i / n);
  const f = Math.min(n, 64); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
  return b;
}
const S = (f, t) => Math.sin(2 * Math.PI * f * t);
const rnd = () => Math.random() * 2 - 1;

export const AudioSys = {
  ctx: null, ready: false, music: null, latency: 0, vol: { master: 0.8, music: 0.85, sfx: 0.7 },
  _lc: 0, _lp: 0, _frozen: 0, _muted: false, _adMute: false,
  bass: 0, mid: 0, high: 0, spectrum: new Float32Array(64), _bins: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain(); this.sfxGain = ctx.createGain();
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 22000; this.lp.Q.value = 0.5;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.72;
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.lp); this.lp.connect(this.analyser); this.analyser.connect(this.musicGain); this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this._bins = new Uint8Array(this.analyser.frequencyBinCount);
    this._buildSfx();
    this.applyVolume();
    this.ready = true;
  },
  async unlock() {
    this.init();
    if (this.ctx.state !== 'running' && !this._adMute) { try { await this.ctx.resume(); } catch (e) { /* needs gesture */ } }
  },
  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); },
  setMuted(m) { this._muted = m; this.applyVolume(); },
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._muted || this._adMute ? 0 : this.vol.master, t, 0.02);
    this.musicGain.gain.setTargetAtTime(this.vol.music, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
  },
  /** Ads must play with the game silent: suspend the whole context while one is showing. */
  adMute(on) {
    this._adMute = on; if (!this.ctx) return;
    this.applyVolume();
    if (on) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
  },

  // ------------------------------------------------------------------ clock
  tick() {
    if (!this.ctx) return;
    const c = this.ctx.currentTime;
    if (c !== this._lc) { this._lc = c; this._lp = performance.now(); }
    const l = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    this.latency = isFinite(l) ? clamp(l, 0, 0.25) : 0;
  },
  ctxTimeAt(perf) {
    if (!this.ctx || this.ctx.state !== 'running') return this._lc;
    return this._lc + clamp((perf - this._lp) / 1000, -0.05, 0.05);
  },
  /** Position (seconds) of the music the player is hearing at performance-time `perf`. */
  musicTime(perf = performance.now()) {
    const m = this.music; if (!m) return this._frozen;
    let t = (this.ctxTimeAt(perf) - m.startCtx) * m.rate + m.offset - this.latency * m.rate;
    if (m.loop) { const d = m.buf.duration; t = ((t % d) + d) % d; }
    return t;
  },
  playMusic(buf, { offset = 0, rate = 1, delay = 0, loop = false, fade = 0, vol = 1 } = {}) {
    this.stopMusic(0.04);
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; src.loop = loop;
    src.connect(g); g.connect(this.musicIn);
    const t0 = ctx.currentTime + 0.05 + delay;
    if (fade > 0) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + fade); } else g.gain.value = vol;
    offset = clamp(offset, 0, Math.max(0, buf.duration - 0.05));
    src.start(t0, offset);
    const m = (this.music = { src, g, buf, startCtx: t0, offset, rate, loop, ended: false, vol });
    src.onended = () => { m.ended = true; };
    this.setLowpass(22000, 0.05);
    return m;
  },
  stopMusic(fade = 0.15) {
    const m = this.music; if (!m) return;
    this._frozen = this.musicTime(); this.music = null;
    try {
      const now = this.ctx.currentTime;
      m.g.gain.cancelScheduledValues(now); m.g.gain.setValueAtTime(m.g.gain.value, now); m.g.gain.linearRampToValueAtTime(0, now + fade);
      m.src.stop(now + fade + 0.03);
    } catch (e) { /* already stopped */ }
  },
  setLowpass(hz, tau = 0.2) { if (this.ctx) this.lp.frequency.setTargetAtTime(hz, this.ctx.currentTime, tau); },
  /** Tape-stop effect used when the player fails. */
  tapeStop() {
    const m = this.music; if (!m) return;
    this._frozen = this.musicTime(); this.music = null;
    const now = this.ctx.currentTime;
    try { m.src.playbackRate.setTargetAtTime(0.01, now, 0.4); m.g.gain.setTargetAtTime(0, now + 0.9, 0.3); m.src.stop(now + 2.4); } catch (e) { /* ignore */ }
    this.setLowpass(500, 0.5);
  },

  // --------------------------------------------------------------- analysis
  analyse() {
    if (!this.ctx) return;
    this.analyser.getByteFrequencyData(this._bins);
    const b = this._bins, n = b.length, hz = this.ctx.sampleRate / 2 / n;
    const band = (lo, hi) => { let s = 0, c = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(n - 1, Math.ceil(hi / hz)); i++) { s += b[i]; c++; } return c ? s / c / 255 : 0; };
    const bs = band(40, 160), md = band(300, 2000), hg = band(4000, 12000);
    this.bass += (bs - this.bass) * (bs > this.bass ? 0.6 : 0.12);
    this.mid += (md - this.mid) * 0.3; this.high += (hg - this.high) * 0.3;
    const sp = this.spectrum, N = sp.length;
    for (let i = 0; i < N; i++) {
      const f0 = 50 * Math.pow(220, i / N), f1 = 50 * Math.pow(220, (i + 1) / N);
      const v = Math.pow(band(f0, f1), 1.4) * (0.75 + (i / N) * 0.9);
      sp[i] += (v - sp[i]) * (v > sp[i] ? 0.55 : 0.14);
    }
  },

  // -------------------------------------------------------------------- sfx
  _buildSfx() {
    const c = this.ctx, B = (this.sfxBuf = {});
    B.hit = mk(c, 0.09, (t) => (S(1900, t) * Math.exp(-t * 70) * 0.35 + rnd() * Math.exp(-t * 220) * 0.4 + S(440, t) * Math.exp(-t * 50) * 0.5) * 0.9);
    B.hitsoft = mk(c, 0.08, (t) => (S(900, t) * Math.exp(-t * 70) * 0.3 + rnd() * Math.exp(-t * 260) * 0.25 + S(300, t) * Math.exp(-t * 55) * 0.4) * 0.8);
    B.pluck = mk(c, 0.42, (t) => { const w = 523.25; return (S(w, t) + 0.45 * S(2 * w, t) * Math.exp(-t * 14) + 0.2 * S(3 * w, t) * Math.exp(-t * 24) + 0.1 * S(5 * w, t) * Math.exp(-t * 40)) * Math.exp(-t * 9) * Math.min(1, t * 600) * 0.55; });
    B.tick = mk(c, 0.04, (t) => S(2600, t) * Math.exp(-t * 110) * 0.35);
    B.slideend = mk(c, 0.12, (t) => (S(1320, t) + 0.5 * S(1980, t)) * Math.exp(-t * 32) * 0.3);
    B.miss = mk(c, 0.2, (t) => { const f = 150 - 380 * t; return (S(Math.max(40, f), t) * 0.7 + rnd() * 0.25 * Math.exp(-t * 40)) * Math.exp(-t * 16) * 0.6; });
    B.break = mk(c, 0.34, (t) => { const f = 420 * Math.exp(-t * 5.5); const ph = (f * t) % 1; return (ph * 2 - 1) * 0.35 * Math.exp(-t * 7) + rnd() * 0.12 * Math.exp(-t * 20); });
    B.spin = mk(c, 0.22, (t) => (S(1568, t) + 0.5 * S(2352, t) + 0.25 * S(3136, t)) * Math.exp(-t * 18) * 0.28);
    B.click = mk(c, 0.07, (t) => (S(1100, t) * 0.5 + S(1650, t) * 0.3) * Math.exp(-t * 60) * 0.5);
    B.hover = mk(c, 0.035, (t) => S(1800, t) * Math.exp(-t * 130) * 0.16);
    B.back = mk(c, 0.1, (t) => S(620 - 900 * t, t) * Math.exp(-t * 34) * 0.45);
    B.start = mk(c, 0.75, (t) => { let v = 0; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const tt = t - i * 0.07; if (tt > 0) v += (S(f, tt) + 0.4 * S(f * 2, tt)) * Math.exp(-tt * 7) * 0.2; }); return v + rnd() * 0.05 * Math.exp(-t * 6); });
    B.milestone = mk(c, 0.7, (t) => { let v = 0; [1046.5, 1318.5, 1568, 2093].forEach((f, i) => { const tt = t - i * 0.045; if (tt > 0) v += S(f, tt) * Math.exp(-tt * 8) * 0.16; }); return v; });
    B.fail = mk(c, 1.3, (t) => { const f = 320 * Math.exp(-t * 2.4) + 35; const ph = (f * t) % 1; return ((ph * 2 - 1) * 0.3 + S(f / 2, t) * 0.4) * Math.exp(-t * 2.2) + rnd() * 0.08 * Math.exp(-t * 5); });
    B.rank = mk(c, 1.1, (t, p) => { const sw = rnd() * Math.pow(Math.min(1, t / 0.32), 3) * (t < 0.32 ? 0.35 : 0.35 * Math.exp(-(t - 0.32) * 9)); const tt = Math.max(0, t - 0.32); const boom = t > 0.32 ? S(70 * Math.exp(-tt * 3) + 35, tt) * Math.exp(-tt * 5) * 0.8 : 0; const ch = t > 0.32 ? (S(1046.5, tt) + S(1568, tt) + S(2093, tt)) * Math.exp(-tt * 6) * 0.1 : 0; return sw + boom + ch; });
    B.fanfare = mk(c, 1.5, (t) => { let v = 0; [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3], [1318.5, 0.42], [1568, 0.42], [2093, 0.42]].forEach(([f, d]) => { const tt = t - d; if (tt > 0) v += (S(f, tt) + 0.3 * S(f * 2, tt) + 0.15 * S(f * 3, tt)) * Math.exp(-tt * (d > 0.4 ? 3 : 8)) * 0.13; }); return v; });
    B.fever = mk(c, 0.8, (t) => rnd() * Math.exp(-t * 5) * 0.3 * (0.6 + 0.4 * S(9, t)) + S(90 * Math.exp(-t * 4) + 40, t) * Math.exp(-t * 6) * 0.6);
  },
  sfx(name, { vol = 1, rate = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const b = this.sfxBuf[name]; if (!b) return;
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; src.playbackRate.value = rate; g.gain.value = vol;
    src.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.sfxGain); }
    else g.connect(this.sfxGain);
    src.start();
  },
  decode(arrayBuffer) {
    return new Promise((resolve, reject) => {
      try { const p = this.ctx.decodeAudioData(arrayBuffer, resolve, reject); if (p && p.catch) p.catch(reject); } catch (e) { reject(e); }
    });
  },
};
