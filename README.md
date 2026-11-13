# STARPULSE — Play Your Music

A neon rhythm game for the browser, built for **CrazyGames** with the CrazyGames HTML5 SDK v3.
Tap circles on the beat, follow slide trails, and spin reactors. You can play the original
soundtrack, or drop in **your own songs** and get a playable beatmap in seconds.

The whole game is a **136 KB zip**: there are no audio files to download and no build step.

## The music problem, solved

Shipping famous songs on a web portal isn't legal without licences. A Spotify integration
doesn't help either: Spotify's terms forbid using its audio in games, and its SDK only plays
for logged-in Premium users. NCS tracks need attribution per track and can still be
copyright-claimed. STARPULSE gets around all of this two ways:

1. **Original soundtrack, synthesised live.** Six full-length tracks, from 1:33 to 2:04:
   synthwave, future house, chiptune, chillwave, uplifting trance and drum & bass.
   They are composed as note data in `js/songs.js` and rendered to audio in the player's
   browser (`js/synth.js`). Because the beatmaps are generated from the *same notes* as the
   music, every hit lands exactly on a real musical event. Melodic hit sounds even play the
   tune as you hit. All of it is original, so there is nothing to license.
2. **Your Music.** Players pick or drag-and-drop any audio file they own (MP3, OGG, WAV,
   FLAC, M4A). `js/analyzer.js` finds the tempo, beat grid, downbeats, note onsets and
   high-energy "drop" sections, and `js/mapgen.js` builds four difficulties from them.
   Everything runs **on the device**: files are never uploaded, so the game never hosts or
   distributes anyone's copyrighted audio. Imported songs are kept locally in IndexedDB.

Accuracy, measured against the synthesised tracks: tempo is detected exactly (128/128 and
88/88 BPM), and the beat grid is within about 2 ms. For a 174 BPM drum & bass track it
detects 87–88 BPM (half-time), and the grid still lines up because notes fall on 16th notes.

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
| `data.getItem` / `setItem` | Save data (falls back to `localStorage` outside CrazyGames) |
| `user.getUser()` | Shows the player's CrazyGames username |

While an ad is showing, the audio context is suspended. Outside CrazyGames the SDK reports
`disabled`: the game then runs standalone, and rewarded features are granted for free.

## Running locally

```bash
node tools/serve.mjs 8080      # then open http://localhost:8080
python3 tools/build.py         # -> dist/starpulse.zip, ready to upload to CrazyGames
```

`tools/dev/*.html` are test pages for the synth, the chart generator and the analyser.

## Layout

```
index.html          screens, overlays and icons
css/style.css       UI styling (glass panels, responsive rules)
js/main.js          controller: boot, menus, library, run lifecycle, progression
js/game.js          gameplay: timing, judgement, score, energy, input, autoplay
js/render.js        canvas renderer: notes, effects, particles, HUD, menu visualiser
js/background.js    WebGL shader backgrounds
js/audio.js         Web Audio transport, latency-compensated clock, synthesised SFX
js/synth.js         offline music synthesiser and chart source for the soundtrack
js/songs.js         the six original compositions
js/analyzer.js      beat and onset analysis for imported songs
js/mapgen.js        beatmap generator
js/sdk.js           CrazyGames SDK wrapper
js/storage.js       save data and IndexedDB music library
fonts/              Orbitron and Rajdhani (SIL Open Font License)
```
