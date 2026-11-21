# Cover Snap Studio — Make GTA 6 Cover Art

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/xiangbingxi/makefun-gta6-cover-art-04/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/xiangbingxi/makefun-gta6-cover-art-04/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns your photo and a caption into GTA-style
cover art: multi-panel posters with a Vice City sunset or neon grade,
bold outlined lettering, pill labels, a round stamp and a footer strip —
exported as a PNG to share.

## How it works

1. Open the app (`node serve.ts`, then http://localhost:8080) and load a
   photo — from your machine or one of the built-in samples. Photos stay
   on your machine; nothing is ever uploaded.
2. Write the title and subtitle, pick a layout (Grid, Hero, Four up,
   Full bleed) and a grade (Sunset, Neon Nights, Golden Hour, Vice Noir,
   Turquoise Bay).
3. Frame each photo with the focus and zoom sliders; the preview repaints
   live.
4. Export one size or all four: 1080×1080, 1080×1350, 1280×720, 1920×1080.

The covers are painted on canvas: seeded sunset scenes (striped sun,
skyline, palms, birds), halftone and grain, a colour wash that unifies
each photo with the grade. The same caption always paints the same
scene, so an export is reproducible.

## Screenshots

- `1-cover.jpg` — SUNSET HEIST, grid layout, sunset grade, 1080×1080.
- `2-editor.jpg` — the editor with both photos loaded, four-up, neon.
- `3-cover.jpg` — BOULEVARD QUEEN, hero layout, gold grade, 1080×1350.

Retake them with `node dev/shots.mjs`; check the exports with
`node dev/verify-export.mjs`.

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library. It refuses to
hand in a dossier over 1.5 MiB or a screenshot over 256 KiB.

No network, no build step, no Rockstar artwork, logos or fonts. The two
sample photos under `app/samples/` were made with an image model for
make.fun and are free to use.

---

Made for the [Make GTA 6 Cover Art bounty](https://make.fun/bounty/gta6-cover-art-01) on [make.fun](https://make.fun).
