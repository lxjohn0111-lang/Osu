// Canvas renderer: playfield objects, hit effects, particles, cursor, HUD and the
// menu visualiser. Sits on top of the WebGL backdrop.
import { clamp, lerp, TAU, hexToRgb, rgba, mixRgb, easeOutCubic, easeOutBack, easeOutQuint, hslToRgb } from './util.js';
import { AudioSys } from './audio.js';

export const SKINS = {
  orb:   { name: 'Orb',   level: 1 },
  ring:  { name: 'Halo',  level: 3 },
  prism: { name: 'Prism', level: 6 },
  nova:  { name: 'Nova',  level: 10 },
};
export const PALS = {
  track:  { name: 'Track Colors', level: 1, colors: null },
  aurora: { name: 'Aurora',  level: 2,  colors: ['#7cf5ff', '#b08cff', '#ff7ad9', '#7dffb2'] },
  sunset: { name: 'Sunset',  level: 4,  colors: ['#ff9e5e', '#ff5e7e', '#ffd15e', '#c96bff'] },
  cyber:  { name: 'Cyber',   level: 7,  colors: ['#00ffa3', '#00d0ff', '#f5ff3d', '#ff3df5'] },
  candy:  { name: 'Candy',   level: 9,  colors: ['#ff8fd0', '#8fd0ff', '#fff08f', '#b4ff8f'] },
  mono:   { name: 'Mono',    level: 12, colors: ['#ffffff', '#c8d2e0', '#8fa0b8', '#e8ecf5'] },
};
export const TRAILS = {
  comet:   { name: 'Comet',   level: 1 },
  ribbon:  { name: 'Ribbon',  level: 3 },
  spark:   { name: 'Sparks',  level: 5 },
  rainbow: { name: 'Rainbow', level: 8 },
};
const JCOL = [[255, 77, 109], [120, 255, 170], [95, 200, 255], [255, 214, 102]];
const JTXT = ['MISS', 'OK', 'GREAT', 'PERFECT'];
const WHITE = [255, 255, 255];
const FONT_D = '"Orbitron", "Rajdhani", system-ui, sans-serif';
const FONT_U = '"Rajdhani", system-ui, "Segoe UI", sans-serif';

function shapePath(c, skin, r) {
  c.beginPath();
  if (skin === 'prism') { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * TAU) / 6; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.06, Math.sin(a) * r * 1.06); } c.closePath(); }
  else if (skin === 'nova') { for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * TAU) / 16, rr = i % 2 ? r * 0.9 : r * 1.08; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }
  else c.arc(0, 0, r, 0, TAU);
}

export class Renderer {
  constructor(canvas, bg) {
    this.cv = canvas; this.c = canvas.getContext('2d'); this.bg = bg;
    this.w = 1; this.h = 1; this.dpr = 1; this.quality = 'high'; this.pq = 1;
    this.skin = 'orb'; this.pal = 'track'; this.trail = 'comet'; this.cursorSize = 1;
    this.track = [[255, 45, 149], [122, 60, 255], [0, 229, 255]]; this.colors = []; this._setColors();
    this.sprites = new Map(); this.glows = new Map();
    this.P = []; this.bursts = []; this.texts = []; this.clicks = []; this.trailPts = [];
    this.shake = 0; this.flash = 0; this.flashCol = WHITE; this.feverT = -9; this.feverOn = false; this.banner = null;
    this.comboPop = 0; this.dispScore = 0; this.dispHp = 1; this.last = performance.now(); this.failT = 0;
    this.cur = { x: 0, y: 0, seen: false }; this.beat = 0; this.fps = 60; this.showFps = false; this.menuSpin = 0;
  }
  setQuality(q) { this.quality = q; this.pq = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1; this.resize(); }
  resize() {
    const cap = this.quality === 'low' ? 1 : this.quality === 'medium' ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.sprites.clear();
  }
  setStyle({ skin, pal, trail }) { if (skin) this.skin = skin; if (pal) this.pal = pal; if (trail) this.trail = trail; this._setColors(); this.sprites.clear(); }
  setTrackPalette(hexes) { this.track = hexes.map(hexToRgb); this._setColors(); this.sprites.clear(); }
  _setColors() {
    const p = PALS[this.pal];
    if (p && p.colors) this.colors = p.colors.map(hexToRgb);
    else { const [a, b, c] = this.track; this.colors = [a, c, mixRgb(b, WHITE, 0.25), mixRgb(a, c, 0.5)].map((x) => mixRgb(x, WHITE, 0.08)); }
  }
  reset() { this.P.length = 0; this.bursts.length = 0; this.texts.length = 0; this.clicks.length = 0; this.shake = 0; this.flash = 0; this.banner = null; this.feverOn = false; this.comboPop = 0; this.dispScore = 0; this.dispHp = 1; this.failT = 0; this.sprites.clear(); }

  // ---------------------------------------------------------------- sprites
  glow(col) {
    const k = (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0);
    let g = this.glows.get(k);
    if (!g) {
      g = document.createElement('canvas'); g.width = g.height = 64; const c = g.getContext('2d');
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(mixRgb(col, WHITE, 0.6), 1)); gr.addColorStop(0.25, rgba(col, 0.55)); gr.addColorStop(1, rgba(col, 0));
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64); this.glows.set(k, g);
      if (this.glows.size > 64) this.glows.delete(this.glows.keys().next().value);
    }
    return g;
  }
  noteSprite(ci, R) {
    const key = ci + '|' + Math.round(R);
    let s = this.sprites.get(key); if (s) return s;
    const col = this.colors[ci % this.colors.length], half = Math.ceil(R * 1.7), d = this.dpr;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(half * 2 * d);
    const c = cv.getContext('2d'); c.scale(d, d); c.translate(half, half);
    let g = c.createRadialGradient(0, 0, R * 0.75, 0, 0, R * 1.65);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.18)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.65, 0, TAU); c.fill();
    c.lineJoin = 'round';
    shapePath(c, this.skin, R * 0.93);
    if (this.skin === 'ring') { c.fillStyle = rgba(mixRgb(col, [8, 8, 20], 0.86), 0.72); c.fill(); }
    else {
      g = c.createRadialGradient(-R * 0.3, -R * 0.38, R * 0.05, 0, 0, R);
      g.addColorStop(0, rgba(mixRgb(col, WHITE, 0.62), 1)); g.addColorStop(0.5, rgba(col, 1)); g.addColorStop(1, rgba(mixRgb(col, [6, 4, 24], 0.62), 1));
      c.fillStyle = g; c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.96)'; c.lineWidth = Math.max(2, R * 0.1); c.stroke();
    shapePath(c, this.skin, R * 0.7);
    if (this.skin === 'ring') { c.strokeStyle = rgba(col, 0.95); c.lineWidth = Math.max(2, R * 0.1); } else { c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = Math.max(1, R * 0.035); }
    c.stroke();
    if (this.skin !== 'ring') {
      c.save(); shapePath(c, this.skin, R * 0.88); c.clip();
      g = c.createLinearGradient(0, -R, 0, R * 0.1); g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, -R * 0.42, R * 0.62, R * 0.4, 0, 0, TAU); c.fill(); c.restore();
    }
    s = { cv, half }; this.sprites.set(key, s); return s;
  }
  sliderSprite(o, R) {
    if (o._spr) return o._spr;
    const col = this.colors[o.ci % this.colors.length], d = this.dpr, pad = R + 8;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of o.pp) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const cv = document.createElement('canvas'); cv.width = Math.ceil((x1 - x0) * d); cv.height = Math.ceil((y1 - y0) * d);
    const c = cv.getContext('2d'); c.scale(d, d); c.translate(-x0, -y0); c.lineCap = 'round'; c.lineJoin = 'round';
    const path = () => { c.beginPath(); c.moveTo(o.pp[0][0], o.pp[0][1]); for (let i = 1; i < o.pp.length; i++) c.lineTo(o.pp[i][0], o.pp[i][1]); };
    path(); c.strokeStyle = rgba(col, 0.28); c.lineWidth = R * 2 + 10; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = R * 1.92; c.stroke();
    c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.lineWidth = R * 1.92 - Math.max(4, R * 0.2); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = rgba(mixRgb(col, [6, 6, 22], 0.78), 0.8); c.stroke();
    c.strokeStyle = rgba(col, 0.2); c.lineWidth = R * 1.1; c.stroke();
    c.strokeStyle = rgba(mixRgb(col, WHITE, 0.4), 0.2); c.lineWidth = R * 0.4; c.stroke();
    o._spr = { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return o._spr;
  }

  // -------------------------------------------------------------- fx hooks
  spawn(x, y, col, n, speed = 260, life = 0.5, size = 2.4, grav = 0) {
    n = Math.max(1, Math.round(n * this.pq));
    for (let i = 0; i < n && this.P.length < 900; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.9);
      this.P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), col, grav, t: 0 });
    }
  }
  click(x, y) { this.clicks.push({ x, y, t: performance.now() }); if (this.clicks.length > 12) this.clicks.shift(); }
  judge(o, kind, x, y) {
    const now = performance.now(), col = this.colors[o.ci % this.colors.length], R = this._R || 30;
    if (kind > 0) {
      this.bursts.push({ x, y, col, t: now, R, ci: o.ci, kind, sprite: o.type === 0 });
      this.spawn(x, y, kind === 3 ? mixRgb(col, WHITE, 0.4) : col, kind === 3 ? 16 : 9, R * 7, 0.5, R * 0.07);
      if (kind === 3) this.spawn(x, y, JCOL[3], 5, R * 4, 0.6, R * 0.06);
      if (this.bg && (kind === 3 || o.type !== 0)) this.bg.ripple(x, y);
    } else {
      this.bursts.push({ x, y, col: JCOL[0], t: now, R, ci: o.ci, kind: 0, sprite: o.type === 0 });
      if (this.allowShake) this.shake = Math.min(1, this.shake + 0.55);
    }
    this.texts.push({ x, y: y - R * 1.25, s: JTXT[kind], col: JCOL[kind], t: now, size: R * (kind === 3 ? 0.46 : 0.5) });
    if (this.texts.length > 40) this.texts.shift();
  }
  part(x, y, o, kind, tick) {
    const col = this.colors[o.ci % this.colors.length], R = this._R || 30, now = performance.now();
    if (kind > 0) { this.bursts.push({ x, y, col, t: now, R: tick ? R * 0.6 : R, ci: o.ci, kind, sprite: false }); this.spawn(x, y, col, tick ? 5 : 10, R * 5, 0.4, R * 0.06); }
    else this.texts.push({ x, y: y - R, s: '×', col: JCOL[0], t: now, size: R * 0.6 });
  }
  combo() { this.comboPop = 1; }
  milestone(n) {
    this.banner = { s: n + ' COMBO', t: performance.now(), col: JCOL[3] };
    const cx = this.w / 2, cy = this.h * 0.42;
    for (let i = 0; i < 3; i++) this.spawn(cx + (i - 1) * 120, cy, this.colors[i % this.colors.length], 26, 520, 0.9, 3, 300);
    this.flash = Math.max(this.flash, 0.18); this.flashCol = JCOL[3];
  }
  comboBreak() { this.flash = Math.max(this.flash, 0.16); this.flashCol = JCOL[0]; }
  fever(on) {
    this.feverOn = on; if (this.bg) this.bg.tfever = on ? 1 : 0;
    if (on) { this.feverT = performance.now(); this.flash = 0.45; this.flashCol = WHITE; this.banner = { s: 'FEVER', t: performance.now(), col: this.track[2] }; }
  }
  spinClear(o) { this.spawn(o.px, o.py, JCOL[3], 50, 620, 0.9, 3.2); this.flash = Math.max(this.flash, 0.25); this.flashCol = JCOL[3]; if (this.bg) this.bg.ripple(o.px, o.py); }
  spinBonus(o) { this.spawn(o.px, o.py, this.colors[(o.bonus || 0) % this.colors.length], 14, 480, 0.6, 2.6); if (this.bg) this.bg.ripple(o.px, o.py); }
  fail() { this.failT = performance.now(); this.shake = 1; this.flash = 0.5; this.flashCol = JCOL[0]; }

  // ------------------------------------------------------------ frame core
  begin(now) {
    const c = this.c; this.dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.fps += (1 / Math.max(0.001, this.dt) - this.fps) * 0.05;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  setCursor(x, y) { this.cur.x = x; this.cur.y = y; this.cur.seen = true; }
  _particles() {
    const c = this.c, dt = this.dt, P = this.P;
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.max) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy += p.grav * dt; p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.max;
      c.globalAlpha = k; c.strokeStyle = rgba(p.col, 1); c.lineWidth = p.size * (0.5 + k);
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  _bursts(now) {
    const c = this.c;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i], e = (now - b.t) / (b.kind ? 380 : 520);
      if (e >= 1) { this.bursts.splice(i, 1); continue; }
      const k = easeOutCubic(e);
      if (b.kind === 0) {
        if (b.sprite) { const s = this.noteSprite(b.ci, b.R); c.globalAlpha = (1 - e) * 0.5; const z = s.half * (1 - 0.15 * k); c.drawImage(s.cv, b.x - z, b.y - z + k * b.R * 0.9, z * 2, z * 2); }
        c.globalAlpha = 1 - e; c.strokeStyle = rgba(b.col, 1); c.lineWidth = Math.max(3, b.R * 0.14); c.lineCap = 'round';
        const q = b.R * 0.42, yy = b.y + k * b.R * 0.9;
        c.beginPath(); c.moveTo(b.x - q, yy - q); c.lineTo(b.x + q, yy + q); c.moveTo(b.x + q, yy - q); c.lineTo(b.x - q, yy + q); c.stroke();
        continue;
      }
      if (b.sprite) { const s = this.noteSprite(b.ci, b.R); c.globalAlpha = (1 - e) * 0.7; const z = s.half * (1 + 0.38 * k); c.drawImage(s.cv, b.x - z, b.y - z, z * 2, z * 2); }
      c.globalCompositeOperation = 'lighter';
      const g = this.glow(b.col), gs = b.R * (2.2 + 2.2 * k);
      c.globalAlpha = (1 - e) * 0.75; c.drawImage(g, b.x - gs, b.y - gs, gs * 2, gs * 2);
      c.globalAlpha = (1 - e) * 0.95; c.strokeStyle = rgba(b.kind === 3 ? mixRgb(b.col, WHITE, 0.55) : b.col, 1);
      c.lineWidth = Math.max(1, b.R * 0.16 * (1 - k)); c.beginPath(); c.arc(b.x, b.y, b.R * (1 + 1.05 * k), 0, TAU); c.stroke();
      if (b.kind === 3) { c.globalAlpha = (1 - e) * 0.5; c.lineWidth = Math.max(1, b.R * 0.06 * (1 - k)); c.beginPath(); c.arc(b.x, b.y, b.R * (1 + 1.7 * k), 0, TAU); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
  }
  _texts(now) {
    const c = this.c; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i], e = (now - t.t) / 620;
      if (e >= 1) { this.texts.splice(i, 1); continue; }
      const sc = e < 0.18 ? 0.7 + 0.5 * easeOutBack(e / 0.18) : 1.2 - 0.2 * Math.min(1, (e - 0.18) * 3);
      c.globalAlpha = e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4;
      c.font = `700 ${Math.max(11, t.size * sc)}px ${FONT_U}`;
      c.shadowColor = rgba(t.col, 0.9); c.shadowBlur = 10; c.fillStyle = rgba(mixRgb(t.col, WHITE, 0.35), 1);
      c.fillText(t.s, t.x, t.y - e * t.size * 0.7);
    }
    c.shadowBlur = 0; c.globalAlpha = 1;
  }
  _cursor(now, inPlay, down) {
    const c = this.c, cur = this.cur; if (!cur.seen) return;
    const tr = this.trailPts; tr.push({ x: cur.x, y: cur.y, t: now });
    while (tr.length && now - tr[0].t > (this.trail === 'ribbon' ? 420 : 260)) tr.shift();
    const base = this.track[2], sz = (inPlay ? 13 : 9) * this.cursorSize;
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (tr.length > 1) {
      const life = this.trail === 'ribbon' ? 420 : 260;
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i], k = 1 - (now - b.t) / life; if (k <= 0) continue;
        let col = base;
        if (this.trail === 'rainbow') col = hslToRgb((now * 0.25 + i * 14) % 360, 1, 0.6);
        c.globalAlpha = k * (inPlay ? 0.75 : 0.4); c.strokeStyle = rgba(col, 1);
        c.lineWidth = sz * (this.trail === 'ribbon' ? 1.5 : 0.9) * k + 1;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
      if (this.trail === 'spark' && tr.length > 2) {
        const a = tr[tr.length - 2], b = tr[tr.length - 1], d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > 5) this.spawn(b.x, b.y, this.colors[Math.floor(now / 90) % this.colors.length], Math.min(3, d / 14), 70, 0.5, 2, 120);
      }
    }
    for (let i = this.clicks.length - 1; i >= 0; i--) {
      const k = (now - this.clicks[i].t) / 300; if (k >= 1) { this.clicks.splice(i, 1); continue; }
      c.globalAlpha = (1 - k) * 0.8; c.strokeStyle = rgba(mixRgb(base, WHITE, 0.5), 1); c.lineWidth = 2.5 * (1 - k) + 0.5;
      c.beginPath(); c.arc(this.clicks[i].x, this.clicks[i].y, sz * (1 + 2.4 * easeOutCubic(k)), 0, TAU); c.stroke();
    }
    if (inPlay) {
      const g = this.glow(base), gs = sz * 3.2;
      c.globalAlpha = 0.9; c.drawImage(g, cur.x - gs, cur.y - gs, gs * 2, gs * 2);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cur.x, cur.y, sz * (down ? 0.38 : 0.46), 0, TAU); c.fill();
      c.strokeStyle = rgba(mixRgb(base, WHITE, 0.3), 0.95); c.lineWidth = 2; c.beginPath(); c.arc(cur.x, cur.y, sz * (down ? 0.82 : 1), 0, TAU); c.stroke();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ play
  drawPlay(p, now) {
    const c = this.c, T = p.T, R = p.R; this._R = R;
    this.begin(now);
    this.shake *= Math.pow(0.0015, this.dt); this.flash *= Math.pow(0.004, this.dt); this.comboPop *= Math.pow(0.0008, this.dt);
    const bph = this.beatPhase ? this.beatPhase(T) : 0; this.beat = Math.pow(1 - bph, 2.4);
    const fev = this.feverOn ? 1 : 0;

    // playfield ambience
    if (fev) {
      const a = 0.1 + 0.32 * this.beat, col = this.track[2], wbar = Math.min(220, this.w * 0.16);
      let g = c.createLinearGradient(0, 0, wbar, 0); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, wbar, this.h);
      g = c.createLinearGradient(this.w, 0, this.w - wbar, 0); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(this.w - wbar, 0, wbar, this.h);
      if (Math.random() < 14 * this.dt * this.pq) this.spawn(Math.random() < 0.5 ? Math.random() * wbar * 0.6 : this.w - Math.random() * wbar * 0.6, this.h + 4, this.colors[Math.floor(Math.random() * 4)], 1, 30, 1.6, 2.4, -260);
    }
    c.save();
    if (this.shake > 0.01) c.translate((Math.random() - 0.5) * this.shake * 12, (Math.random() - 0.5) * this.shake * 12);
    if (fev) { const z = 1 + this.beat * 0.006; c.translate(this.w / 2, this.h / 2); c.scale(z, z); c.translate(-this.w / 2, -this.h / 2); }

    // visible range
    let endI = p.head; while (endI < p.N && p.objs[endI].t - p.ar <= T) endI++;
    // follow guides
    c.lineCap = 'round';
    for (let i = Math.max(1, p.head); i < endI; i++) {
      const o = p.objs[i], q = p.objs[i - 1];
      if (o.nc || o.type === 2 || q.type === 2 || o.done || T >= o.t) continue;
      let ax = q.px, ay = q.py; if (q.type === 1) { const e = p.pointAt(q, q.repeats % 2 ? 1 : 0); ax = e[0]; ay = e[1]; }
      const dx = o.px - ax, dy = o.py - ay, d = Math.hypot(dx, dy); if (d < R * 2.6) continue;
      const fade = clamp((T - (o.t - p.ar)) / (p.ar * 0.4), 0, 1) * (p.blackout ? 0.4 : 1);
      const prog = clamp((T - q.end) / Math.max(0.01, o.t - q.end), 0, 1), ux = dx / d, uy = dy / d;
      c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 2;
      for (let s = R * 1.25; s < d - R * 1.25; s += 14) {
        const f = s / d; c.globalAlpha = fade * (f < prog ? 0.08 : 0.42);
        c.beginPath(); c.moveTo(ax + ux * s, ay + uy * s); c.lineTo(ax + ux * (s + 5), ay + uy * (s + 5)); c.stroke();
      }
    }
    c.globalAlpha = 1;
    // objects, far to near
    for (let i = endI - 1; i >= p.head; i--) {
      const o = p.objs[i]; if (o.done) continue;
      if (o.type === 0) this._tap(p, o, T, now);
      else if (o.type === 1) this._slider(p, o, T, now);
      else this._spinner(p, o, T, now);
    }
    this._bursts(now); this._particles(); this._texts(now);
    c.restore();

    const m = p.mouse;
    if (!p.touch || p.auto) { this.setCursor(m.x, m.y); this._cursor(now, true, m.down > 0); }
    else { // touch: only tap ripples
      c.globalCompositeOperation = 'lighter';
      for (let i = this.clicks.length - 1; i >= 0; i--) { const k = (now - this.clicks[i].t) / 300; if (k >= 1) { this.clicks.splice(i, 1); continue; } c.globalAlpha = (1 - k) * 0.7; c.strokeStyle = rgba(mixRgb(this.track[2], WHITE, 0.5), 1); c.lineWidth = 3 * (1 - k) + 0.5; c.beginPath(); c.arc(this.clicks[i].x, this.clicks[i].y, R * (0.6 + 1.2 * easeOutCubic(k)), 0, TAU); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    this._hud(p, now, T);
    // overlays
    if (p.hp < 0.25 && !p.nofail && p.state === 'playing') {
      const a = ((0.25 - p.hp) / 0.25) * (0.28 + 0.14 * Math.sin(now / 130));
      const g = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(255,30,60,0)'); g.addColorStop(1, `rgba(255,30,60,${a})`); c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);
    }
    if (this.flash > 0.01) { c.globalAlpha = this.flash; c.fillStyle = rgba(this.flashCol, 1); c.fillRect(0, 0, this.w, this.h); c.globalAlpha = 1; }
    if (this.banner) {
      const e = (now - this.banner.t) / 1100;
      if (e >= 1) this.banner = null;
      else {
        const sc = 0.8 + 0.4 * easeOutQuint(Math.min(1, e * 2.5)), a = e < 0.55 ? 1 : 1 - (e - 0.55) / 0.45;
        c.globalAlpha = a * 0.95; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `900 ${Math.min(this.w * 0.085, 72) * sc}px ${FONT_D}`;
        c.shadowColor = rgba(this.banner.col, 1); c.shadowBlur = 30; c.fillStyle = '#fff';
        c.fillText(this.banner.s, this.w / 2, this.h * 0.3); c.shadowBlur = 0; c.globalAlpha = 1;
      }
    }
    if (p.state === 'failing' || p.state === 'failed') {
      const e = clamp((now - this.failT) / 1500, 0, 1);
      c.fillStyle = `rgba(20,0,8,${0.72 * e})`; c.fillRect(0, 0, this.w, this.h);
    }
    // intro card
    const since = (now - p.startedAt) / 1000;
    if (since < 3.4 && p.head === 0 && T < p.first) {
      const a = clamp(since / 0.4, 0, 1) * clamp((3.4 - since) / 0.6, 0, 1) * clamp((p.first - T) / 0.5, 0, 1);
      c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 ${Math.min(52, this.w * 0.06)}px ${FONT_D}`; c.fillStyle = '#fff'; c.shadowColor = rgba(this.track[0], 1); c.shadowBlur = 24;
      c.fillText(p.track.title.toUpperCase().slice(0, 34), this.w / 2, this.h * 0.44 - (1 - easeOutCubic(clamp(since / 0.6, 0, 1))) * 20);
      c.shadowBlur = 0; c.font = `600 ${Math.min(20, this.w * 0.03)}px ${FONT_U}`; c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText(`${p.track.artist}  ·  ${p.D.name}  ·  ★ ${p.map.stars.toFixed(1)}`, this.w / 2, this.h * 0.44 + 44);
      c.globalAlpha = 1;
    }
    if (this.showFps) { c.font = `600 12px ${FONT_U}`; c.textAlign = 'right'; c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillText(Math.round(this.fps) + ' FPS', this.w - 8, this.h - 8); }
  }
  _alpha(p, o, T) {
    let a = clamp((T - (o.t - p.ar)) / (p.ar * 0.4), 0, 1);
    if (p.blackout && o.type !== 2) a *= 1 - clamp((T - (o.t - p.ar * 0.62)) / (p.ar * 0.3), 0, 1);
    return a;
  }
  _approach(p, o, T, a) {
    if (p.blackout) return;
    const c = this.c, R = p.R, prog = clamp((T - (o.t - p.ar)) / p.ar, 0, 1), sc = 1 + 2.3 * (1 - prog);
    const col = this.colors[o.ci % this.colors.length];
    c.save(); c.translate(o.px, o.py); c.globalAlpha = a * (0.35 + 0.6 * prog); c.lineJoin = 'round';
    shapePath(c, this.skin === 'ring' ? 'orb' : this.skin, R * sc); c.strokeStyle = rgba(mixRgb(col, WHITE, 0.25), 1); c.lineWidth = Math.max(2, R * 0.085); c.stroke();
    c.restore(); c.globalAlpha = 1;
  }
  _num(o, R, a) {
    const c = this.c; c.globalAlpha = a; c.font = `700 ${R * 0.78}px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(8,6,24,0.55)'; c.fillText(o.num, o.px + 1, o.py + R * 0.06 + 2);
    c.fillStyle = '#fff'; c.fillText(o.num, o.px, o.py + R * 0.06); c.globalAlpha = 1;
  }
  _tap(p, o, T, now) {
    const c = this.c, R = p.R, a = this._alpha(p, o, T); if (a <= 0.004) return;
    const s = this.noteSprite(o.ci, R);
    let ox = 0; if (o.shake && now - o.shake < 260) ox = Math.sin((now - o.shake) / 18) * R * 0.16 * (1 - (now - o.shake) / 260);
    const pulse = this.feverOn ? 1 + this.beat * 0.045 : 1, z = s.half * pulse;
    c.globalAlpha = a; c.drawImage(s.cv, o.px - z + ox, o.py - z, z * 2, z * 2); c.globalAlpha = 1;
    this._num(o, R, a);
    this._approach(p, o, T, a);
  }
  _slider(p, o, T, now) {
    const c = this.c, R = p.R, col = this.colors[o.ci % this.colors.length];
    let a = clamp((T - (o.t - p.ar)) / (p.ar * 0.4), 0, 1);
    if (p.blackout) a *= 1 - clamp((T - o.t) / (o.end - o.t), 0, 1) * 0.92;
    if (a <= 0.004) return;
    const sp = this.sliderSprite(o, R);
    c.globalAlpha = a * 0.96; c.drawImage(sp.cv, sp.x, sp.y, sp.w, sp.h); c.globalAlpha = a;
    // ticks
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = o.ti; i < o.ticks.length; i++) { const tk = o.ticks[i]; if (tk.kind) continue; const q = p.pointAt(o, p.sliderFrac(o, tk.t).f); c.beginPath(); c.arc(q[0], q[1], Math.max(2.5, R * 0.12), 0, TAU); c.fill(); }
    // reverse arrows
    const fr = p.sliderFrac(o, Math.max(T, o.t)), rem = o.repeats - 1 - fr.span;
    const arrow = (atEnd) => {
      const n = o.pp.length, e = atEnd ? o.pp[n - 1] : o.pp[0], b = atEnd ? o.pp[n - 3] : o.pp[2];
      const ang = Math.atan2(b[1] - e[1], b[0] - e[0]), s = R * (0.34 + 0.06 * this.beat);
      c.save(); c.translate(e[0], e[1]); c.rotate(ang); c.strokeStyle = '#fff'; c.lineWidth = Math.max(3, R * 0.13); c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-s * 0.5, -s); c.lineTo(s * 0.5, 0); c.lineTo(-s * 0.5, s); c.stroke(); c.restore();
    };
    if (rem >= 1) arrow(fr.span % 2 === 0);
    if (rem >= 2) arrow(fr.span % 2 !== 0);
    // tail ring
    const tail = o.pp[o.repeats % 2 ? o.pp.length - 1 : 0];
    if (rem < 1) { c.strokeStyle = rgba(mixRgb(col, WHITE, 0.5), 0.8); c.lineWidth = 2; c.beginPath(); c.arc(tail[0], tail[1], R * 0.42, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
    if (T < o.t || !o.headDone) {
      if (!o.headDone) {
        const s = this.noteSprite(o.ci, R); let ox = 0; if (o.shake && now - o.shake < 260) ox = Math.sin((now - o.shake) / 18) * R * 0.16;
        const ha = this._alpha(p, o, Math.min(T, o.t));
        c.globalAlpha = ha; c.drawImage(s.cv, o.px - s.half + ox, o.py - s.half, s.half * 2, s.half * 2); c.globalAlpha = 1;
        this._num(o, R, ha); if (T < o.t + 0.02) this._approach(p, o, T, ha);
      }
    }
    if (T >= o.t || o.headDone) {
      const pos = p.sliderPos(o, Math.max(T, o.t)), fol = o.following;
      c.globalCompositeOperation = 'lighter';
      const g = this.glow(col), gs = R * (fol ? 2.6 : 1.8);
      c.globalAlpha = a * (fol ? 0.95 : 0.55); c.drawImage(g, pos[0] - gs, pos[1] - gs, gs * 2, gs * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = a; c.fillStyle = '#fff'; c.beginPath(); c.arc(pos[0], pos[1], R * 0.52, 0, TAU); c.fill();
      c.strokeStyle = rgba(col, 1); c.lineWidth = Math.max(2, R * 0.12); c.beginPath(); c.arc(pos[0], pos[1], R * 0.78, 0, TAU); c.stroke();
      if (T >= o.t) {
        const fr2 = R * (fol ? 2.0 + 0.08 * Math.sin(now / 60) : 1.35);
        c.globalAlpha = a * (fol ? 0.9 : 0.35); c.strokeStyle = fol ? rgba(mixRgb(col, WHITE, 0.6), 1) : 'rgba(255,255,255,0.8)'; c.lineWidth = fol ? 3.5 : 2;
        c.beginPath(); c.arc(pos[0], pos[1], fr2, 0, TAU); c.stroke();
        if (fol && Math.random() < 30 * this.dt * this.pq) this.spawn(pos[0], pos[1], col, 1, R * 3, 0.4, R * 0.05);
      }
      c.globalAlpha = 1;
    }
  }
  _spinner(p, o, T, now) {
    const c = this.c, x = o.px, y = o.py, Rs = Math.min(p.fw, p.fh) * 0.36;
    const a = clamp((T - (o.t - p.ar)) / (p.ar * 0.5), 0, 1); if (a <= 0.004) return;
    const act = T >= o.t, prog = clamp(o.rot / o.need, 0, 1), left = clamp((o.end - T) / (o.end - o.t), 0, 1);
    const [c1, c2, c3] = this.track, done = o.cleared;
    c.save(); c.translate(x, y); c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';
    const g = this.glow(done ? JCOL[3] : c1), gs = Rs * (1.5 + 0.1 * this.beat + prog * 0.3);
    c.globalAlpha = a * (0.25 + 0.4 * prog); c.drawImage(g, -gs, -gs, gs * 2, gs * 2);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = a * 0.3; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, Rs, 0, TAU); c.stroke();
    for (let i = 0; i < 48; i++) { const an = (i / 48) * TAU, r1 = Rs * 1.1, r2 = Rs * (i % 4 ? 1.13 : 1.17); c.globalAlpha = a * (i / 48 < prog ? 0.95 : 0.22); c.strokeStyle = i / 48 < prog ? rgba(done ? JCOL[3] : c3, 1) : '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(Math.cos(an - Math.PI / 2) * r1, Math.sin(an - Math.PI / 2) * r1); c.lineTo(Math.cos(an - Math.PI / 2) * r2, Math.sin(an - Math.PI / 2) * r2); c.stroke(); }
    if (act) { c.globalAlpha = a * 0.8; c.strokeStyle = rgba(c3, 1); c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, Math.max(4, Rs * left), 0, TAU); c.stroke(); }
    c.save(); c.rotate(o.angle);
    for (let k = 0; k < 3; k++) { c.globalAlpha = a * 0.85; c.strokeStyle = rgba(mixRgb(c1, WHITE, 0.15), 1); c.lineWidth = Rs * 0.085; c.beginPath(); c.arc(0, 0, Rs * 0.72, k * TAU / 3, k * TAU / 3 + 1.25); c.stroke(); }
    c.restore(); c.save(); c.rotate(-o.angle * 0.6);
    for (let k = 0; k < 3; k++) { c.globalAlpha = a * 0.75; c.strokeStyle = rgba(mixRgb(c2, WHITE, 0.2), 1); c.lineWidth = Rs * 0.06; c.beginPath(); c.arc(0, 0, Rs * 0.48, k * TAU / 3 + 0.5, k * TAU / 3 + 1.6); c.stroke(); }
    c.restore();
    c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.shadowColor = rgba(done ? JCOL[3] : c3, 1); c.shadowBlur = 18;
    c.font = `900 ${Rs * 0.2}px ${FONT_D}`; c.fillText(done ? 'CLEAR!' : act ? Math.round(prog * 100) + '%' : 'SPIN', 0, -Rs * 0.02);
    c.shadowBlur = 0; c.font = `600 ${Math.max(12, Rs * 0.085)}px ${FONT_U}`; c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText(done && o.bonus ? '+' + o.bonus + ' BONUS' : act ? (p.touch ? 'DRAG IN CIRCLES' : 'HOLD & CIRCLE') : 'GET READY', 0, Rs * 0.16);
    c.restore(); c.globalAlpha = 1;
  }
  _hud(p, now, T) {
    const c = this.c, w = this.w, h = this.h, [c1, , c3] = this.track, small = w < 620;
    // progress
    const pr = clamp((T - p.first) / Math.max(1, p.last - p.first), 0, 1);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 0, w, 3);
    let g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, rgba(c1, 1)); g.addColorStop(1, rgba(c3, 1)); c.fillStyle = g; c.fillRect(0, 0, w * pr, 3);
    // energy
    this.dispHp = lerp(this.dispHp, Math.max(0, p.hp), Math.min(1, this.dt * 10));
    const bx = 18, by = 20, bw = Math.min(320, w * 0.34), bh = 11, sk = 7, low = p.hp < 0.25 && !p.nofail;
    const bar = (x0, x1) => { c.beginPath(); c.moveTo(x0 + sk, by); c.lineTo(x1 + sk, by); c.lineTo(x1, by + bh); c.lineTo(x0, by + bh); c.closePath(); };
    bar(bx, bx + bw); c.fillStyle = 'rgba(255,255,255,0.13)'; c.fill();
    if (this.dispHp > 0.005) {
      g = c.createLinearGradient(bx, 0, bx + bw, 0);
      if (low) { g.addColorStop(0, '#ff2a55'); g.addColorStop(1, '#ff8a5c'); } else { g.addColorStop(0, rgba(c1, 1)); g.addColorStop(1, rgba(mixRgb(c3, WHITE, 0.3), 1)); }
      c.shadowColor = low ? '#ff2a55' : rgba(c3, 0.9); c.shadowBlur = 12 + this.beat * 8; bar(bx, bx + bw * this.dispHp); c.fillStyle = g; c.fill(); c.shadowBlur = 0;
    }
    c.font = `700 11px ${FONT_U}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(p.nofail ? 'ENERGY · SAFE' : 'ENERGY', bx + sk, by - 5);
    // score (fixed-width cells so digits never jitter)
    this.dispScore = lerp(this.dispScore, p.score, Math.min(1, this.dt * 14)); if (Math.abs(this.dispScore - p.score) < 2) this.dispScore = p.score;
    const digits = String(Math.round(this.dispScore)).padStart(7, '0'), fs = small ? 24 : 34, cell = fs * 0.62, rx = w - (small ? 56 : 66);
    c.font = `700 ${fs * 1.12}px ${FONT_U}`; c.textAlign = 'center'; c.textBaseline = 'top';
    let lead = true;
    for (let i = 0; i < digits.length; i++) {
      if (digits[i] !== '0') lead = false;
      c.fillStyle = lead && i < digits.length - 1 ? 'rgba(255,255,255,0.28)' : '#fff';
      c.fillText(digits[i], rx - (digits.length - 1 - i) * cell - cell / 2, 14);
    }
    c.font = `700 ${small ? 14 : 17}px ${FONT_U}`; c.textAlign = 'right'; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText((p.acc * 100).toFixed(2) + '%', rx, 16 + fs + 2);
    // combo
    if (p.combo > 1) {
      const cs = (small ? 34 : 52) * (1 + this.comboPop * 0.22);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = `700 ${cs * 1.15}px ${FONT_U}`;
      const col = this.feverOn ? JCOL[3] : mixRgb(c3, WHITE, 0.5);
      c.shadowColor = rgba(col, 0.9); c.shadowBlur = 16 + this.comboPop * 14; c.fillStyle = '#fff';
      const tx = 20, ty = h - (small ? 20 : 26); c.fillText(String(p.combo), tx, ty);
      const tw = c.measureText(String(p.combo)).width; c.shadowBlur = 0;
      c.font = `700 ${small ? 13 : 16}px ${FONT_U}`; c.fillStyle = rgba(col, 0.95); c.fillText('COMBO', tx + tw + 8, ty - 2);
    }
    // hit error bar
    if (this.showErr && !p.auto) {
      const bw2 = Math.min(240, w * 0.36), cx = w / 2, cy = h - 18, k = bw2 / 2 / p.win.ok * p.rate;
      const zone = (win, col, hh) => { c.fillStyle = col; c.fillRect(cx - win * k / p.rate, cy - hh / 2, (win * k / p.rate) * 2, hh); };
      zone(p.win.ok, 'rgba(120,255,170,0.25)', 4); zone(p.win.g, 'rgba(95,200,255,0.45)', 4); zone(p.win.p, 'rgba(255,214,102,0.85)', 4);
      c.fillStyle = '#fff'; c.fillRect(cx - 1, cy - 9, 2, 18);
      let sum = 0, cnt = 0;
      for (const r of p.recent) {
        const age = (now - r.at) / 4000; if (age >= 1) continue;
        const ax = Math.abs(r.ms) / 1000 * p.rate, col = ax <= p.win.p ? JCOL[3] : ax <= p.win.g ? JCOL[2] : JCOL[1];
        c.globalAlpha = 1 - age; c.fillStyle = rgba(col, 1); c.fillRect(cx + (r.ms / 1000) * k - 1.5, cy - 8, 3, 16); sum += r.ms; cnt++;
      }
      c.globalAlpha = 1;
      if (cnt) { const ax = cx + (sum / cnt / 1000) * k; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(ax, cy - 12); c.lineTo(ax - 5, cy - 19); c.lineTo(ax + 5, cy - 19); c.closePath(); c.fill(); }
    }
    // mods + break hint
    if (p.mods.size) { c.font = `700 12px ${FONT_U}`; c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillText(Array.from(p.mods).map((m) => m.toUpperCase()).join(' · '), w - 16, h - 14); }
    if (p.inBreak && T > p.first && T < p.last) { c.font = `700 14px ${FONT_U}`; c.textAlign = 'center'; c.fillStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(now / 300)})`; c.fillText('— BREAK —', w / 2, 30); }
  }

  // ------------------------------------------------------------------ menu
  /** emblem: {x,y,r} in CSS px or null */
  drawMenu(now, emblem, beatPhase) {
    const c = this.c; this.begin(now);
    this.beat = Math.pow(1 - (beatPhase || 0), 2.4);
    const [c1, c2, c3] = this.track, sp = AudioSys.spectrum, bass = AudioSys.bass;
    if (Math.random() < 5 * this.dt * this.pq) this.spawn(Math.random() * this.w, this.h + 6, this.colors[Math.floor(Math.random() * 4)], 1, 16, 4, 2, -70);
    if (emblem) {
      const { x, y } = emblem, r = emblem.r * (1 + this.beat * 0.035 + bass * 0.04);
      this.menuSpin += this.dt * (0.15 + bass * 0.6);
      c.save(); c.translate(x, y);
      c.globalCompositeOperation = 'lighter';
      const g0 = this.glow(c1), gs = r * 2.3; c.globalAlpha = 0.35 + bass * 0.4; c.drawImage(g0, -gs, -gs, gs * 2, gs * 2);
      const NB = 96; c.lineCap = 'round';
      for (let i = 0; i < NB; i++) {
        const f = i < NB / 2 ? i / (NB / 2) : (NB - i) / (NB / 2), v = sp[Math.min(sp.length - 1, Math.floor(f * (sp.length - 6)))] || 0;
        const an = (i / NB) * TAU - Math.PI / 2 + this.menuSpin * 0.2, r1 = r * 1.1, r2 = r1 + 3 + v * r * 0.75;
        c.globalAlpha = 0.5 + v * 0.5; c.strokeStyle = rgba(mixRgb(c1, c3, f), 1); c.lineWidth = Math.max(2, r * 0.028);
        c.beginPath(); c.moveTo(Math.cos(an) * r1, Math.sin(an) * r1); c.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); c.stroke();
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      let g = c.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r);
      g.addColorStop(0, rgba(mixRgb(c1, [20, 14, 50], 0.55), 0.96)); g.addColorStop(1, 'rgba(8,6,24,0.94)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.lineWidth = Math.max(3, r * 0.045); c.strokeStyle = '#fff'; c.shadowColor = rgba(c3, 1); c.shadowBlur = 22 + this.beat * 18; c.stroke(); c.shadowBlur = 0;
      c.save(); c.rotate(this.menuSpin); c.setLineDash([r * 0.16, r * 0.1]); c.lineWidth = Math.max(2, r * 0.02); c.strokeStyle = rgba(c3, 0.75);
      c.beginPath(); c.arc(0, 0, r * 0.84, 0, TAU); c.stroke(); c.restore();
      c.save(); c.rotate(-this.menuSpin * 0.7); c.setLineDash([r * 0.05, r * 0.07]); c.lineWidth = Math.max(1.5, r * 0.014); c.strokeStyle = rgba(c2, 0.8);
      c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.stroke(); c.restore(); c.setLineDash([]);
      // four-point star core
      const sr = r * (0.42 + this.beat * 0.07 + bass * 0.08);
      c.save(); c.rotate(this.menuSpin * 0.35);
      c.beginPath(); for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? sr * 0.3 : sr; c[i ? 'lineTo' : 'moveTo'](Math.cos(an) * rr, Math.sin(an) * rr); } c.closePath();
      g = c.createLinearGradient(-sr, -sr, sr, sr); g.addColorStop(0, '#fff'); g.addColorStop(1, rgba(mixRgb(c3, WHITE, 0.4), 1));
      c.fillStyle = g; c.shadowColor = rgba(c3, 1); c.shadowBlur = 30; c.fill(); c.shadowBlur = 0; c.restore();
      c.restore();
    }
    this._bursts(now); this._particles();
    this._cursor(now, false, false);
    if (this.showFps) { c.font = `600 12px ${FONT_U}`; c.textAlign = 'right'; c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillText(Math.round(this.fps) + ' FPS', this.w - 8, this.h - 8); }
  }
  menuBurst(x, y) { const col = this.colors[Math.floor(Math.random() * this.colors.length)]; this.bursts.push({ x, y, col, t: performance.now(), R: 16, ci: 0, kind: 2, sprite: false }); this.spawn(x, y, col, 10, 240, 0.5, 2.2); if (this.bg) this.bg.ripple(x, y); }
}

/** Results-screen chart: energy over time + hit-timing histogram. */
export function drawResultGraph(cv, res, palette) {
  const d = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * d; cv.height = h * d; const c = cv.getContext('2d'); c.scale(d, d); c.clearRect(0, 0, w, h);
  const c1 = hexToRgb(palette[0]), c3 = hexToRgb(palette[2]), split = Math.round(w * 0.56), pad = 6;
  // energy line
  const hp = res.hpGraph.length > 1 ? res.hpGraph : [1, 1];
  c.beginPath(); hp.forEach((v, i) => { const x = pad + (i / (hp.length - 1)) * (split - pad * 3), y = h - pad - v * (h - pad * 2 - 12); c[i ? 'lineTo' : 'moveTo'](x, y); });
  c.strokeStyle = rgba(c3, 1); c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  c.lineTo(pad + (split - pad * 3), h - pad); c.lineTo(pad, h - pad); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba(c3, 0.35)); g.addColorStop(1, rgba(c1, 0.03)); c.fillStyle = g; c.fill();
  c.font = `700 10px ${FONT_U}`; c.fillStyle = 'rgba(255,255,255,0.55)'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('ENERGY', pad, 2);
  // histogram
  const x0 = split + pad, bw = w - x0 - pad, bins = 31, range = 150, hist = new Array(bins).fill(0);
  for (const e of res.errors) { const b = Math.round(((clamp(e, -range, range) + range) / (2 * range)) * (bins - 1)); hist[b]++; }
  const mx = Math.max(1, ...hist);
  for (let i = 0; i < bins; i++) {
    const ms = (i / (bins - 1)) * 2 * range - range, bh = (hist[i] / mx) * (h - pad * 2 - 14), a = Math.abs(ms);
    c.fillStyle = a < 45 ? 'rgba(255,214,102,0.95)' : a < 95 ? 'rgba(95,200,255,0.9)' : 'rgba(120,255,170,0.8)';
    c.fillRect(x0 + (i / bins) * bw, h - pad - bh, bw / bins - 1.5, Math.max(1, bh));
  }
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x0 + bw / 2 - 0.5, 14, 1, h - 14 - pad);
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillText('TIMING  ← early · late →', x0, 2);
}
