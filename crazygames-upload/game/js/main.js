// STARPULSE — main controller: boot, menus, track library, run lifecycle, progression.
import { $, $$, esc, clamp, fmtTime, hashStr, hslToRgb, rgbToHex, isTouch, sleep } from './util.js';
import { SDK } from './sdk.js';
import { Save, Library, levelInfo } from './storage.js';
import { AudioSys } from './audio.js';
import { SONGS } from './songs.js';
import { renderSong, chartSource } from './synth.js';
import { analyze } from './analyzer.js';
import { generate, DIFFS, DIFF_ORDER } from './mapgen.js';
import { Play, MODS, MOD_ORDER, modMultiplier } from './game.js';
import { Renderer, SKINS, PALS, TRAILS, drawResultGraph } from './render.js';
import { Background } from './background.js';

const S = {
  state: 'boot', tracks: [], sel: null, diff: 'normal', play: null, touch: isTouch(),
  buffers: new Map(), pending: new Map(), maps: new Map(), previewToken: 0, lastRes: null, overlay: [], rebinding: null, musicFor: null,
};
let bg, R;

const ACH = [
  { id: 'first', name: 'First Light', desc: 'Clear your first track', test: (r) => !r.failed },
  { id: 'fc', name: 'Unbroken', desc: 'Full combo any track', test: (r) => r.fc },
  { id: 's', name: 'Stellar', desc: 'Earn an S rank', test: (r) => r.rank === 'S' || r.rank === 'S+' },
  { id: 'ss', name: 'Supernova', desc: 'Finish with 100% accuracy', test: (r) => r.rank === 'S+' },
  { id: 'c100', name: 'Chain Reaction', desc: 'Reach a 100 combo', test: (r) => r.maxCombo >= 100 },
  { id: 'c500', name: 'Perpetual Motion', desc: 'Reach a 500 combo', test: (r) => r.maxCombo >= 500 },
  { id: 'own', name: 'My Soundtrack', desc: 'Clear one of your own songs', test: (r, d, t) => !r.failed && !t.builtin },
  { id: 'hard', name: 'Escape Velocity', desc: 'Clear a track on Hard', test: (r) => !r.failed && (r.diff === 'hard' || r.diff === 'insane') },
  { id: 'insane', name: 'Event Horizon', desc: 'Clear a track on Insane', test: (r) => !r.failed && r.diff === 'insane' },
  { id: 'over', name: 'Lightspeed', desc: 'Clear a track with Overdrive', test: (r) => !r.failed && r.mods.includes('overdrive') },
  { id: 'black', name: 'Blind Faith', desc: 'Clear a track with Blackout', test: (r) => !r.failed && r.mods.includes('blackout') },
  { id: 'all', name: 'World Tour', desc: 'Clear every original track', test: (r, d) => SONGS.every((s) => d.stats.cleared[s.id]) },
  { id: 'p1000', name: 'Precision Engine', desc: 'Land 1,000 PERFECT hits', test: (r, d) => d.stats.perfects >= 1000 },
  { id: 'lvl10', name: 'Rising Star', desc: 'Reach level 10', test: (r, d) => levelInfo(d.xp).level >= 10 },
];

// ------------------------------------------------------------------ helpers
const D = () => Save.data;
const sfx = (n, o) => AudioSys.sfx(n, o);
function toast(html, gold) {
  const el = document.createElement('div'); el.className = 'toast' + (gold ? ' gold' : ''); el.innerHTML = html;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 4300);
}
function setState(s) { S.state = s; document.body.dataset.state = s; }
function show(name) {
  $$('.screen').forEach((el) => el.classList.toggle('active', el.id === 'scr-' + name));
  setState(name);
}
function openOv(id) { const el = $('#ov-' + id); if (!el.classList.contains('on')) { el.classList.add('on'); S.overlay.push(id); } }
function closeOv(id) {
  id = id || S.overlay[S.overlay.length - 1]; if (!id) return;
  $('#ov-' + id).classList.remove('on'); S.overlay = S.overlay.filter((x) => x !== id);
}
const topOv = () => S.overlay[S.overlay.length - 1];
function applyTheme(t) {
  const st = document.documentElement.style;
  st.setProperty('--c1', t.palette[0]); st.setProperty('--c2', t.palette[1]); st.setProperty('--c3', t.palette[2]);
  bg.setTheme(t.palette, t.bg); R.setTrackPalette(t.palette);
}
function applySettings() {
  const s = D().settings;
  AudioSys.setVolume({ master: s.master, music: s.music, sfx: s.sfx });
  R.setQuality(s.quality); bg.setQuality(s.quality);
  R.cursorSize = s.cursorSize; R.showErr = s.errBar; R.showFps = s.fps; R.allowShake = s.shake;
  R.setStyle(D().equip);
  if (S.state === 'play') bg.tdim = s.dim;
}
const keyLabel = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').toUpperCase();
function fieldAspect() {
  const w = window.innerWidth, h = window.innerHeight;
  const aw = w - Math.max(10, w * 0.035) * 2, ah = h - Math.max(58, h * 0.1) - Math.max(34, h * 0.07);
  return Math.round(clamp(aw / Math.max(50, ah), 0.62, 1.9) * 20) / 20;
}

// ------------------------------------------------------------------- tracks
function builtinTrack(spec) {
  const src = chartSource(spec);
  return { id: spec.id, title: spec.title, artist: spec.artist, genre: spec.genre, bpm: spec.bpm, duration: src.songEnd, palette: spec.palette, bg: spec.bg, builtin: true, spec, src };
}
function userTrack(rec) {
  const h = hashStr(rec.id), hue = h % 360;
  const palette = [rgbToHex(hslToRgb(hue, 0.92, 0.58)), rgbToHex(hslToRgb(hue + 45, 0.9, 0.6)), rgbToHex(hslToRgb(hue + 170, 0.95, 0.7))];
  return { id: rec.id, title: rec.title, artist: rec.artist, genre: 'YOUR MUSIC', bpm: rec.analysis.bpm, duration: rec.duration, palette, bg: (h >>> 9) % 5, builtin: false, rec, src: rec.analysis };
}
function getBuffer(t, onProgress) {
  const hit = S.buffers.get(t.id);
  if (hit) { hit.at = performance.now(); if (onProgress) onProgress(1); return Promise.resolve(hit.buf); }
  let pend = S.pending.get(t.id);
  if (!pend) {
    const cbs = [];
    const p = (t.builtin ? renderSong(t.spec, (v) => cbs.forEach((f) => f(v))) : t.rec.blob.arrayBuffer().then((ab) => AudioSys.decode(ab)))
      .then((buf) => {
        S.pending.delete(t.id); S.buffers.set(t.id, { buf, at: performance.now() });
        while (S.buffers.size > 3) { // keep memory bounded: drop the least recently used track
          let old = null; for (const [k, v] of S.buffers) if (k !== t.id && (!S.sel || k !== S.sel.id) && (!old || v.at < old[1].at)) old = [k, v];
          if (!old) break; S.buffers.delete(old[0]);
        }
        return buf;
      }, (e) => { S.pending.delete(t.id); throw e; });
    pend = { p, cbs }; S.pending.set(t.id, pend);
  }
  if (onProgress) pend.cbs.push(onProgress);
  return pend.p;
}
function getMap(t, diff) {
  const A = fieldAspect(), key = t.id + '|' + diff + '|' + A;
  let m = S.maps.get(key);
  if (!m) {
    m = generate(t.src, diff, A, t.id);
    // star rating must climb with difficulty even when two charts end up similarly dense
    const i = DIFF_ORDER.indexOf(diff);
    if (i > 0) { const prev = getMap(t, DIFF_ORDER[i - 1]); if (m.stars < prev.stars + 0.3) m.stars = Math.round((prev.stars + 0.3 + i * 0.1) * 10) / 10; }
    S.maps.set(key, m); if (S.maps.size > 60) S.maps.delete(S.maps.keys().next().value);
  }
  return m;
}
function beatPhase(t, time) {
  const st = t.src.stepTimes, n = t.src.nSteps;
  if (!n || time < st[0]) return 0;
  let lo = 0, hi = n; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (st[m] <= time) lo = m; else hi = m; }
  const b = lo - (lo % 4), a = st[b], z = st[Math.min(n, b + 4)];
  return z > a ? clamp((time - a) / (z - a), 0, 1) : 0;
}

// --------------------------------------------------------------- menu music
function preview(t, force) {
  if (!AudioSys.ready) return;
  if (!force && S.musicFor === t.id && AudioSys.music) return;
  const token = ++S.previewToken;
  $('#np-text').textContent = t.builtin ? `Synthesising “${t.title}”…` : `Loading “${t.title}”…`;
  getBuffer(t).then((buf) => {
    if (token !== S.previewToken || S.state === 'play') return;
    AudioSys.playMusic(buf, { offset: Math.max(0, t.src.preview - 0.02), loop: true, fade: 0.9, vol: 0.9 });
    AudioSys.setLowpass(S.state === 'results' ? 900 : 22000, 0.3);
    S.musicFor = t.id;
    $('#np-text').textContent = `NOW PLAYING — ${t.title} · ${t.artist}`;
  }).catch(() => { $('#np-text').textContent = 'Could not load this track.'; });
}

// ------------------------------------------------------------- song select
function refreshPlayer() {
  const li = levelInfo(D().xp);
  $('#pl-level').textContent = li.level; $('#pl-xp').style.width = (li.frac * 100).toFixed(1) + '%';
  $('#pl-sub').textContent = `${li.cur.toLocaleString()} / ${li.need.toLocaleString()} XP`;
}
function renderList() {
  const el = $('#song-list'); el.innerHTML = '';
  const add = document.createElement('button'); add.className = 'song add';
  add.innerHTML = '<svg><use href="#i-plus"/></svg><div>ADD YOUR MUSIC<small>Any audio file · analysed on your device</small></div>';
  add.onclick = () => { sfx('click'); openOv('import'); };
  el.appendChild(add);
  const mine = S.tracks.filter((t) => !t.builtin), built = S.tracks.filter((t) => t.builtin);
  const section = (label, list) => {
    if (!list.length) return;
    const h = document.createElement('div'); h.className = 'list-head'; h.textContent = label; el.appendChild(h);
    for (const t of list) {
      const b = document.createElement('button'); b.className = 'song' + (S.sel && S.sel.id === t.id ? ' on' : ''); b.dataset.id = t.id;
      b.style.setProperty('--s1', t.palette[0]); b.style.setProperty('--s2', t.palette[1]); b.style.setProperty('--s3', t.palette[2]);
      const best = Save.bestOf(t.id, S.diff);
      b.innerHTML = `<div class="disc">${esc(t.title[0] || '?').toUpperCase()}</div><div class="meta"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)} · ${t.bpm} BPM · ${fmtTime(t.duration)}</div></div>` +
        (best ? `<div class="r rk-${best.rank.replace('+', 'p')}">${best.rank}</div>` : '') +
        (t.builtin ? '' : '<span class="del" title="Remove"><svg><use href="#i-x"/></svg></span>');
      b.onclick = (e) => {
        if (e.target.closest('.del')) { removeTrack(t); return; }
        if (S.sel && S.sel.id === t.id) startGame(); else { sfx('click'); select(t); }
      };
      b.onmouseenter = () => sfx('hover');
      el.appendChild(b);
    }
  };
  section('YOUR MUSIC', mine); section('ORIGINAL SOUNDTRACK', built);
}
function renderInfo() {
  const t = S.sel; if (!t) return;
  $('#si-genre').textContent = t.genre; $('#si-title').textContent = t.title; $('#si-artist').textContent = t.artist;
  $('#si-bpm').textContent = t.bpm; $('#si-len').textContent = fmtTime(t.duration);
  const tabs = $('#diff-tabs'); tabs.innerHTML = '';
  for (const k of DIFF_ORDER) {
    const m = getMap(t, k), b = document.createElement('button');
    b.className = 'diff' + (k === S.diff ? ' on' : ''); b.style.setProperty('--dc', DIFFS[k].color);
    b.innerHTML = `<b>${DIFFS[k].name}</b><span>★ ${m.stars.toFixed(1)}</span>`;
    b.onclick = () => { if (S.diff !== k) { S.diff = k; D().lastDiff = k; Save.save(); sfx('click'); renderInfo(); renderList(); } };
    tabs.appendChild(b);
  }
  const m = getMap(t, S.diff);
  $('#si-notes').textContent = m.count; $('#si-stars').textContent = m.stars.toFixed(1);
  const best = Save.bestOf(t.id, S.diff), bel = $('#si-best');
  bel.innerHTML = best
    ? `<div class="rk rk-${best.rank.replace('+', 'p')}">${best.rank}</div><div><div class="bs">${best.score.toLocaleString()}</div><div class="bd">${(best.acc * 100).toFixed(2)}% · ${best.combo}x${best.mods && best.mods.length ? ' · ' + best.mods.map((x) => x.toUpperCase()).join(' ') : ''}</div></div>`
    : '<div class="bd">NO SCORE YET — SET THE FIRST RECORD</div>';
  const mods = D().mods, badge = $('#mods-badge');
  badge.textContent = mods.length ? '×' + modMultiplier(mods).toFixed(2) : ''; badge.classList.toggle('on', mods.length > 0);
}
function select(t, quiet) {
  S.sel = t; D().lastSong = t.id; Save.save();
  applyTheme(t);
  $$('#song-list .song').forEach((b) => b.classList.toggle('on', b.dataset.id === t.id));
  renderInfo();
  if (!quiet) preview(t);
}
async function removeTrack(t) {
  sfx('back');
  await Library.del(t.id); S.buffers.delete(t.id);
  S.tracks = S.tracks.filter((x) => x.id !== t.id);
  if (S.sel && S.sel.id === t.id) select(S.tracks.find((x) => x.builtin));
  renderList(); toast(`Removed “${esc(t.title)}”`);
}

// -------------------------------------------------------------- import flow
async function importFiles(files) {
  files = Array.from(files).filter((f) => /^audio\//.test(f.type) || /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i.test(f.name));
  if (!files.length) { toast('That is not an audio file I can read.'); return; }
  await AudioSys.unlock();
  closeOv('import');
  let lastOk = null;
  for (const f of files.slice(0, 8)) {
    const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    const parts = base.split(/\s+-\s+/);
    const title = (parts.length > 1 ? parts.slice(1).join(' - ') : base).slice(0, 80) || 'Untitled', artist = parts.length > 1 ? parts[0].slice(0, 60) : 'Your Music';
    $('#load-title').textContent = 'ANALYSING YOUR TRACK'; $('#load-sub').textContent = `“${title}” — decoding audio…`; $('#load-fill').style.width = '4%';
    openOv('loading');
    try {
      const ab = await f.arrayBuffer();
      const buf = await AudioSys.decode(ab.slice(0));
      if (buf.duration < 15) throw new Error('short');
      if (buf.duration > 15 * 60) throw new Error('long');
      $('#load-sub').textContent = `“${title}” — finding tempo, beats and drops…`;
      const analysis = await analyze(buf, (p) => { $('#load-fill').style.width = (4 + p * 96).toFixed(0) + '%'; });
      const id = 'u-' + hashStr(f.name + '|' + f.size + '|' + Math.round(buf.duration)).toString(36);
      const rec = { id, title, artist, duration: buf.duration, analysis, blob: f, added: Date.now() };
      const stored = await Library.put(rec);
      S.tracks = S.tracks.filter((x) => x.id !== id);
      const t = userTrack(rec); S.tracks.unshift(t);
      S.buffers.set(id, { buf, at: performance.now() });
      lastOk = t; D().stats.imported++; Save.save();
      toast(`<b>ADDED</b> ${esc(title)} · ${analysis.bpm} BPM${stored ? '' : ' (this session only)'}`, true);
    } catch (e) {
      const why = e && e.message === 'short' ? 'is too short (15 s minimum)' : e && e.message === 'long' ? 'is too long (15 min maximum)' : 'could not be decoded by this browser';
      toast(`“${esc(title)}” ${why}.`);
    }
  }
  closeOv('loading');
  if (lastOk) { if (S.state !== 'select') show('select'); renderList(); select(lastOk, true); preview(lastOk, true); $('#song-list').scrollTop = 0; }
}

// -------------------------------------------------------------- run control
async function startGame() {
  const t = S.sel; if (!t || S.starting) return;
  S.starting = true; sfx('start');
  await AudioSys.unlock();
  S.previewToken++;
  if (!S.buffers.has(t.id)) {
    $('#load-title').textContent = t.builtin ? 'SYNTHESISING TRACK' : 'LOADING TRACK';
    $('#load-sub').textContent = t.builtin ? 'Rendering the music on your device…' : 'Decoding your audio…'; $('#load-fill').style.width = '3%';
    openOv('loading');
  }
  let buf;
  try { buf = await getBuffer(t, (p) => { $('#load-fill').style.width = (3 + p * 97).toFixed(0) + '%'; }); }
  catch (e) { closeOv('loading'); S.starting = false; toast('Could not load this track.'); return; }
  closeOv('loading');
  AudioSys.stopMusic(0.25); S.musicFor = null;
  await sleep(260);
  beginRun(t, buf);
  S.starting = false;
}
function beginRun(t, buf) {
  const map = getMap(t, S.diff);
  R.reset(); R.beatPhase = (time) => beatPhase(t, time);
  S.play = new Play({ map, track: t, buffer: buf, mods: D().mods, settings: D().settings, fx: R, touch: S.touch, onEnd: onRunEnd, onFail: onRunFail });
  S.play.layout(window.innerWidth, window.innerHeight);
  S.overlay.slice().forEach((id) => closeOv(id));
  setState('play'); $$('.screen').forEach((el) => el.classList.remove('active'));
  bg.tdim = D().settings.dim; bg.tfever = 0;
  SDK.gameplayStart();
  S.play.start();
}
function pauseGame() {
  if (S.state !== 'play' || !S.play || !S.play.pause()) return;
  SDK.gameplayStop(); openOv('pause'); sfx('back');
}
function resumeGame() {
  closeOv('pause'); if (!S.play || S.play.state !== 'paused') return;
  SDK.gameplayStart(); S.play.resume();
}
function retry(withAd) {
  const p = S.play; if (!p) return;
  const t = p.track, buf = p.buffer; p.stop();
  S.overlay.slice().forEach((id) => closeOv(id));
  const go = () => beginRun(t, buf);
  if (withAd) SDK.requestAd('midgame').then(go); else go();
}
function quitToSelect(withAd) {
  if (S.play) S.play.stop();
  S.play = null; SDK.gameplayStop();
  S.overlay.slice().forEach((id) => closeOv(id));
  bg.tdim = 0; bg.tfever = 0; R.reset();
  const go = () => { show('select'); renderList(); renderInfo(); refreshPlayer(); AudioSys.setLowpass(22000, 0.4); if (S.sel) preview(S.sel, !AudioSys.music); };
  if (withAd) SDK.requestAd('midgame').then(go); else go();
}
function onRunFail(p) {
  SDK.gameplayStop();
  const res = p.results(true); S.lastRes = res;
  $('#fail-sub').textContent = `You made it ${(res.progress * 100).toFixed(0)}% of the way with a ${res.maxCombo}x best combo.`;
  $('#btn-revive').style.display = p.reviveUsed ? 'none' : '';
  openOv('fail');
}
async function revive() {
  const p = S.play; if (!p || p.state !== 'failed' || p.reviveUsed) return;
  $('#btn-revive').disabled = true;
  const ok = await SDK.requestAd('rewarded');
  $('#btn-revive').disabled = false;
  if (!ok) { toast('No ad available right now — try again in a moment.'); return; }
  closeOv('fail'); R.failT = 0; R.flash = 0.4; R.flashCol = [255, 214, 102];
  await AudioSys.unlock(); AudioSys.setLowpass(22000, 0.3);
  SDK.gameplayStart(); p.revive(); toast('<b>REVIVED</b> Energy restored — keep going!', true);
}
function onRunEnd(res) {
  SDK.gameplayStop();
  S.lastRes = res;
  showResults(res, S.play.track);
}
function failToResults() { // player gave up after failing: still show the breakdown
  const p = S.play; closeOv('fail');
  showResults(S.lastRes || p.results(true), p.track);
}

// ------------------------------------------------------------------ results
function showResults(res, t) {
  const d = D(), ranked = !res.auto && !res.failed, before = levelInfo(d.xp);
  let xpGain = 0, newBest = false; const unlocked = [];
  if (!res.auto) {
    xpGain = Math.round((res.score / 1e6) * 320 * DIFFS[res.diff].xp * (res.failed ? 0.3 : 1)) + (res.fc ? 60 : 0);
    d.xp += xpGain; d.plays++; d.stats.hits += res.hits; d.stats.perfects += res.perfects; d.stats.maxCombo = Math.max(d.stats.maxCombo, res.maxCombo);
    if (ranked) {
      d.stats.cleared[t.id] = true; if (res.fc) d.stats.fcs++;
      newBest = Save.addScore(t.id, res.diff, { score: res.score, acc: res.acc, combo: res.maxCombo, rank: res.rank, mods: res.mods, date: Date.now() });
    }
    for (const a of ACH) if (!d.ach[a.id] && a.test(res, d, t)) { d.ach[a.id] = Date.now(); unlocked.push(a); }
    Save.save(); Save.flush(); // write the run's progress immediately
  }
  const after = levelInfo(d.xp);
  S.play = null; bg.tdim = 0.25; bg.tfever = 0; R.reset();
  show('results');
  $('#res-title').textContent = t.title;
  $('#res-sub').textContent = `${t.artist} · ${DIFFS[res.diff].name}${res.mods.length ? ' · ' + res.mods.map((m) => m.toUpperCase()).join(' ') : ''}`;
  const rb = $('#res-rank'); rb.textContent = res.rank; rb.className = 'rank-badge' + (res.failed ? ' rF' : '');
  $('#res-status').textContent = res.failed ? 'TRACK FAILED' : res.auto ? 'AUTOPLAY' : 'TRACK CLEAR';
  const flags = [];
  if (res.fc && !res.auto) flags.push('<span class="flag gold">FULL COMBO</span>');
  if (newBest) flags.push('<span class="flag gold">NEW BEST</span>');
  if (res.auto) flags.push('<span class="flag">UNRANKED</span>');
  if (res.mult !== 1 && !res.auto) flags.push(`<span class="flag">SCORE ×${res.mult.toFixed(2)}</span>`);
  $('#res-flags').innerHTML = flags.join('');
  $('#res-acc').textContent = (res.acc * 100).toFixed(2) + '%'; $('#res-combo').textContent = `${res.maxCombo}x`;
  $('#res-p').textContent = res.counts[3]; $('#res-g').textContent = res.counts[2]; $('#res-o').textContent = res.counts[1]; $('#res-m').textContent = res.counts[0];
  // timing advice
  const tim = $('#res-timing');
  if (res.errors.length >= 12 && !res.auto) {
    const m = Math.round(res.meanErr), dir = m > 0 ? 'late' : 'early';
    tim.innerHTML = `<span>Average timing: <b>${Math.abs(m)} ms ${Math.abs(m) < 4 ? '— spot on' : dir}</b> · spread ±${Math.round(res.sdErr)} ms</span>`;
    if (Math.abs(m) >= 12) {
      const b = document.createElement('button'); b.textContent = `CALIBRATE ${m > 0 ? '+' : ''}${m} MS`;
      b.onclick = () => { d.settings.offset = clamp(Math.round(d.settings.offset + m), -200, 200); Save.save(); b.remove(); sfx('click'); toast(`Audio offset set to ${d.settings.offset} ms`); };
      tim.appendChild(b);
    }
  } else tim.textContent = '';
  $('#res-xp-text').textContent = res.auto ? 'NO XP IN AUTOPLAY' : `+${xpGain.toLocaleString()} XP`;
  $('#res-lvl').textContent = 'LV ' + before.level; $('#res-xp-bar').style.width = (before.frac * 100) + '%';
  requestAnimationFrame(() => drawResultGraph($('#res-graph'), res, t.palette));
  // animated reveal
  const sc = $('#res-score'), t0 = performance.now();
  const tickScore = (now) => { const k = clamp((now - t0) / 1100, 0, 1), e = 1 - Math.pow(1 - k, 4); sc.textContent = Math.round(res.score * e).toLocaleString(); if (k < 1 && S.state === 'results') requestAnimationFrame(tickScore); };
  requestAnimationFrame(tickScore);
  setTimeout(() => {
    if (S.state !== 'results') return;
    rb.classList.add('show'); sfx(res.failed ? 'back' : 'rank', { vol: 0.9 });
    if (!res.failed) { R.menuBurst(window.innerWidth * 0.3, window.innerHeight * 0.45); if (res.rank[0] === 'S' || res.fc) setTimeout(() => sfx('fanfare', { vol: 0.8 }), 420); }
    $('#res-xp-bar').style.width = (after.level > before.level ? 100 : after.frac * 100) + '%';
    if (after.level > before.level) setTimeout(() => { $('#res-lvl').textContent = 'LV ' + after.level; $('#res-xp-bar').style.width = (after.frac * 100) + '%'; toast(`<b>LEVEL UP</b> You reached level ${after.level}!`, true); sfx('milestone');
      for (const [grp, tbl] of [['skin', SKINS], ['pal', PALS], ['trail', TRAILS]]) for (const k of Object.keys(tbl)) if (tbl[k].level > before.level && tbl[k].level <= after.level) toast(`<b>UNLOCKED</b> ${tbl[k].name} ${grp === 'skin' ? 'note skin' : grp === 'pal' ? 'palette' : 'trail'}`, true);
    }, 950);
  }, 650);
  unlocked.forEach((a, i) => setTimeout(() => { toast(`<b>ACHIEVEMENT</b> ${a.name} — ${a.desc}`, true); }, 1500 + i * 700));
  if (ranked && (res.fc || res.rank[0] === 'S' || newBest)) SDK.happytime();
  if (S.sel) { AudioSys.setLowpass(900, 0.2); setTimeout(() => { if (S.state === 'results') preview(S.sel, true); }, 900); }
}

// ------------------------------------------------------------------ overlays
function renderMods() {
  const g = $('#mods-grid'), mods = D().mods; g.innerHTML = '';
  for (const k of MOD_ORDER) {
    const m = MODS[k], b = document.createElement('button'); b.className = 'mod' + (mods.includes(k) ? ' on' : '');
    b.innerHTML = `<b>${m.name}<i>${m.unranked ? 'UNRANKED' : '×' + m.mult.toFixed(2)}</i></b><p>${m.desc}</p>`;
    b.onclick = () => {
      let cur = D().mods;
      if (cur.includes(k)) cur = cur.filter((x) => x !== k); else cur = cur.filter((x) => !(m.excl || []).includes(x) && !(MODS[x].excl || []).includes(k)).concat(k);
      D().mods = cur; Save.save(); sfx('click'); renderMods(); renderInfo();
    };
    g.appendChild(b);
  }
  $('#mods-mult').textContent = mods.includes('auto') ? 'UNRANKED' : 'SCORE ×' + modMultiplier(mods).toFixed(2);
}
function renderSettings() {
  const s = D().settings, el = $('#settings-body'); el.innerHTML = '';
  const head = (t) => { const h = document.createElement('h4'); h.textContent = t; el.appendChild(h); };
  const slider = (label, key, min, max, step, fmt) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${fmt(s[key])}</output>`;
    const inp = r.querySelector('input'), out = r.querySelector('output');
    inp.oninput = () => { s[key] = parseFloat(inp.value); out.textContent = fmt(s[key]); applySettings(); Save.save(); };
    inp.onchange = () => sfx(key === 'sfx' ? 'hit' : 'click');
    el.appendChild(r);
  };
  const toggle = (label, key) => {
    const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>${label}</label><button class="toggle${s[key] ? ' on' : ''}"></button>`;
    const b = r.querySelector('button'); b.onclick = () => { s[key] = !s[key]; b.classList.toggle('on', s[key]); applySettings(); Save.save(); sfx('click'); };
    el.appendChild(r);
  };
  const pct = (v) => Math.round(v * 100) + '%';
  head('AUDIO');
  slider('Master volume', 'master', 0, 1, 0.01, pct); slider('Music', 'music', 0, 1, 0.01, pct); slider('Hit sounds & effects', 'sfx', 0, 1, 0.01, pct);
  slider('Audio offset', 'offset', -200, 200, 1, (v) => (v > 0 ? '+' : '') + v + ' ms');
  toggle('Melodic hit sounds (play the tune as you hit)', 'melodic');
  head('VISUALS');
  slider('Background dim while playing', 'dim', 0, 0.9, 0.01, pct); slider('Cursor size', 'cursorSize', 0.6, 1.8, 0.05, (v) => v.toFixed(2) + '×');
  { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<label>Effects quality</label><div class="seg"></div>';
    const seg = r.querySelector('.seg');
    for (const q of ['low', 'medium', 'high']) { const b = document.createElement('button'); b.textContent = q.toUpperCase(); b.className = s.quality === q ? 'on' : ''; b.onclick = () => { s.quality = q; applySettings(); Save.save(); sfx('click'); renderSettings(); }; seg.appendChild(b); }
    el.appendChild(r); }
  toggle('Timing bar', 'errBar'); toggle('Screen shake on miss', 'shake'); toggle('Show FPS', 'fps');
  head('CONTROLS');
  { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>Hit keys</label><button class="keybtn" data-k="k1">${keyLabel(s.k1)}</button><button class="keybtn" data-k="k2">${keyLabel(s.k2)}</button>`;
    r.querySelectorAll('.keybtn').forEach((b) => { b.onclick = () => { $$('.keybtn').forEach((x) => x.classList.remove('wait')); b.classList.add('wait'); b.textContent = '…'; S.rebinding = b.dataset.k; }; });
    el.appendChild(r); }
  toggle('Mouse buttons hit notes', 'mouseBtns');
  head('PROGRESS');
  { const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<label>${SDK.cloud ? 'Your level, scores, unlocks and settings are saved automatically through CrazyGames.' : 'Your level, scores, unlocks and settings are saved automatically in this browser.'}</label>`;
    el.appendChild(r); }
}
function isUnlocked(grp, key, tbl) { return levelInfo(D().xp).level >= tbl[key].level || D().unlocked[grp].includes(key); }
function renderCustom() {
  const el = $('#custom-body'); el.innerHTML = '';
  const group = (title, grp, tbl, pv) => {
    const h = document.createElement('h4'); h.textContent = title; el.appendChild(h);
    const wrap = document.createElement('div'); wrap.className = 'tiles';
    for (const k of Object.keys(tbl)) {
      const ok = isUnlocked(grp, k, tbl), b = document.createElement('button');
      b.className = 'tile' + (D().equip[grp] === k ? ' on' : '') + (ok ? '' : ' locked');
      b.innerHTML = `<div class="pv"></div><b>${tbl[k].name}</b><span class="lk">${ok ? (D().equip[grp] === k ? 'EQUIPPED' : '') : `LV ${tbl[k].level} · ▶ AD`}</span>`;
      b.querySelector('.pv').appendChild(pv(k));
      b.onclick = async () => {
        if (!isUnlocked(grp, k, tbl)) {
          sfx('click');
          const got = await SDK.requestAd('rewarded');
          if (!got) { toast(`Reach level ${tbl[k].level} to unlock ${tbl[k].name}, or try the ad again later.`); return; }
          D().unlocked[grp].push(k); Save.save(); Save.flush(); toast(`<b>UNLOCKED</b> ${tbl[k].name}`, true); sfx('milestone');
        } else sfx('click');
        D().equip[grp] = k; Save.save(); applySettings(); renderCustom();
      };
      wrap.appendChild(b);
    }
    el.appendChild(wrap);
  };
  group('NOTE SKIN', 'skin', SKINS, (k) => {
    const keep = R.skin; R.skin = k; R.sprites.clear();
    const s = R.noteSprite(0, 20), cv = document.createElement('canvas'); cv.width = cv.height = 116; cv.getContext('2d').drawImage(s.cv, 0, 0, 116, 116);
    R.skin = keep; R.sprites.clear(); return cv;
  });
  group('COMBO PALETTE', 'pal', PALS, (k) => {
    const d = document.createElement('div'); d.className = 'sw';
    const cols = PALS[k].colors || (S.sel ? [S.sel.palette[0], S.sel.palette[2], S.sel.palette[1], '#ffffff'] : ['#f0f', '#0ff', '#ff0', '#fff']);
    d.innerHTML = cols.map((c) => `<i style="background:${c};color:${c}"></i>`).join(''); return d;
  });
  group('CURSOR TRAIL', 'trail', TRAILS, (k) => {
    const d = document.createElement('div'); d.className = 'tr';
    d.style.background = k === 'rainbow' ? 'linear-gradient(90deg,transparent,#f55,#fd5,#5f8,#5cf,#c6f)' : `linear-gradient(90deg,transparent,var(--c3))`;
    d.style.height = k === 'ribbon' ? '16px' : k === 'spark' ? '4px' : '8px';
    if (k === 'spark') d.style.boxShadow = '14px -9px 0 -1px var(--c3), 40px 8px 0 -1px #fff, 62px -6px 0 -1px var(--c2)';
    return d;
  });
}
function renderAchv() {
  const el = $('#achv-body'), d = D(); el.innerHTML = ''; let got = 0;
  for (const a of ACH) {
    const has = !!d.ach[a.id]; if (has) got++;
    const r = document.createElement('div'); r.className = 'ach' + (has ? ' got' : '');
    r.innerHTML = `<div class="ic"><svg><use href="#${has ? 'i-trophy' : 'i-lock'}"/></svg></div><div><b>${a.name}</b><span>${a.desc}</span></div>`;
    el.appendChild(r);
  }
  $('#achv-count').textContent = `${got} / ${ACH.length}`;
}

// ---------------------------------------------------------------- actions
const ACTIONS = {
  play() { show('select'); renderList(); renderInfo(); if (!D().seenHelp) { D().seenHelp = true; Save.save(); ACTIONS.help(); } },
  import() { openOv('import'); },
  'pick-file'() { $('#file').click(); },
  custom() { renderCustom(); openOv('custom'); },
  help() { $('#hk1').textContent = keyLabel(D().settings.k1); $('#hk2').textContent = keyLabel(D().settings.k2); openOv('help'); },
  settings() { renderSettings(); openOv('settings'); },
  achv() { renderAchv(); openOv('achv'); },
  mods() { renderMods(); openOv('mods'); },
  'mods-clear'() { D().mods = []; Save.save(); renderMods(); renderInfo(); },
  close() { closeOv(); },
  back() { show('menu'); refreshPlayer(); },
  start() { startGame(); },
  resume() { resumeGame(); },
  retry() { retry(false); },
  quit() { quitToSelect(false); },
  revive() { revive(); },
  'fail-retry'() { retry(true); },
  'fail-quit'() { failToResults(); },
  'res-retry'() { const t = S.sel; if (!t) return; S.previewToken++; AudioSys.stopMusic(0.2); S.musicFor = null; SDK.requestAd('midgame').then(() => getBuffer(t)).then((buf) => { AudioSys.setLowpass(22000, 0.1); beginRun(t, buf); }); },
  'res-continue'() { quitToSelect(true); },
};

// ------------------------------------------------------------------- input
function evTime(e) { const n = performance.now(), t = e.timeStamp; return t > 0 && Math.abs(t - n) < 500 ? t : n; }
function bindInput() {
  const cv = $('#game');
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act; if (!ACTIONS[act]) return;
    AudioSys.unlock(); if (act !== 'start' && act !== 'close' && act !== 'back') sfx('click'); else if (act !== 'start') sfx('back');
    ACTIONS[act]();
  });
  document.addEventListener('mouseover', (e) => { const b = e.target.closest('.mbtn, .btn, .icon-btn, .diff, .mod, .tile'); if (b && !b.contains(e.relatedTarget)) sfx('hover'); });
  $('#scr-title').addEventListener('click', async () => {
    await AudioSys.unlock(); applySettings(); sfx('start'); show('menu'); refreshPlayer();
    if (S.sel) preview(S.sel);
  });
  $('#btn-pause').addEventListener('click', () => pauseGame());
  $('#btn-skip').addEventListener('click', () => { if (S.play) S.play.skip(); });
  $('#file').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
  // overlays close when their backdrop is clicked (except blocking ones)
  $$('.overlay').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov && !['pause', 'fail', 'loading'].includes(ov.id.slice(3))) { sfx('back'); closeOv(ov.id.slice(3)); } }));

  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !S.touch) { S.touch = true; }
    const p = S.play;
    if (S.state === 'play' && p) {
      e.preventDefault();
      if (p.canSkip() && e.pointerType === 'touch') { /* skip button handles it */ }
      if (e.pointerType === 'touch' || e.pointerType === 'pen') { p.touch = e.pointerType === 'touch' ? true : p.touch; p.press(e.pointerId, evTime(e), e.clientX, e.clientY); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      else if (D().settings.mouseBtns && (e.button === 0 || e.button === 2)) { p.move('mouse', e.clientX, e.clientY); p.press('mouse', evTime(e), e.clientX, e.clientY); }
    } else R.menuBurst(e.clientX, e.clientY);
  });
  const up = (e) => {
    const p = S.play; if (!p) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') p.release(e.pointerId);
    else if (D().settings.mouseBtns && (e.button === 0 || e.button === 2)) p.release('mouse');
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { if (S.play) S.play.move(e.pointerId, e.clientX, e.clientY); return; }
    R.setCursor(e.clientX, e.clientY);
    if (S.play && !S.play.auto) S.play.move('mouse', e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (S.rebinding) {
      e.preventDefault();
      if (e.code !== 'Escape') { const other = S.rebinding === 'k1' ? 'k2' : 'k1'; if (D().settings[other] !== e.code && e.code !== 'Space') D().settings[S.rebinding] = e.code; Save.save(); }
      S.rebinding = null; renderSettings(); return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && e.target.tagName !== 'INPUT') e.preventDefault();
    if (e.repeat) return;
    const s = D().settings, p = S.play;
    if (e.code === 'Escape') {
      const ov = topOv();
      if (ov === 'pause') resumeGame();
      else if (ov && ov !== 'fail' && ov !== 'loading') { sfx('back'); closeOv(); }
      else if (!ov && S.state === 'play') pauseGame();
      else if (!ov && S.state === 'select') { sfx('back'); ACTIONS.back(); }
      else if (!ov && S.state === 'results') ACTIONS['res-continue']();
      return;
    }
    if (S.state === 'play' && p && !topOv()) {
      if (e.code === s.k1 || e.code === s.k2) p.press('mouse', evTime(e));
      else if (e.code === 'Space') p.skip();
    } else if (S.state === 'select' && !topOv() && (e.code === 'Enter' || e.code === 'NumpadEnter')) startGame();
    else if (S.state === 'select' && !topOv() && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
      const order = S.tracks.filter((t) => !t.builtin).concat(S.tracks.filter((t) => t.builtin)), i = order.findIndex((t) => S.sel && t.id === S.sel.id);
      const n = order[clamp(i + (e.code === 'ArrowDown' ? 1 : -1), 0, order.length - 1)];
      if (n && n !== S.sel) { sfx('click'); select(n); const el = $(`#song-list .song[data-id="${n.id}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    } else if (S.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) $('#scr-title').click();
  });
  window.addEventListener('keyup', (e) => { const s = D().settings, p = S.play; if (p && (e.code === s.k1 || e.code === s.k2)) p.release('mouse'); });
  window.addEventListener('blur', () => pauseGame());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); Save.flush(); } });
  window.addEventListener('pagehide', () => Save.flush());
  window.addEventListener('resize', onResize); window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  // drag & drop import
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { if (S.state === 'play') return; e.preventDefault(); dragN++; $('#drop-hint').classList.add('on'); });
  window.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('#drop-hint').classList.remove('on'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; $('#drop-hint').classList.remove('on'); if (S.state !== 'play' && S.state !== 'boot' && e.dataTransfer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });
}
function onResize() {
  R.resize(); bg.resize();
  if (S.play) S.play.layout(window.innerWidth, window.innerHeight);
  else if (S.state === 'select') renderInfo();
}
function emblemRect() {
  const id = S.state === 'title' ? '#title-emblem' : S.state === 'menu' ? '#menu-emblem' : null; if (!id) return null;
  const r = $(id).getBoundingClientRect(); if (r.width < 4) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.36 };
}

// -------------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  AudioSys.tick(); AudioSys.analyse();
  const p = S.play;
  if (p && S.state === 'play') {
    p.update(now);
    if (S.play === p) { R.drawPlay(p, now); $('#btn-skip').classList.toggle('on', p.canSkip()); }
    bg.draw(now, { bass: AudioSys.bass, beat: p.state === 'playing' ? R.beat : 0 });
  } else {
    $('#btn-skip').classList.remove('on');
    const playing = AudioSys.music && S.sel && S.musicFor === S.sel.id;
    R.drawMenu(now, emblemRect(), playing ? beatPhase(S.sel, AudioSys.musicTime(now)) : 1);
    bg.draw(now, { bass: AudioSys.bass, beat: playing ? R.beat : 0 });
  }
}

// -------------------------------------------------------------------- boot
async function boot() {
  const prog = (v, txt) => { $('#boot-fill').style.width = v + '%'; if (txt) $('#boot-text').textContent = txt; };
  bg = new Background($('#bg')); R = new Renderer($('#game'), bg);
  bg.resize(); R.resize();
  requestAnimationFrame(frame);
  prog(10, 'CONNECTING');
  await SDK.init();
  SDK.loadingStart();
  SDK.onAd((on) => AudioSys.adMute(on));
  SDK.onMute((m) => AudioSys.setMuted(m));
  prog(35, 'LOADING PROFILE');
  Save.load();
  S.diff = DIFFS[D().lastDiff] ? D().lastDiff : 'normal';
  D().mods = D().mods.filter((m) => MODS[m]);
  for (const g of ['skin', 'pal', 'trail']) { const tbl = { skin: SKINS, pal: PALS, trail: TRAILS }[g]; if (!tbl[D().equip[g]]) D().equip[g] = Object.keys(tbl)[0]; }
  R.setQuality(D().settings.quality); bg.setQuality(D().settings.quality); R.setStyle(D().equip);
  R.cursorSize = D().settings.cursorSize; R.showErr = D().settings.errBar; R.showFps = D().settings.fps; R.allowShake = D().settings.shake;
  prog(55, 'LOADING FONTS');
  try { await Promise.race([Promise.all([document.fonts.load('900 20px Orbitron'), document.fonts.load('700 20px Orbitron'), document.fonts.load('700 20px Rajdhani'), document.fonts.load('600 20px Rajdhani')]), sleep(2500)]); } catch (e) { /* system fonts */ }
  prog(75, 'TUNING INSTRUMENTS');
  S.tracks = SONGS.map(builtinTrack);
  try { const recs = await Promise.race([Library.all(), sleep(2000).then(() => [])]); recs.sort((a, b) => b.added - a.added); for (const r of recs) if (r && r.analysis && r.blob) S.tracks.unshift(userTrack(r)); } catch (e) { /* no library */ }
  const first = S.tracks.find((t) => t.id === D().lastSong) || S.tracks.find((t) => t.builtin);
  S.sel = first; applyTheme(first);
  getBuffer(first).catch(() => {}); // start synthesising the menu track right away
  SDK.username().then((n) => { if (n) $('#pl-name').textContent = n.toUpperCase(); });
  bindInput();
  refreshPlayer();
  prog(100, 'READY');
  await sleep(350);
  if (S.touch) $('#press-start').textContent = 'TAP TO START';
  show('title');
  SDK.loadingStop();
  if (SDK.muted) AudioSys._muted = true;
}
boot();

// small debugging surface for automated tests
window.__SP = { S, get R() { return R; }, get bg() { return bg; }, AudioSys, Save, SDK, startGame, select };
