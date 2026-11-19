# STARPULSE – CrazyGames feltöltési csomag

## Mit hova töltsél fel

| Fájl / mappa | Mire való |
|---|---|
| `starpulse.zip` | **Ezt töltsd fel játékfájlként** a CrazyGames Developer Portalon. Az `index.html` a zip gyökerében van. |
| `game/` | Ugyanez kicsomagolva, ha mappát kér a feltöltő, vagy helyben akarod kipróbálni. A `music/` mappában vannak a zenék és az előre generált pályák. |
| `covers/cover-landscape-1920x1080.png` | Fekvő borítókép (16:9) |
| `covers/cover-portrait-800x1200.png` | Álló borítókép |
| `covers/cover-square-800x800.png` | Négyzetes borítókép |

A borítóképek méreteit vesd össze a portál űrlapjával: a fekvő 1920×1080 méretet a CrazyGames
dokumentációja megerősíti, az álló és a négyzetes méretet nem tudtam ellenőrizni.

A portál egy 15–20 másodperces előnézeti videót is kér. Ezt a játékból vett képernyőfelvétellel
tudod elkészíteni (például Autoplay mod mellett, egy FEVER szakasz alatt).

## Zene

A játékban 9 valódi, felvett szám szól Kevin MacLeodtól (incompetech.com), **CC BY 4.0**
licenccel. Ez megengedi a reklámos, kereskedelmi használatot, ha az előadót feltüntetjük; ezt a
játék „MUSIC & CREDITS” képernyője megteszi. A fájlok az eredeti incompetech MP3-ak (SHA-256
ellenőrizve), webre 128 kbps-re újrakódolva. A zenék csak akkor töltődnek le, amikor a játékos
kiválasztja őket, így a játék gyorsan indul.

Toplistás slágereket (pl. Justin Bieber) a kiadók engedélye nélkül nem lehet a játékba tenni,
és az NCS zenék is külön szerződést igényelnek játékban. A játékosok a saját zenéiket a
„Your Music” gombbal tölthetik be: ezek a gépükön maradnak.

## A játék és a CrazyGames SDK

- Az SDK-t az `index.html` `<head>` részében lévő script tag tölti be:
  `https://sdk.crazygames.com/crazygames-sdk-v3.js`.
- **Mentés:** a játékos szintje, XP-je, pontszámai, achievementjei, feloldott kinézetei és
  beállításai a **CrazyGames SDK data moduljával** mentődnek (`SDK.data.getItem` / `setItem`,
  kulcs: `starpulse_save_v1`). CrazyGamesen nincs mellette helyi mentés, ahogy a dokumentáció
  ajánlja. A mentés minden futás után és reklámos feloldás után azonnal megtörténik, valamint
  akkor is, amikor a játékos elhagyja vagy bezárja a fület. A beállítás-csúszkák változásai
  0,4 másodperc után kerülnek mentésre.
- A saját zenék (Your Music) hangfájljai túl nagyok a data modulhoz, ezért a játékos böngészőjében
  maradnak (IndexedDB). A pontszámaik viszont a data modulba kerülnek: ha valaki újra betölti
  ugyanazt a fájlt, visszakapja a rekordjait.
- Reklámok: midgame csak két futás között; rewarded a Revive gombnál és a kinézetek korai
  feloldásánál. Reklám alatt a játék hangja teljesen el van némítva.

## Újragenerálás a forrásból

A repó gyökerében:

```bash
python3 tools/build.py              # game/ mappa és starpulse.zip
node tools/serve.mjs 8080           # helyi szerver (másik terminálban hagyd futni)
node tools/covers.cjs               # borítóképek újrarenderelése a játékból
```

Ne a `game/` mappában szerkessz: azt a build minden futáskor felülírja. A forrás a repó
gyökerében lévő `index.html`, `css/`, `js/` és `fonts/`.
