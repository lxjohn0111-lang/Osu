// Gameplay logic: timing, judgement, scoring, energy, input and autoplay.
// Rendering lives in render.js; this module only owns state.
import { clamp, TAU, easeInOut } from './util.js';
import { AudioSys } from './audio.js';

export const MODS = {
  chill:     { name: 'CHILL',     desc: '0.75× speed. Learn the track.', mult: 0.5, rate: 0.75, excl: ['overdrive'] },
  overdrive: { name: 'OVERDRIVE', desc: '1.35× speed. Faster, higher, harder.', mult: 1.12, rate: 1.35, excl: ['chill'] },
  blackout:  { name: 'BLACKOUT',  desc: 'Notes fade out before you hit them.', mult: 1.06 },
  mirror:    { name: 'MIRROR',    desc: 'Flips the playfield.', mult: 1.0 },
  flawless:  { name: 'FLAWLESS',  desc: 'A single miss ends the run.', mult: 1.0, excl: ['nofail', 'auto'] },
  nofail:    { name: 'NO FAIL',   desc: 'Energy can never run out.', mult: 0.5, excl: ['flawless'] },
  auto:      { name: 'AUTOPLAY',  desc: 'Watch a perfect run. Unranked.', mult: 1.0, excl: ['flawless'], unranked: true },
};
export const MOD_ORDER = ['chill', 'overdrive', 'blackout', 'mirror', 'flawless', 'nofail', 'auto'];
export const JUDGE_NAMES = ['MISS', 'OK', 'GREAT', 'PERFECT'];
const VAL = [0, 0.25, 0.6, 1];

export function modMultiplier(mods) { let m = 1; for (const k of mods) if (MODS[k]) m *= MODS[k].mult; return Math.round(m * 100) / 100; }
export function rankOf(acc, misses, failed) {
  if (failed) return 'F';
  if (acc >= 0.9999) return 'S+';
  if (acc >= 0.95 && misses === 0) return 'S';
  if (acc >= 0.9) return 'A';
  if (acc >= 0.8) return 'B';
  if (acc >= 0.7) return 'C';
  return 'D';
}

export class Play {
  constructor({ map, track, buffer, mods, settings, fx, touch, onEnd, onFail }) {
    this.map = map; this.track = track; this.buffer = buffer; this.settings = settings; this.fx = fx; this.touch = touch;
    this.onEnd = onEnd; this.onFail = onFail;
    this.mods = new Set(mods); this.mult = modMultiplier(mods);
    this.auto = this.mods.has('auto'); this.nofail = this.mods.has('nofail') || this.auto; this.blackout = this.mods.has('blackout');
    this.rate = this.mods.has('chill') ? 0.75 : this.mods.has('overdrive') ? 1.35 : 1;
    const D = (this.D = map.D), lenient = map.exact ? 1 : 1.12;
    this.win = { p: D.win[0] * lenient * this.rate, g: D.win[1] * lenient * this.rate, ok: D.win[2] * lenient * this.rate };
    this.ar = D.ar;
    const mirror = this.mods.has('mirror');
    this.objs = map.objs.map((o) => {
      const c = Object.assign({}, o, { done: false, result: -1, shake: 0 });
      if (mirror) { c.x = 1 - c.x; if (c.path) c.path = c.path.map((p) => [1 - p[0], p[1]]); }
      if (c.type === 1) { c.ticks = o.ticks.map((t) => Object.assign({}, t)); c.ti = 0; c.headDone = false; c.partsHit = 0; c.partsTotal = 2 + c.ticks.length; c.following = false; c.lastFollow = -9; }
      if (c.type === 2) { c.rot = 0; c.angle = 0; c.need = Math.max(1.5, D.spin * (c.end - c.t) / this.rate * 0.6) * TAU; c.cleared = false; c.bonus = 0; c.rpm = 0; }
      return c;
    });
    this.N = this.objs.length; this.comboTotal = map.maxCombo;
    this.first = this.N ? this.objs[0].t : 1; this.last = this.N ? this.objs[this.N - 1].end : 1;
    this.breaks = [];
    for (let i = 1; i < this.N; i++) { const a = this.objs[i - 1].end, b = this.objs[i].t; if (b - a > 3.5 * this.rate) this.breaks.push([a + 0.6, b - this.ar - 0.2]); }
    this.head = 0; this.T = -3; this.maxT = -9; this.state = 'intro';
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.accSum = 0; this.judged = 0; this.counts = [0, 0, 0, 0];
    this.hp = 1; this.errors = []; this.recent = []; this.hpGraph = []; this._graphT = 0; this.fever = false; this.inBreak = false;
    this.ptrs = new Map(); this.mouse = { x: 0, y: 0, down: 0 }; this.ptrs.set('mouse', this.mouse);
    this.reviveUsed = false; this.failAt = 0; this.startedAt = 0; this.hits = 0; this.perfects = 0;
    this.autoFrom = null; this.lastHitT = -9; this.spinObj = null; this.spinMoved = 0; this.lastNow = 0;
  }

  // ---------------------------------------------------------------- layout
  layout(w, h) {
    const top = Math.max(58, h * 0.1), bot = Math.max(34, h * 0.07), side = Math.max(10, w * 0.035);
    const aw = w - side * 2, ah = h - top - bot, A = this.map.A;
    let fw = Math.min(aw, ah * A), fh = fw / A;
    if (fh > ah) { fh = ah; fw = fh * A; }
    // if the window changed shape a lot since generation, stretch rather than shrink to a stamp
    if (fw < aw * 0.7) fw = aw * 0.7; if (fh < ah * 0.7) fh = ah * 0.7;
    this.fx0 = (w - fw) / 2; this.fy0 = top + (ah - fh) / 2; this.fw = fw; this.fh = fh; this.w = w; this.h = h;
    this.R = clamp(this.D.r * Math.min(fh, fw * 1.1) * (this.touch ? 1.16 : 1), 16, 120);
    this.followR = this.R * 2.3;
    for (const o of this.objs) {
      o.px = this.fx0 + o.x * fw; o.py = this.fy0 + o.y * fh; o._spr = null;
      if (o.type === 1) {
        o.pp = o.path.map((p) => [this.fx0 + p[0] * fw, this.fy0 + p[1] * fh]);
        o.cum = [0]; for (let i = 1; i < o.pp.length; i++) o.cum.push(o.cum[i - 1] + Math.hypot(o.pp[i][0] - o.pp[i - 1][0], o.pp[i][1] - o.pp[i - 1][1]));
        o.len = o.cum[o.cum.length - 1];
      }
      if (o.type === 2) { o.px = this.fx0 + fw / 2; o.py = this.fy0 + fh / 2; }
    }
    if (!this.mouse.x && !this.mouse.y) { this.mouse.x = w / 2; this.mouse.y = h / 2; }
  }
  pointAt(o, f) {
    const d = clamp(f, 0, 1) * o.len, cum = o.cum; let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, k = (d - cum[i - 1]) / seg, a = o.pp[i - 1], b = o.pp[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  sliderFrac(o, T) {
    const p = clamp((T - o.t) / (o.end - o.t), 0, 1) * o.repeats;
    let span = Math.floor(p), f = p - span;
    if (span >= o.repeats) { span = o.repeats - 1; f = 1; }
    return { span, f: span % 2 ? 1 - f : f };
  }
  sliderPos(o, T) { return this.pointAt(o, this.sliderFrac(o, T).f); }

  // ------------------------------------------------------------- transport
  timeAt(perf) { return AudioSys.musicTime(perf) - (this.settings.offset / 1000) * this.rate; }
  _startAt(songT, fade = 0.2) {
    if (songT < 0) AudioSys.playMusic(this.buffer, { offset: 0, rate: this.rate, delay: -songT / this.rate });
    else AudioSys.playMusic(this.buffer, { offset: songT, rate: this.rate, fade });
  }
  start() {
    const lead = Math.max(1.0, 2.4 - (this.first - this.ar) / this.rate);
    this._startAt(-lead * this.rate);
    this.state = 'playing'; this.startedAt = performance.now();
  }
  canSkip() { return this.state === 'playing' && this.head === 0 && this.first - this.ar - this.T > 3 * this.rate; }
  skip() { if (this.canSkip()) { this._startAt(this.first - this.ar - 1.3 * this.rate, 0.4); AudioSys.sfx('click'); } }
  pause() {
    if (this.state !== 'playing') return false;
    this.pausedT = this.T; AudioSys.stopMusic(0.06); this.state = 'paused'; this._releaseAll();
    return true;
  }
  resume() {
    if (this.state !== 'paused') return;
    this._startAt(this.pausedT - 1.2 * this.rate, 0.5); this.state = 'playing';
  }
  revive() {
    this.hp = 0.6; this.reviveUsed = true; this.state = 'playing'; this._releaseAll();
    this._startAt(this.T - 1.6 * this.rate, 0.6);
  }
  stop() { this.state = 'done'; AudioSys.stopMusic(0.2); }
  _releaseAll() { this.mouse.down = 0; for (const [id] of this.ptrs) if (id !== 'mouse') this.ptrs.delete(id); for (const o of this.objs) if (o.type === 1) o.following = false; }

  // ----------------------------------------------------------------- input
  move(id, x, y) {
    const p = this.ptrs.get(id); if (!p) return;
    p.x = x; p.y = y;
    // spinning is integrated per pointer event, so it stays accurate even at low frame rates
    const o = this.spinObj;
    if (o && p.down > 0 && this.state === 'playing' && !this.auto) {
      const dx = x - o.px, dy = y - o.py;
      if (dx * dx + dy * dy > 64) {
        const a = Math.atan2(dy, dx);
        if (p.sa != null) { let d = a - p.sa; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; if (Math.abs(d) < 2.6) { o.rot += Math.abs(d); o.angle += d; this.spinMoved += Math.abs(d); } }
        p.sa = a;
      }
    } else p.sa = null;
  }
  press(id, perf, x, y) {
    if (this.auto || (this.state !== 'playing')) return;
    let p = this.ptrs.get(id);
    if (!p) { p = { x, y, down: 0 }; this.ptrs.set(id, p); }
    if (x != null) { p.x = x; p.y = y; }
    p.down++; p.sa = null;
    this._tap(this.timeAt(perf), p.x, p.y);
  }
  release(id) {
    const p = this.ptrs.get(id); if (!p) return;
    p.down = Math.max(0, p.down - 1);
    if (id !== 'mouse' && p.down === 0) this.ptrs.delete(id);
  }
  holders() { const out = []; for (const p of this.ptrs.values()) if (p.down > 0) out.push(p); return out; }

  _tap(T, x, y) {
    this.fx.click(x, y);
    const slop = this.R * (this.touch ? 1.2 : 1.04), now = performance.now();
    for (let i = this.head; i < this.N; i++) {
      const o = this.objs[i];
      if (o.done || o.type === 2 || (o.type === 1 && o.headDone)) continue;
      const dt = T - o.t, dx = x - o.px, dy = y - o.py, inside = dx * dx + dy * dy <= slop * slop;
      if (dt < -this.win.ok) { if (inside && dt > -this.ar) o.shake = now; break; }
      if (!inside) continue;
      const a = Math.abs(dt), kind = a <= this.win.p ? 3 : a <= this.win.g ? 2 : 1;
      this._error(dt);
      if (o.type === 0) this._judge(o, kind);
      else {
        o.headDone = true; o.headKind = kind; o.partsHit++; this._addCombo(); this._heal(kind);
        this.fx.part(o.px, o.py, o, kind); this._hitSound(o, kind);
      }
      return;
    }
  }
  _error(dt) {
    const ms = (dt / this.rate) * 1000;
    this.errors.push(ms); this.recent.push({ ms, at: performance.now() }); if (this.recent.length > 28) this.recent.shift();
  }
  _hitSound(o, kind) {
    const pan = clamp(((o.px - this.w / 2) / this.w) * 1.2, -0.6, 0.6);
    if (this.settings.melodic && o.midi != null) {
      AudioSys.sfx('pluck', { vol: kind === 3 ? 0.8 : 0.55, rate: Math.pow(2, (o.midi - 72) / 12) * this.rate, pan });
      AudioSys.sfx('hitsoft', { vol: 0.5, pan });
    } else AudioSys.sfx(kind === 3 ? 'hit' : 'hitsoft', { vol: 0.9, pan });
  }

  // ------------------------------------------------------------- judgement
  _addCombo() {
    this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.fx.combo(this.combo);
    if (this.combo === 50 || (this.combo > 0 && this.combo % 100 === 0)) { this.fx.milestone(this.combo); AudioSys.sfx('milestone', { vol: 0.7 }); }
  }
  _breakCombo() {
    if (this.combo >= 20) { AudioSys.sfx('break', { vol: 0.7 }); this.fx.comboBreak(this.combo); }
    this.combo = 0;
  }
  _heal(kind) { this.hp = Math.min(1, this.hp + [0, 0.006, 0.02, 0.034][kind]); }
  _hurt(v) {
    this.hp -= v * this.D.hp;
    if (this.mods.has('flawless')) this.hp = -1;
  }
  _judge(o, kind) {
    o.done = true; o.result = kind; this.counts[kind]++; this.accSum += VAL[kind]; this.judged++;
    if (o.type !== 1) { if (kind > 0) this._addCombo(); else this._breakCombo(); }
    if (kind > 0) { this._heal(kind); this.hits++; if (kind === 3) this.perfects++; } else this._hurt(0.085);
    let x = o.px, y = o.py;
    if (o.type === 1) { const e = this.sliderPos(o, o.end); x = e[0]; y = e[1]; }
    this.fx.judge(o, kind, x, y);
    if (o.type === 0) { if (kind > 0) this._hitSound(o, kind); else AudioSys.sfx('miss', { vol: 0.35 }); }
    else if (o.type === 1) AudioSys.sfx(kind > 0 ? 'slideend' : 'miss', { vol: kind > 0 ? 0.6 : 0.35 });
    else AudioSys.sfx(kind > 0 ? 'milestone' : 'miss', { vol: 0.5 });
    this.lastHitT = this.T;
  }
  get acc() { return this.judged ? this.accSum / this.judged : 1; }
  calcScore() {
    const base = this.N ? 850000 * (this.accSum / this.N) + 150000 * (this.maxCombo / Math.max(1, this.comboTotal)) : 0;
    return Math.round(base * this.mult);
  }

  // ---------------------------------------------------------------- update
  update(now) {
    if (this.state === 'failing') { if (now - this.failAt > 1700) { this.state = 'failed'; this.onFail(this); } return; }
    if (this.state !== 'playing') return;
    const T = this.timeAt(now), prevT = this.T; this.T = T;
    const adv = T > this.maxT ? Math.min(0.1, T - Math.max(this.maxT, prevT)) : 0;
    if (T > this.maxT) this.maxT = T;

    let fev = false; for (const f of this.map.fever) if (T >= f[0] && T < f[1]) { fev = true; break; }
    if (fev !== this.fever) { this.fever = fev; this.fx.fever(fev); if (fev) AudioSys.sfx('fever', { vol: 0.45 }); }
    let br = T < this.first - this.ar || T > this.last; for (const b of this.breaks) if (T >= b[0] && T < b[1]) { br = true; break; }
    this.inBreak = br;

    if (this.auto) this._autoCursor(T);
    const holders = this.auto ? null : this.holders();

    this.spinObj = null;
    while (this.head < this.N && this.objs[this.head].done) this.head++;
    for (let i = this.head; i < this.N; i++) {
      const o = this.objs[i];
      if (o.t - this.ar > T + 0.05) break;
      if (o.done) continue;
      if (o.type === 0) {
        if (this.auto) { if (T >= o.t) { this.fx.click(o.px, o.py); this._judge(o, 3); } }
        else if (T > o.t + this.win.ok) this._judge(o, 0);
      } else if (o.type === 1) this._updSlider(o, T, holders);
      else this._updSpinner(o, T, holders, adv);
    }

    // energy
    if (adv > 0 && !br) this.hp -= (adv / this.rate) * 0.04 * this.D.hp;
    if (this.hp > 1) this.hp = 1;
    if (this.hp <= 0) {
      if (this.nofail) this.hp = 0;
      else { this._fail(now); return; }
    }
    this.lastNow = now;
    this.score = this.calcScore();
    if (T - this._graphT > 0.5) { this._graphT = T; this.hpGraph.push(Math.max(0, this.hp)); }

    if (this.head >= this.N && T > this.last + 1.3 * this.rate) this._finish();
    else if (AudioSys.music && AudioSys.music.ended && T > this.last) this._finish();
  }
  _updSlider(o, T, holders) {
    if (!o.headDone) {
      if (this.auto) { if (T >= o.t) { o.headDone = true; o.headKind = 3; o.partsHit++; this._addCombo(); this._heal(3); this.fx.click(o.px, o.py); this.fx.part(o.px, o.py, o, 3); this._hitSound(o, 3); } }
      else if (T > o.t + this.win.ok) { o.headDone = true; o.headKind = 0; this._breakCombo(); this._hurt(0.04); this.fx.part(o.px, o.py, o, 0); }
    }
    if (T < o.t) return;
    const pos = this.sliderPos(o, T);
    let fol = this.auto;
    if (!fol) for (const p of holders) { const dx = p.x - pos[0], dy = p.y - pos[1]; if (dx * dx + dy * dy <= this.followR * this.followR) { fol = true; break; } }
    o.following = fol; if (fol) o.lastFollow = T;
    while (o.ti < o.ticks.length && T >= o.ticks[o.ti].t) {
      const tk = o.ticks[o.ti++], tp = this.pointAt(o, this.sliderFrac(o, tk.t).f);
      if (fol || tk.t - o.lastFollow < 0.05) { o.partsHit++; this._addCombo(); this.hp = Math.min(1, this.hp + 0.012); this.fx.part(tp[0], tp[1], o, 3, true); AudioSys.sfx(tk.kind ? 'slideend' : 'tick', { vol: 0.5 }); }
      else { this._breakCombo(); this._hurt(0.03); this.fx.part(tp[0], tp[1], o, 0, true); }
    }
    if (T >= o.end) {
      if (fol || o.end - o.lastFollow < 0.09) { o.partsHit++; this._addCombo(); }
      const r = o.partsHit / o.partsTotal;
      this._judge(o, r >= 0.999 ? 3 : r >= 0.5 ? 2 : r > 0 ? 1 : 0);
    }
  }
  _updSpinner(o, T, holders, adv) {
    if (T < o.t) return;
    if (this.auto) { const d = (adv / this.rate) * TAU * 7.5; o.rot += d; o.angle += d; o.rpm = 450; }
    else {
      this.spinObj = o;
      const dtr = Math.max(0.004, (performance.now() - this.lastNow) / 1000);
      o.rpm += ((this.spinMoved / dtr) * 60 / TAU - o.rpm) * 0.15; this.spinMoved = 0;
    }
    if (!o.cleared && o.rot >= o.need) { o.cleared = true; this.fx.spinClear(o); AudioSys.sfx('spin', { vol: 0.8 }); }
    if (o.cleared) { const b = Math.floor((o.rot - o.need) / TAU); if (b > o.bonus) { o.bonus = b; this.hp = Math.min(1, this.hp + 0.02); AudioSys.sfx('spin', { vol: 0.5, rate: 1 + Math.min(8, b) * 0.06 }); this.fx.spinBonus(o); } }
    if (T >= o.end) { const r = o.rot / o.need; this.spinObj = null; this._judge(o, r >= 1 ? 3 : r >= 0.75 ? 2 : r >= 0.4 ? 1 : 0); }
  }
  _autoCursor(T) {
    let o = null; for (let i = this.head; i < this.N; i++) if (!this.objs[i].done) { o = this.objs[i]; break; }
    const m = this.mouse;
    if (!o) return;
    if (o.type === 1 && T >= o.t) { const p = this.sliderPos(o, T); m.x = p[0]; m.y = p[1]; this.autoFrom = { x: m.x, y: m.y, t: T }; }
    else if (o.type === 2 && T >= o.t) { const r = Math.min(this.fw, this.fh) * 0.16; m.x = o.px + Math.cos(o.angle) * r; m.y = o.py + Math.sin(o.angle) * r; this.autoFrom = { x: m.x, y: m.y, t: T }; }
    else {
      const from = this.autoFrom || { x: this.w / 2, y: this.h / 2, t: o.t - 1 };
      const t0 = Math.max(from.t, o.t - 0.42 * this.rate), k = o.t > t0 ? clamp((T - t0) / (o.t - t0), 0, 1) : 1, e = easeInOut(k);
      m.x = from.x + (o.px - from.x) * e; m.y = from.y + (o.py - from.y) * e;
      if (k >= 1) this.autoFrom = { x: o.px, y: o.py, t: o.t };
    }
    if (o.type === 0 && T >= o.t) this.autoFrom = { x: o.px, y: o.py, t: T };
  }
  _fail(now) {
    this.hp = 0; this.state = 'failing'; this.failAt = now; this._releaseAll();
    AudioSys.tapeStop(); AudioSys.sfx('fail', { vol: 0.8 }); this.fx.fail();
  }
  _finish() {
    if (this.state === 'done') return;
    this.state = 'done'; AudioSys.stopMusic(1.2);
    this.onEnd(this.results(false));
  }
  results(failed) {
    const acc = this.N ? this.accSum / (failed ? Math.max(1, this.judged) : this.N) : 0;
    const e = this.errors, mean = e.length ? e.reduce((a, b) => a + b, 0) / e.length : 0;
    const sd = e.length ? Math.sqrt(e.reduce((a, b) => a + (b - mean) * (b - mean), 0) / e.length) : 0;
    return {
      score: this.calcScore(), acc, maxCombo: this.maxCombo, comboTotal: this.comboTotal, counts: this.counts.slice(),
      rank: rankOf(acc, this.counts[0], failed), fc: !failed && this.counts[0] === 0 && this.maxCombo >= this.comboTotal - 0,
      errors: e.slice(), meanErr: mean, sdErr: sd, hpGraph: this.hpGraph.slice(), failed, mods: Array.from(this.mods), mult: this.mult,
      auto: this.auto, hits: this.hits, perfects: this.perfects, diff: this.map.diff, progress: clamp((this.T - this.first) / Math.max(1, this.last - this.first), 0, 1),
    };
  }
}
