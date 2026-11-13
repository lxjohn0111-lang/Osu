// CrazyGames SDK v3 wrapper. Every call is guarded so the game also runs standalone
// (local file server, other hosts, SDK blocked) with graceful fallbacks.
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function loadScript(url, timeout = 5000) {
  return new Promise((resolve) => {
    if (window.CrazyGames && window.CrazyGames.SDK) return resolve(true);
    const s = document.createElement('script');
    let done = false;
    const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
    s.src = url; s.async = true;
    s.onload = () => fin(true); s.onerror = () => fin(false);
    setTimeout(() => fin(false), timeout);
    document.head.appendChild(s);
  });
}

export const SDK = {
  sdk: null, active: false, env: 'disabled', muted: false, adPlaying: false,
  _gameplay: false, _loading: false, _muteCbs: [], _adCbs: [],

  async init() {
    try {
      await loadScript(SDK_URL);
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (!cg) return;
      await cg.init();
      this.sdk = cg;
      this.env = cg.environment || 'disabled';
      this.active = this.env !== 'disabled';
      if (this.active) {
        try {
          this.muted = !!(cg.game.settings && cg.game.settings.muteAudio);
          cg.game.addSettingsChangeListener((s) => {
            this.muted = !!(s && s.muteAudio);
            this._muteCbs.forEach((f) => f(this.muted));
          });
        } catch (e) { /* settings API optional */ }
      }
    } catch (e) { console.warn('[SDK] unavailable:', e && e.message ? e.message : e); }
  },
  _call(fn) { if (!this.active) return undefined; try { return fn(this.sdk); } catch (e) { console.warn('[SDK]', e); return undefined; } },

  onMute(cb) { this._muteCbs.push(cb); },
  onAd(cb) { this._adCbs.push(cb); },

  loadingStart() { if (this._loading) return; this._loading = true; this._call((s) => s.game.loadingStart()); },
  loadingStop() { if (!this._loading) return; this._loading = false; this._call((s) => s.game.loadingStop()); },
  gameplayStart() { if (this._gameplay) return; this._gameplay = true; this._call((s) => s.game.gameplayStart()); },
  gameplayStop() { if (!this._gameplay) return; this._gameplay = false; this._call((s) => s.game.gameplayStop()); },
  happytime() { this._call((s) => s.game.happytime()); },

  /** @param type 'midgame' | 'rewarded'. Resolves true when the ad completed (reward earned). */
  requestAd(type) {
    return new Promise((resolve) => {
      // Outside CrazyGames there are no ads: rewards are granted so the game stays fully playable.
      if (!this.active) return resolve(type === 'rewarded');
      let done = false;
      const fin = (ok) => {
        if (done) return; done = true;
        if (this.adPlaying) { this.adPlaying = false; this._adCbs.forEach((f) => f(false)); }
        resolve(ok);
      };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { this.adPlaying = true; this._adCbs.forEach((f) => f(true)); },
          adFinished: () => fin(true),
          adError: () => fin(false),
        });
      } catch (e) { fin(false); }
    });
  },

  getItem(k) {
    if (this.active) { try { const v = this.sdk.data.getItem(k); if (v !== undefined) return v; } catch (e) { /* fall through */ } }
    try { return localStorage.getItem(k); } catch (e) { return null; }
  },
  setItem(k, v) {
    if (this.active) { try { this.sdk.data.setItem(k, v); return; } catch (e) { /* fall through */ } }
    try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ }
  },
  async username() {
    if (!this.active) return null;
    try { const u = await this.sdk.user.getUser(); return u && u.username ? u.username : null; } catch (e) { return null; }
  },
};
