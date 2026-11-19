# STARPULSE — Play Your Music

A neon rhythm game for the browser, built for **CrazyGames** with the CrazyGames HTML5 SDK v3.
Tap circles on the beat, follow slide trails, and spin reactors. Play nine real recorded
tracks by Kevin MacLeod, or drop in **your own songs** and get a playable beatmap in seconds.

The game code is about 140 KB. The nine featured songs (27 MB in total) are only
downloaded when a player picks them, so the game starts fast.

## Music

Chart hits by major artists (Justin Bieber, Taylor Swift and so on) can't be shipped in a web
game without a licence from their labels. NoCopyrightSounds (NCS) is free for videos and
streams, but its usage policy treats use in a video game as commercial use that needs a
separate contract. Spotify's terms forbid using its audio in games. STARPULSE therefore has
two sources of music:

1. **Featured tracks: real recordings, CC BY 4.0.** Nine tracks by
   [Kevin MacLeod (incompetech.com)](https://incompetech.com), whose catalogue is licensed
   under Creative Commons Attribution 4.0. That allows commercial, ad-supported use as long
   as the artist is credited, which the in-game **Music & Credits** screen does:

   | Track | BPM | Length |
   |---|---|---|
   | Local Forecast - Elevator | 82 | 3:09 |
   | Carefree | 96 | 3:25 |
   | Bit Quest | 100 | 3:12 |
   | Getting it Done | 135 | 3:30 |
   | 8bit Dungeon Boss | 134 | 2:52 |
   | Meatball Parade | 150 | 3:25 |
   | Cipher | 150 | 3:51 |
   | Quirky Dog | 155 | 2:29 |
   | Volatile Reaction | 155 | 2:45 |

   Each file is the official incompetech MP3. Its SHA-256 matched the incompetech record before
   it was re-encoded to 128 kbps for the web; that is the only change. The beatmaps are
   pre-generated from the audio with the composer's official BPM (`tools/make-charts.cjs` →
   `music/charts.json`). Between 80% and 100% of each track's strong notes fall within 30 ms
   of the beat grid.
2. **Your Music.** Players pick or drag-and-drop any audio file they own (MP3, OGG, WAV,
   FLAC, M4A). `js/analyzer.js` finds the tempo, beat grid, downbeats, note onsets and
   high-energy "drop" sections, and `js/mapgen.js` builds four difficulties from them.
   Everything runs **on the device**: files are never uploaded, so the game never hosts or
   distributes anyone's copyrighted audio. This is how a player can play the pop songs they
   own. Imported songs are kept locally in IndexedDB.

## Features

- **Three object types:** tap orbs with approach rings, slide trails with ticks and
  reverses, and spin reactors.
- **Four difficulties per track** (Easy / Normal / Hard / Insane), with star ratings, timing
  windows, approach speed and flow patterns (streams, zig-zags, polygons, jumps).
- **Scoring:** PERFECT / GREAT / OK / MISS judgements, accuracy, combo, an energy bar,
  ranks from S+ to D, and per-chart best scores.
- **FEVER sections** in every chorus or drop: screen pulse, side glows, rising particles
  and a stronger background.
- **Six audio-reactive WebGL backgrounds:** aurora, synthwave sun and grid, warp tunnel,
  Voronoi cells, ocean waves and pixel plasma. They cross-fade between tracks and ripple
  with your hits.
- **Seven mods:** Chill, Overdrive, Blackout, Mirror, Flawless, No Fail and Autoplay,
  each with a score multiplier.
- **Progression:** XP and levels, 14 achievements, and unlockable note skins, colour
  palettes and cursor trails.
- **Results screen:** animated rank reveal, an energy-over-time graph, a hit-timing
  histogram and **one-click audio offset calibration**.
- **Controls:** mouse plus remappable keys (Z/X by default), or full multi-touch. Pause,
  skip intro, a timing bar, quality presets, and volume and offset settings.
- **Responsive layout** for desktop and for phones in portrait or landscape.

## CrazyGames SDK integration (`js/sdk.js`)

| SDK call | Where it is used |
|---|---|
| `SDK.init()` | At boot, before anything else |
| `game.loadingStart()` / `loadingStop()` | Around the boot sequence |
| `game.gameplayStart()` / `gameplayStop()` | Run start and finish, pause and resume, fail, revive |
| `game.happytime()` | After a full combo, S rank or new personal best |
| `ad.requestAd('midgame')` | When leaving the results screen, and when retrying after a fail. Never during play |
| `ad.requestAd('rewarded')` | **Revive** after a fail (once per run), and unlocking a cosmetic before you reach its level |
| `game.settings.muteAudio` + listener | Respects the platform mute |
| `data.getItem` / `setItem` | **All progress** (level, XP, scores, achievements, unlocks, settings) under the key `starpulse_save_v1`. Written right after every run and ad unlock, and when the tab is hidden or closed. On CrazyGames there is no separate local copy, as the SDK docs recommend. Off-platform it falls back to `localStorage` |
| `user.getUser()` | Shows the player's CrazyGames username |

While an ad is showing, the audio context is suspended. Outside CrazyGames the SDK reports
`disabled`: the game then runs standalone, and rewarded features are granted for free.

## Running locally

```bash
node tools/serve.mjs 8080      # then open http://localhost:8080
python3 tools/build.py         # -> crazygames-upload/game/ and crazygames-upload/starpulse.zip
node tools/covers.cjs          # -> crazygames-upload/covers/ (needs the dev server running)
```

Everything needed for the CrazyGames submission is in `crazygames-upload/`; its README
(in Hungarian) says what to upload where.

```bash
node tools/make-charts.cjs     # re-generate music/charts.json after changing tracks or the analyser
```

## Layout

```
index.html          screens, overlays and icons
css/style.css       UI styling (glass panels, responsive rules)
js/main.js          controller: boot, menus, library, run lifecycle, progression
js/game.js          gameplay: timing, judgement, score, energy, input, autoplay
js/render.js        canvas renderer: notes, effects, particles, HUD, menu visualiser
js/background.js    WebGL shader backgrounds
js/audio.js         Web Audio transport, latency-compensated clock, synthesised SFX
js/tracks.js        featured track list with credits and licence
js/chartpack.js     compact storage format for pre-generated chart material
js/analyzer.js      beat and onset analysis (featured tracks offline, imported songs live)
js/mapgen.js        beatmap generator
js/sdk.js           CrazyGames SDK wrapper
js/storage.js       save data and IndexedDB music library
fonts/              Orbitron and Rajdhani (SIL Open Font License)
music/              featured tracks (MP3) and music/charts.json
```
