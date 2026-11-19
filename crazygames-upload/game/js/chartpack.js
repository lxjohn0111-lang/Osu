// Compact JSON form of analyser output (chart material), used for the pre-generated charts of
// the featured tracks in music/charts.json. Times are stored in milliseconds.
const r3 = (v) => Math.round(v * 1000);

export function packChart(a) {
  const beats = [];
  for (let k = 0; k <= a.nSteps; k += 4) beats.push(r3(a.stepTimes[k]));
  const active = [];
  if (a.active) {
    for (let s = 0; s < a.nSteps;) {
      if (!a.active[s]) { s++; continue; }
      let e = s; while (e < a.nSteps && a.active[e]) e++;
      active.push([s, e - s]); s = e;
    }
  }
  return {
    v: 1, bpm: a.bpm, duration: r3(a.duration), preview: r3(a.preview), beats,
    sections: a.sections.map((x) => [x.s0, x.s1, x.fever ? 1 : 0, Math.round(x.energy * 100)]),
    // [step, offset from grid (ms), sustain (steps), weight %, melodic 0/1, pitch %]
    cands: a.cands.map((c) => [c.step, r3(c.t - a.stepTimes[c.step]), c.dur, Math.round(c.w * 100), c.mel ? 1 : 0, c.pitch == null ? -1 : Math.round(c.pitch * 100)]),
    active,
  };
}

export function unpackChart(p) {
  const beats = p.beats.map((ms) => ms / 1000), nSteps = (beats.length - 1) * 4;
  const stepTimes = new Float64Array(nSteps + 1);
  for (let b = 0; b < beats.length - 1; b++) for (let q = 0; q < 4; q++) stepTimes[b * 4 + q] = beats[b] + ((beats[b + 1] - beats[b]) * q) / 4;
  stepTimes[nSteps] = beats[beats.length - 1];
  const ivs = []; for (let b = 1; b < beats.length; b++) ivs.push(beats[b] - beats[b - 1]);
  ivs.sort((x, y) => x - y);
  const active = new Uint8Array(nSteps);
  for (const [s, n] of p.active) active.fill(1, s, Math.min(nSteps, s + n));
  return {
    bpm: p.bpm, stepTimes, nSteps, stepDur: (ivs[ivs.length >> 1] || 0.5) / 4, barSteps: 16, phase: 0,
    sections: p.sections.map(([s0, s1, f, e]) => ({ s0, s1, fever: !!f, energy: e / 100, spin: 0 })),
    cands: p.cands.map(([step, off, dur, w, mel, pitch]) => ({ step, t: stepTimes[step] + off / 1000, dur, w: w / 100, mel: !!mel, pitch: pitch < 0 ? null : pitch / 100, midi: null })),
    duration: p.duration / 1000, songEnd: p.duration / 1000, exact: false, active, preview: p.preview / 1000,
  };
}
