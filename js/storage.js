// Save data (through the CrazyGames data module when available, else localStorage) and the
// on-device music library (IndexedDB; imported audio never leaves the player's browser).
import { SDK } from './sdk.js';

const KEY = 'starpulse_save_v1';
const DEFAULTS = () => ({
  v: 1,
  settings: {
    master: 0.8, music: 0.85, sfx: 0.7, dim: 0.6, offset: 0, quality: 'high',
    k1: 'KeyZ', k2: 'KeyX', mouseBtns: true, cursorSize: 1, errBar: true, melodic: true, fps: false, shake: true,
  },
  xp: 0, plays: 0,
  scores: {},           // "trackId|diff" -> [{score, acc, combo, rank, mods, date}]
  ach: {},              // id -> timestamp
  unlocked: { skin: ['orb'], pal: ['track'], trail: ['comet'] },
  equip: { skin: 'orb', pal: 'track', trail: 'comet' },
  mods: [], lastSong: null, lastDiff: 'normal', seenHelp: false,
  stats: { hits: 0, perfects: 0, maxCombo: 0, cleared: {}, imported: 0, fcs: 0 },
});

function merge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

// Keep the save well under the data module's size limit. If it ever grows past this, older
// score history is trimmed first (best score per chart is always kept).
const MAX_CHARS = 512 * 1024;

export const Save = {
  data: DEFAULTS(), _timer: null, _dirty: false, lastSize: 0,
  load() {
    let raw = null;
    try { raw = SDK.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try { this.data = merge(DEFAULTS(), typeof raw === 'string' ? JSON.parse(raw) : raw); }
      catch (e) { console.warn('[save] unreadable save, starting fresh', e); this.data = DEFAULTS(); }
    } else this.data = DEFAULTS();
    return this.data;
  },
  /** Queue a write; bursts of changes (slider drags) collapse into one. */
  save() {
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 400);
  },
  /** Write now: after a run, and when the page is being hidden or closed. */
  flush() {
    clearTimeout(this._timer); this._timer = null;
    if (!this._dirty) return true;
    let json = JSON.stringify(this.data);
    if (json.length > MAX_CHARS) { this._compact(); json = JSON.stringify(this.data); }
    this.lastSize = json.length;
    const ok = SDK.setItem(KEY, json);
    if (ok) this._dirty = false;
    return ok;
  },
  _compact() {
    const sc = this.data.scores;
    for (const k of Object.keys(sc)) if (sc[k].length > 1) sc[k].length = 1;
    // still too big: drop the oldest charts entirely
    const keys = Object.keys(sc).sort((a, b) => (sc[a][0] ? sc[a][0].date : 0) - (sc[b][0] ? sc[b][0].date : 0));
    while (keys.length && JSON.stringify(this.data).length > MAX_CHARS) delete sc[keys.shift()];
  },
  where() { return SDK.cloud ? 'CrazyGames' : 'browser'; },
  bestOf(trackId, diff) { const l = this.data.scores[trackId + '|' + diff]; return l && l.length ? l[0] : null; },
  addScore(trackId, diff, entry) {
    const k = trackId + '|' + diff, l = this.data.scores[k] || (this.data.scores[k] = []);
    const prevBest = l.length ? l[0].score : 0;
    l.push(entry); l.sort((a, b) => b.score - a.score); l.length = Math.min(l.length, 5);
    this.save();
    return entry.score > prevBest;
  },
};

// XP curve
export const xpForLevel = (lvl) => Math.round(400 * Math.pow(lvl, 1.55));
export function levelInfo(xp) {
  let lvl = 1; while (xp >= xpForLevel(lvl)) lvl++;
  const lo = lvl > 1 ? xpForLevel(lvl - 1) : 0, hi = xpForLevel(lvl);
  return { level: lvl, cur: xp - lo, need: hi - lo, frac: (xp - lo) / (hi - lo) };
}

// ---------------------------------------------------------------- music library
const DB = 'starpulse', STORE = 'tracks';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id' });
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE), rq = fn(st);
    t.oncomplete = () => resolve(rq ? rq.result : undefined);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  }));
}
export const Library = {
  mem: new Map(), // session fallback when IndexedDB is unavailable
  async all() {
    try { const r = await tx('readonly', (s) => s.getAll()); return r || []; } catch (e) { return Array.from(this.mem.values()); }
  },
  async put(rec) {
    this.mem.set(rec.id, rec);
    try { await tx('readwrite', (s) => s.put(rec)); return true; } catch (e) { return false; }
  },
  async del(id) {
    this.mem.delete(id);
    try { await tx('readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ }
  },
};
