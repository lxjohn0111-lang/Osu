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

export const Save = {
  data: DEFAULTS(), _timer: null,
  load() {
    try { const raw = SDK.getItem(KEY); if (raw) this.data = merge(DEFAULTS(), JSON.parse(raw)); } catch (e) { this.data = DEFAULTS(); }
    return this.data;
  },
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { try { SDK.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }, 250);
  },
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
