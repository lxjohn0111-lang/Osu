// Audio analysis for "Your Music": turns any decoded song into chart material entirely
// on the player's device (nothing is uploaded). Pipeline:
//   mono/decimate -> STFT -> log-band spectral flux -> tempo (autocorrelation)
//   -> beat tracking (dynamic programming) -> onset picking -> snap to a 16th grid.

const N = 1024, H = 256;
// Spectral flux peaks slightly before the audible attack centre; this offset was measured
// against test tracks with known note times and is compensated here.
const ONSET_BIAS = -0.005;

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeFFT(n) {
  const rev = new Uint32Array(n), cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const hs = size >> 1, stp = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < hs; j++, k += stp) {
          const a = i + j, b = a + hs;
          const tr = re[b] * cos[k] + im[b] * sin[k], ti = im[b] * cos[k] - re[b] * sin[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

function quantile(arr, q) {
  if (!arr.length) return 0;
  const a = Float32Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

/** opts.bpm: the known tempo (e.g. from the composer's metadata); skips tempo estimation. */
export async function analyze(buffer, onProgress = () => {}, opts = {}) {
  const sr0 = buffer.sampleRate, dec = sr0 >= 32000 ? 2 : 1, sr = sr0 / dec;
  const n = Math.floor(buffer.length / dec), duration = buffer.duration;
  const c0 = buffer.getChannelData(0), c1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const x = new Float32Array(n);
  if (dec === 2) {
    if (c1) for (let i = 0, j = 0; i < n; i++, j += 2) x[i] = (c0[j] + c0[j + 1] + c1[j] + c1[j + 1]) * 0.25;
    else for (let i = 0, j = 0; i < n; i++, j += 2) x[i] = (c0[j] + c0[j + 1]) * 0.5;
  } else if (c1) for (let i = 0; i < n; i++) x[i] = (c0[i] + c1[i]) * 0.5;
  else x.set(c0.subarray(0, n));
  onProgress(0.03); await tick();

  const frames = Math.max(1, Math.floor((n - N) / H) + 1), fr = sr / H;
  const hann = new Float32Array(N); for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const fft = makeFFT(N), re = new Float32Array(N), im = new Float32Array(N);
  const NB = 24, edges = [];
  const fLo = 40, fHi = Math.min(10000, sr * 0.47);
  for (let b = 0; b <= NB; b++) edges.push(Math.max(1, Math.round((fLo * Math.pow(fHi / fLo, b / NB) * N) / sr)));
  for (let b = 1; b <= NB; b++) if (edges[b] <= edges[b - 1]) edges[b] = edges[b - 1] + 1;
  const prev = new Float32Array(NB), flux = new Float32Array(frames), low = new Float32Array(frames), cent = new Float32Array(frames), rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * H; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i] || 0; re[i] = v * hann[i]; im[i] = 0; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0, lo = 0, cs = 0;
    for (let b = 0; b < NB; b++) {
      let s = 0; const a = edges[b], z = edges[b + 1];
      for (let k = a; k < z; k++) s += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const E = Math.log1p((60 * s) / (z - a));
      const d = E - prev[b]; prev[b] = E;
      if (d > 0) { fl += d; cs += d * b; if (b < 5) lo += d; }
    }
    flux[f] = fl; low[f] = lo; cent[f] = fl > 0 ? cs / fl / (NB - 1) : 0.5;
    if (f % 1200 === 0) { onProgress(0.03 + 0.67 * (f / frames)); await tick(); }
  }

  // onset envelope: remove the local average, half-wave rectify, normalise
  const env = new Float32Array(frames), W = Math.round(fr * 0.25);
  { let acc = 0; const pre = new Float64Array(frames + 1); for (let i = 0; i < frames; i++) { acc += flux[i]; pre[i + 1] = acc; }
    let s2 = 0;
    for (let i = 0; i < frames; i++) { const a = Math.max(0, i - W), b = Math.min(frames, i + W + 1); const v = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a)); env[i] = v; s2 += v * v; }
    const sd = Math.sqrt(s2 / frames) || 1; for (let i = 0; i < frames; i++) env[i] /= sd; }
  onProgress(0.72); await tick();

  // tempo by autocorrelation with a log-normal prior around 120 BPM
  const lagMin = Math.max(2, Math.floor((fr * 60) / 200)), lagMax = Math.ceil((fr * 60) / 62);
  let bestLag = Math.round((fr * 60) / 120), bestScore = -1; const ac = new Float32Array(lagMax + 2);
  if (frames > lagMax * 4) {
    for (let L = lagMin; L <= lagMax + 1; L++) { let s = 0; for (let i = 0; i + L < frames; i++) s += env[i] * env[i + L]; ac[L] = s / (frames - L); }
    for (let L = lagMin; L <= lagMax; L++) {
      const bpm = (60 * fr) / L, pr = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.7, 2));
      const sc = ac[L] * pr; if (sc > bestScore) { bestScore = sc; bestLag = L; }
    }
  }
  let P = bestLag;
  if (opts.bpm > 0) P = (60 * fr) / opts.bpm;
  if (!(opts.bpm > 0) && bestLag > lagMin && bestLag < lagMax) { const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1], den = a - 2 * b + c; if (den < 0) P = bestLag + (0.5 * (a - c)) / den; }
  onProgress(0.78); await tick();

  // beat tracking (Ellis-style dynamic programming)
  const cum = new Float32Array(frames), back = new Int32Array(frames).fill(-1);
  const jLo = Math.round(P / 2), jHi = Math.round(P * 2), tight = 100;
  const cost = new Float32Array(jHi + 1); for (let d = jLo; d <= jHi; d++) { const lg = Math.log(d / P); cost[d] = -tight * lg * lg; }
  for (let i = 0; i < frames; i++) {
    let bv = -1e9, bj = -1;
    for (let d = jLo; d <= jHi; d++) { const j = i - d; if (j < 0) break; const v = cum[j] + cost[d]; if (v > bv) { bv = v; bj = j; } }
    cum[i] = env[i] + (bj >= 0 ? bv : 0); back[i] = bj;
    if (i % 20000 === 0) await tick();
  }
  let endI = frames - 1; { let bv = -1e9; for (let i = Math.max(0, frames - Math.round(P * 2)); i < frames; i++) if (cum[i] > bv) { bv = cum[i]; endI = i; } }
  let bf = []; for (let i = endI; i >= 0; i = back[i]) bf.push(i); bf.reverse();
  const fTime = (f) => (f * H + N / 2) / sr - ONSET_BIAS;
  let beats = bf.map((f) => {
    let ff = f;
    if (f > 0 && f < frames - 1 && env[f] >= env[f - 1] && env[f] >= env[f + 1]) { const a = env[f - 1], b = env[f], c = env[f + 1], den = a - 2 * b + c; if (den < 0) ff = f + (0.5 * (a - c)) / den; }
    return fTime(ff);
  });
  if (beats.length < 8) { beats = []; for (let t = 0; t < duration; t += 0.5) beats.push(t); }
  // smooth frame-quantisation jitter
  { const sm = beats.slice(); for (let k = 2; k < beats.length - 2; k++) sm[k] = (beats[k - 2] + beats[k - 1] + beats[k] + beats[k + 1] + beats[k + 2]) / 5; beats = sm; }
  // pick the downbeat phase from low-frequency energy, then extend to cover the song
  const lowAt = (t) => { const f = Math.round(((t + ONSET_BIAS) * sr - N / 2) / H); let m = 0; for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < frames) m = Math.max(m, low[k]); return m; };
  let ph = 0; { let bv = -1; for (let p = 0; p < 4; p++) { let s = 0; for (let k = p; k < beats.length; k += 4) s += lowAt(beats[k]); if (s > bv) { bv = s; ph = p; } } }
  const ivA = beats[1] - beats[0], ivZ = beats[beats.length - 1] - beats[beats.length - 2];
  let lead = 0; while (beats[0] - ivA * lead > 0) lead++;
  const m = lead + ((((-ph - lead) % 4) + 4) % 4); // prepend so that index 0 is a downbeat
  const head = []; for (let k = m; k >= 1; k--) head.push(beats[0] - ivA * k);
  beats = head.concat(beats);
  while (beats[beats.length - 1] < duration + ivZ * 4) beats.push(beats[beats.length - 1] + ivZ);
  const nSteps = (beats.length - 1) * 4, stepTimes = new Float64Array(nSteps + 1);
  for (let b = 0; b < beats.length - 1; b++) for (let q = 0; q < 4; q++) stepTimes[b * 4 + q] = beats[b] + ((beats[b + 1] - beats[b]) * q) / 4;
  stepTimes[nSteps] = beats[beats.length - 1];
  const ivs = []; for (let k = 1; k < bf.length; k++) ivs.push((bf[k] - bf[k - 1]) / fr);
  const medIv = ivs.length ? quantile(ivs, 0.5) : 0.5;
  const bpm = opts.bpm > 0 ? Math.round(opts.bpm) : bf.length > 8 ? Math.round((60 * (bf.length - 1)) / ((bf[bf.length - 1] - bf[0]) / fr)) : Math.round(60 / (medIv || 0.5));
  onProgress(0.88); await tick();

  // onset peak picking
  const on = []; const W2 = Math.round(fr * 0.6);
  { let acc = 0; const pre = new Float64Array(frames + 1); for (let i = 0; i < frames; i++) { acc += env[i]; pre[i + 1] = acc; }
    for (let i = 3; i < frames - 3; i++) {
      const v = env[i]; if (v <= 0) continue;
      if (v < env[i - 1] || v < env[i + 1] || v < env[i - 2] || v < env[i + 2] || v < env[i - 3] || v <= env[i + 3]) continue;
      const a = Math.max(0, i - W2), b = Math.min(frames, i + W2 + 1);
      if (v < 0.3 + 0.9 * ((pre[b] - pre[a]) / (b - a))) continue;
      const den = env[i - 1] - 2 * v + env[i + 1]; const ff = den < 0 ? i + (0.5 * (env[i - 1] - env[i + 1])) / den : i;
      on.push({ t: fTime(ff), w: v, c: cent[i], f: i });
    }
  }
  const p95 = quantile(on.map((o) => o.w), 0.95) || 1, cLo = quantile(on.map((o) => o.c), 0.05), cHi = quantile(on.map((o) => o.c), 0.95);
  const rmsRef = quantile(rms, 0.92) || 1e-6;
  const rmsAt = (t) => { const f = Math.round((t * sr - N / 2) / H); return f >= 0 && f < frames ? rms[f] : 0; };

  // snap to the grid
  const byStep = new Map();
  let si = 0;
  for (const o of on) {
    while (si < nSteps && stepTimes[si + 1] <= o.t) si++;
    let s = si; if (s < nSteps && Math.abs(stepTimes[s + 1] - o.t) < Math.abs(stepTimes[s] - o.t)) s++;
    if (s < 0 || s >= nSteps) continue;
    const sd = stepTimes[Math.min(nSteps, s + 1)] - stepTimes[s] || 0.12, dev = o.t - stepTimes[s];
    if (Math.abs(dev) > sd * 0.42) continue;
    const cur = byStep.get(s);
    if (!cur || o.w > cur.w) byStep.set(s, { step: s, t: stepTimes[s] + Math.max(-0.035, Math.min(0.035, dev)), w: Math.min(1, o.w / p95), pitch: cHi > cLo ? Math.max(0, Math.min(1, (o.c - cLo) / (cHi - cLo))) : 0.5 });
  }
  const list = Array.from(byStep.values()).sort((a, b) => a.step - b.step);
  const med = quantile(list.map((c) => c.w), 0.5);
  const melSteps = list.filter((c) => c.w >= med).map((c) => c.step);
  let mi = 0;
  const cands = list.map((c) => {
    const mel = c.w >= med;
    let dur = 0;
    if (mel) {
      while (mi < melSteps.length && melSteps[mi] <= c.step) mi++;
      const gap = (mi < melSteps.length ? melSteps[mi] : c.step) - c.step;
      if (gap >= 4 && gap <= 16) {
        const tm = (stepTimes[c.step] + stepTimes[c.step + gap]) / 2;
        const h = Math.imul(c.step + 7, 2654435761) >>> 0;
        if (rmsAt(tm) > 0.5 * rmsAt(c.t + 0.04) && h % 100 < 60) dur = gap;
      }
    }
    return { step: c.step, t: c.t, dur, w: mel ? c.w : 0.3 + 0.5 * (c.w / (med || 1)), mel, pitch: c.pitch, midi: null };
  });

  // per-step activity, per-bar energy, fever sections
  const active = new Uint8Array(nSteps);
  for (let s = 0; s < nSteps; s++) { const t = stepTimes[s]; active[s] = t >= 0 && t < duration - 0.3 && rmsAt(t) > rmsRef * 0.12 ? 1 : 0; }
  const bars = Math.ceil(nSteps / 16), en = new Float32Array(bars);
  for (let b = 0; b < bars; b++) { let s = 0, c = 0; for (let k = b * 16; k < Math.min(nSteps, b * 16 + 16); k++) { s += rmsAt(stepTimes[k]); c++; } en[b] = Math.min(1, s / Math.max(1, c) / rmsRef); }
  // "fever" = sustained loud AND busy passages (drops / choruses), ranked relative to the song itself
  const dens = new Float32Array(bars); let dMax = 1;
  for (const c of list) { const b = Math.floor(c.step / 16); if (b < bars) { dens[b]++; if (dens[b] > dMax) dMax = dens[b]; } }
  const met = new Float32Array(bars); let mMax = 0;
  for (let b = 0; b < bars; b++) { met[b] = en[b] * (0.5 + dens[b] / dMax); if (met[b] > mMax) mMax = met[b]; }
  const thr = Math.max(quantile(met, 0.62), mMax * 0.55);
  const hot = new Uint8Array(bars); for (let b = 0; b < bars; b++) hot[b] = met[b] >= thr && en[b] > 0.3 ? 1 : 0;
  for (let b = 1; b < bars - 1; b++) if (!hot[b] && hot[b - 1] && hot[b + 1]) hot[b] = 1;
  for (let b = 0; b < bars;) { if (!hot[b]) { b++; continue; } let e = b; while (e < bars && hot[e]) e++; if (e - b < 4) for (let k = b; k < e; k++) hot[k] = 0; b = e; }
  const sections = [];
  for (let b = 0; b < bars;) {
    let e = b; while (e < bars && hot[e] === hot[b]) e++;
    let s = 0; for (let k = b; k < e; k++) s += en[k];
    sections.push({ s0: b * 16, s1: Math.min(nSteps, e * 16), fever: !!hot[b], energy: s / (e - b), spin: 0 });
    b = e;
  }
  const fev = sections.find((s) => s.fever);
  onProgress(1);
  return {
    bpm, stepTimes, nSteps, stepDur: medIv / 4, barSteps: 16, phase: 0, sections, cands, duration, songEnd: duration,
    exact: false, active, preview: fev ? Math.max(0, stepTimes[fev.s0]) : duration * 0.3, onsetCount: on.length,
  };
}
