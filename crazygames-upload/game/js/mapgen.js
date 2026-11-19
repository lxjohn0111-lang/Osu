// Beatmap generator. Takes "chart material" (a 16th-note grid plus weighted candidate
// events, produced either from a composed song or from analysed audio) and turns it into
// playable objects: taps, slide trails and spin reactors, laid out as flowing patterns.
import { clamp, mulberry32, hashStr, TAU } from './util.js';

export const DIFFS = {
  easy:   { key: 'easy',   name: 'EASY',   color: '#53f5a4', minGap: 0.44,  ar: 1.5,  r: 0.092, win: [0.072, 0.132, 0.19],  hp: 0.5,  speed: 0.4,  maxJump: 0.34, sl: 0.34, spin: 1.1, maxRun: 4,  fillW: 0.99, xp: 0.6 },
  normal: { key: 'normal', name: 'NORMAL', color: '#5fc8ff', minGap: 0.26,  ar: 1.15, r: 0.082, win: [0.058, 0.112, 0.168], hp: 0.75, speed: 0.55, maxJump: 0.42, sl: 0.46, spin: 1.6, maxRun: 8,  fillW: 0.65, xp: 1.0 },
  hard:   { key: 'hard',   name: 'HARD',   color: '#ffb347', minGap: 0.15,  ar: 0.86, r: 0.072, win: [0.048, 0.098, 0.15],  hp: 1.0,  speed: 0.8,  maxJump: 0.55, sl: 0.6,  spin: 2.2, maxRun: 12, fillW: 0.5,  xp: 1.5 },
  insane: { key: 'insane', name: 'INSANE', color: '#ff4d6d', minGap: 0.085, ar: 0.66, r: 0.064, win: [0.04, 0.086, 0.135],  hp: 1.2,  speed: 1.0,  maxJump: 0.66, sl: 0.74, spin: 2.8, maxRun: 9,  fillW: 0.25, xp: 2.2 },
};
export const DIFF_ORDER = ['easy', 'normal', 'hard', 'insane'];

const PATH_N = 26;

function sliderPath(x, y, ang, L, kind, bend) {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const x3 = x + dx * L, y3 = y + dy * L;
  const pts = [];
  for (let i = 0; i < PATH_N; i++) {
    const t = i / (PATH_N - 1), u = 1 - t;
    let qx, qy;
    if (kind === 0) { qx = x + dx * L * t; qy = y + dy * L * t; }
    else if (kind === 1) {
      const cx = x + dx * L * 0.5 + px * L * bend, cy = y + dy * L * 0.5 + py * L * bend;
      qx = u * u * x + 2 * u * t * cx + t * t * x3; qy = u * u * y + 2 * u * t * cy + t * t * y3;
    } else {
      const c1x = x + dx * L * 0.33 + px * L * bend, c1y = y + dy * L * 0.33 + py * L * bend;
      const c2x = x + dx * L * 0.67 - px * L * bend, c2y = y + dy * L * 0.67 - py * L * bend;
      qx = u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x3;
      qy = u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y3;
    }
    pts.push([qx, qy]);
  }
  return pts;
}

/**
 * @param src   chart material ({stepTimes, nSteps, cands, sections, ...})
 * @param diffKey easy|normal|hard|insane
 * @param A     playfield aspect ratio (width / height) the patterns are laid out for
 * @param seed  string seed so a given track always produces the same chart
 */
export function generate(src, diffKey, A, seed) {
  const D = DIFFS[diffKey];
  const rnd = mulberry32(hashStr(seed + '|' + diffKey));
  const st = src.stepTimes, n = src.nSteps;
  const sdur = (st[n] - st[0]) / Math.max(1, n);
  let g = 1; while (g * sdur < D.minGap && g < 16) g *= 2;
  const half = Math.max(1, g >> 1);
  // rad = minimum spacing between note heads (steps); align = which grid positions may hold a note
  const rad = diffKey === 'normal' ? Math.max(1, Math.round(g * 0.75)) : g;
  const align = diffKey === 'easy' ? g : Math.max(1, g >> 2);
  const occ = new Uint8Array(n + 96); // 1 = note head, 2 = reserved
  const free = (s, rad) => {
    if (s < 0 || s >= n || occ[s]) return false;
    for (let k = Math.max(0, s - rad + 1), e = Math.min(n, s + rad); k < e; k++) if (occ[k] === 1) return false;
    return true;
  };
  const secOf = (s) => { for (const x of src.sections) if (s >= x.s0 && s < x.s1) return x; return src.sections[src.sections.length - 1] || { fever: false, energy: 0.5 }; };
  const spinners = [];
  const endGap = Math.max(4, g);

  // 1. composed spinners (build-ups)
  for (const sec of src.sections) {
    if (!sec.spin) continue;
    const a = sec.s1 - sec.spin * 16, b = sec.s1 - endGap;
    if (st[b] - st[a] < 1.0) continue;
    spinners.push({ a, b });
    for (let k = Math.max(0, a - g + 1); k < sec.s1; k++) occ[k] = 2;
  }

  // 2. primary (melodic) notes: priority-greedy with a minimum gap of g steps
  const best = new Map();
  for (const c of src.cands) {
    if (c.step < 0 || c.step >= n) continue;
    const cur = best.get(c.step);
    if (!cur || (c.mel && !cur.mel) || (c.mel === cur.mel && c.w > cur.w)) {
      const merged = Object.assign({}, c);
      if (cur && merged.midi == null) merged.midi = cur.midi;
      best.set(c.step, merged);
    } else if (cur.midi == null && c.midi != null) cur.midi = c.midi;
  }
  const all = Array.from(best.values());
  const prio = (c) => (c.step % g === 0 ? 100 : 0) + (c.step % 16 === 0 ? 8 : c.step % 8 === 0 ? 6 : c.step % 4 === 0 ? 4 : c.step % 2 === 0 ? 2 : 0) + c.w * 10;
  const prim = all.filter((c) => c.mel && c.step % align === 0).sort((a, b) => prio(b) - prio(a) || a.step - b.step);
  const chosen = [];
  for (const c of prim) if (free(c.step, rad)) { occ[c.step] = 1; chosen.push(c); }
  chosen.sort((a, b) => a.step - b.step);

  // 3. sustained notes become slide trails
  const gapAfter = Math.max(2, half), minSl = Math.max(2, half);
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i]; if (!c.dur || c.dur < minSl) continue;
    let lim = (chosen[i + 1] ? chosen[i + 1].step : n) - c.step - gapAfter;
    for (let k = c.step + 1; k < c.step + lim + gapAfter && k < n; k++) if (occ[k] === 2) { lim = k - c.step - gapAfter; break; }
    let sl = Math.min(c.dur, lim);
    if (sl >= 4) sl &= ~1;
    if (rnd() > (sl < c.dur ? 0.3 : 0.62)) continue; // keep trails as accents, not wall-to-wall
    if (sl >= minSl && st[c.step + sl] - st[c.step] >= 0.2) {
      c.sl = sl;
      for (let k = c.step + 1; k < c.step + sl + gapAfter && k < n; k++) if (!occ[k]) occ[k] = 2;
    }
  }

  // 4. rhythm fills from drums / secondary onsets
  const fast = rad * sdur < 0.2;
  const fillAlign = diffKey === 'hard' ? half : diffKey === 'insane' ? 1 : g;
  const runOk = (s) => {
    if (!fast) return true;
    let run = 1;
    for (let k = s - rad; k >= 0 && occ[k] === 1; k -= rad) run++;
    for (let k = s + rad; k < n && occ[k] === 1; k += rad) run++;
    return run <= D.maxRun;
  };
  const fills = all.filter((c) => !c.mel && c.w >= D.fillW && c.step % fillAlign === 0).sort((a, b) => a.step - b.step);
  for (const c of fills) {
    const sec = secOf(c.step);
    let fr = 2 * rad;
    if (diffKey === 'hard' && sec.energy >= 0.5) fr = rad;
    if (diffKey === 'insane') fr = sec.fever || c.w >= 0.5 ? rad : 2 * rad;
    if (free(c.step, fr) && runOk(c.step)) { occ[c.step] = 1; chosen.push(c); }
  }

  // 5. analysed audio only: top up sparse charts on the beat, and spin through long held passages
  if (!src.exact && src.active) {
    const active = src.active, target = { easy: 0.9, normal: 1.5, hard: 2.4, insane: 3.2 }[diffKey];
    let act = 0; for (let k = 0; k < n; k++) act += active[k];
    const want = act * sdur * target;
    if (chosen.length < want * 0.75) {
      const g2 = Math.max(g, sdur * 4 < 0.42 ? 8 : 4);
      for (let s = 0; s < n && chosen.length < want; s += g2) {
        if (active[s] && free(s, g2)) { occ[s] = 1; chosen.push({ step: s, t: st[s], w: 0.3, mel: false, pitch: null, midi: null, dur: 0 }); }
      }
    }
    chosen.sort((a, b) => a.step - b.step);
    let made = 0;
    for (let i = 0; i + 1 < chosen.length && made < 3; i++) {
      const a0 = chosen[i].step + (chosen[i].sl || 0) + endGap, b0 = chosen[i + 1].step - Math.max(8, 2 * g);
      if (b0 <= a0 || b0 >= n || !(st[b0] - st[a0] >= 2.2)) continue;
      let on = 0; for (let k = a0; k < b0; k++) on += active[k];
      if (on < (b0 - a0) * 0.8) continue;
      let a = a0; while (st[b0] - st[a] > 4.5) a++;
      spinners.push({ a, b: b0 }); made++;
    }
  }
  chosen.sort((a, b) => a.step - b.step);

  // 6. objects
  const objs = [];
  for (const c of chosen) {
    const o = { type: c.sl ? 1 : 0, t: c.t, end: c.t, step: c.step, midi: c.midi, pitch: c.pitch };
    if (c.sl) { o.end = c.t + (st[c.step + c.sl] - st[c.step]); o.slSteps = c.sl; }
    objs.push(o);
  }
  for (const s of spinners) objs.push({ type: 2, t: st[s.a], end: st[s.b], step: s.a, midi: null, pitch: null });
  objs.sort((a, b) => a.t - b.t);
  // never let a malformed object reach the player
  for (let i = objs.length - 1; i >= 0; i--) if (!Number.isFinite(objs[i].t) || !Number.isFinite(objs[i].end) || objs[i].end < objs[i].t) objs.splice(i, 1);

  place(objs, D, A, rnd, sdur);

  // 7. combos, slider ticks, stats
  let ci = -1, num = 0, cnt = 0, startBar = -1, maxCombo = 0, taps = 0, slides = 0, spins = 0;
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i], prev = objs[i - 1], bar = Math.floor(o.step / 16);
    const gap = prev ? o.t - prev.end : 9;
    const nc = !prev || prev.type === 2 || o.type === 2 || gap > 1.6 || (bar !== startBar && cnt >= 4) || cnt >= 9;
    if (nc) { ci++; num = 0; cnt = 0; startBar = bar; }
    o.nc = nc; o.ci = ci % 4; o.num = ++num; cnt++;
    if (o.type === 1) {
      slides++;
      const span = o.slSteps / o.repeats; o.ticks = [];
      for (let j = 0; j < o.repeats; j++) {
        for (let off = 4; off < span - 1; off += 4) o.ticks.push({ f: (j * span + off) / o.slSteps, kind: 0 });
        if (j < o.repeats - 1) o.ticks.push({ f: (j + 1) / o.repeats, kind: 1 });
      }
      o.ticks.forEach((tk) => { tk.t = o.t + tk.f * (o.end - o.t); });
      maxCombo += 2 + o.ticks.length;
    } else { maxCombo += 1; if (o.type === 0) taps++; else spins++; }
  }
  // peak density over 8 s windows
  let peak = 0;
  for (let i = 0, j = 0; i < objs.length; i++) { while (objs[i].t - objs[j].t > 8) j++; peak = Math.max(peak, (i - j + 1) / 8); }
  const first = objs.length ? objs[0].t : 0, last = objs.length ? objs[objs.length - 1].end : 0;
  const nps = objs.length / Math.max(1, last - first);
  const stars = clamp(1.05 * Math.pow(Math.max(peak, nps), 0.8) * (0.9 + D.speed * 0.2), 0.5, 9.9);
  const fever = [];
  for (const s of src.sections) {
    if (!s.fever) continue;
    const a = st[s.s0], b = st[Math.min(s.s1, n)];
    if (fever.length && a - fever[fever.length - 1][1] < 0.05) fever[fever.length - 1][1] = b; else fever.push([a, b]);
  }
  return {
    diff: diffKey, D, A, objs, fever, bpm: src.bpm, stepTimes: st, nSteps: n,
    count: objs.length, taps, slides, spins, maxCombo, stars: Math.round(stars * 10) / 10, nps, first, last,
    duration: src.duration, exact: !!src.exact,
  };
}

function place(objs, D, A, rnd, sdur) {
  const mx = 0.1, my = 0.115;
  const bx0 = mx, bx1 = A - mx, by0 = my + 0.02, by1 = 1 - my;
  const inB = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const R = D.r;
  let px = A / 2, py = 0.5, ang = rnd() * TAU;
  let pat = 'flow', patLeft = 0, patI = 0, curl = 0.5, polyN = 4;
  const recent = [];
  const hard = D.key === 'hard' || D.key === 'insane';
  const overlap = (x, y, t) => {
    for (let k = recent.length - 1; k >= 0; k--) {
      const r = recent[k]; if (t - r.t > D.ar * 1.05) break;
      const dx = x - r.x, dy = y - r.y; if (dx * dx + dy * dy < R * R * 4.6) return true;
    }
    return false;
  };
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i], prev = objs[i - 1];
    if (o.type === 2) { o.x = A / 2; o.y = 0.5; px = A / 2; py = 0.5; ang = rnd() * TAU; patLeft = 0; continue; }
    const dt = prev ? o.t - prev.end : 9;
    if (patLeft <= 0 || dt > 1.2) {
      const r = rnd();
      pat = hard ? (r < 0.3 ? 'flow' : r < 0.52 ? 'zig' : r < 0.74 ? 'poly' : r < 0.9 ? 'jump' : 'line')
                 : (r < 0.5 ? 'flow' : r < 0.72 ? 'zig' : r < 0.92 ? 'poly' : 'line');
      patLeft = 3 + Math.floor(rnd() * 6); patI = 0;
      curl = (0.35 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1);
      polyN = [3, 4, 5, 5][Math.floor(rnd() * 4)];
    }
    patLeft--; patI++;
    let d = clamp(dt * D.speed, R * 1.45, D.maxJump);
    if (dt > 1.5) d = 0.22 + rnd() * 0.25;
    const stream = dt < 0.135;
    let a = ang;
    if (stream) { a += curl * 0.38; d = Math.max(R * 1.25, 0.07); }
    else if (pat === 'flow') a += curl;
    else if (pat === 'zig') a += (patI % 2 ? 1 : -1) * 2.25;
    else if (pat === 'poly') a += polyN === 5 ? (TAU * 2) / 5 : TAU / polyN;
    else if (pat === 'jump') { a += Math.PI + (rnd() - 0.5) * 0.9; d = Math.min(D.maxJump, d * 1.5); }
    if (hard && !stream && dt < 0.3 && rnd() < 0.07 && prev && prev.type === 0) d = 0; // stack
    if (!stream && prev && o.pitch != null && prev.pitch != null && o.pitch !== prev.pitch) {
      const up = o.pitch > prev.pitch; // higher note -> move up the screen
      if ((Math.sin(a) < 0) !== up && rnd() < 0.6) a = -a;
    }
    let nx = px, ny = py, ok = d === 0;
    for (let k = 0; k < 18 && !ok; k++) {
      const ta = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.36;
      const tx = px + Math.cos(ta) * d, ty = py + Math.sin(ta) * d;
      if (inB(tx, ty) && !overlap(tx, ty, o.t)) { nx = tx; ny = ty; a = ta; ok = true; }
    }
    if (!ok) {
      a = Math.atan2(0.5 - py, A / 2 - px) + (rnd() - 0.5) * 0.8;
      nx = clamp(px + Math.cos(a) * d, bx0, bx1); ny = clamp(py + Math.sin(a) * d, by0, by1);
    }
    o.x = nx; o.y = ny; ang = a;
    if (o.type === 1) {
      const dur = o.end - o.t;
      const maxLen = Math.min(0.6, A * 0.5), total = D.sl * dur;
      let rep = Math.max(1, Math.ceil(total / maxLen));
      rep = Math.min(rep, D.key === 'easy' ? 2 : 4);
      let L = clamp(total / rep, 0.15, maxLen);
      const r = rnd();
      const kind = L < 0.22 ? (r < 0.7 ? 0 : 1) : r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
      const bend = (0.22 + rnd() * 0.25) * (rnd() < 0.5 ? -1 : 1) * (kind === 2 ? 0.8 : 1);
      let pts = null;
      for (let attempt = 0; attempt < 4 && !pts; attempt++) {
        for (let k = 0; k < 18 && !pts; k++) {
          const ta = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.36;
          const p = sliderPath(nx, ny, ta, L, kind, bend);
          if (p.every((q) => inB(q[0], q[1]))) { pts = p; ang = ta; }
        }
        if (!pts) L *= 0.75;
      }
      if (!pts) {
        ang = Math.atan2(0.5 - ny, A / 2 - nx);
        pts = sliderPath(nx, ny, ang, Math.min(L, 0.18), 0, 0);
      }
      o.repeats = rep; o.path = pts;
      const e = rep % 2 ? pts[PATH_N - 1] : pts[0];
      const e0 = rep % 2 ? pts[PATH_N - 2] : pts[1];
      px = e[0]; py = e[1]; ang = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
      recent.push({ x: nx, y: ny, t: o.t }); recent.push({ x: pts[PATH_N - 1][0], y: pts[PATH_N - 1][1], t: o.end });
    } else {
      px = nx; py = ny;
      recent.push({ x: nx, y: ny, t: o.t });
    }
    if (recent.length > 24) recent.splice(0, recent.length - 24);
  }
  // normalise to 0..1 on both axes so the renderer can map onto any field size
  for (const o of objs) {
    o.x /= A;
    if (o.path) o.path = o.path.map((p) => [p[0] / A, p[1]]);
  }
}
