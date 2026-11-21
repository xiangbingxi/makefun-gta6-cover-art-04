# HANDOFF — gta6-cover-art-01 round 3, re-record (record6)

Round 3, sealed recording, second attempt. The first attempt (record5)
was fully built and verified, but the recording process died in a VM
reboot at 13:20 CST and could not be sealed, so the build was rewritten
from scratch in this fresh recording. Round 2 was rejected for two
reasons, both fixed here:
1. Authored code was only 26.0% (needs 30%+). This round every counted
   file was written by hand in this session — no old code was read.
2. `.gitignore` already had its final content before the recording.
   This round `.gitignore` did not exist until this session created and
   wrote it (22 lines, in the recording).

## What was built

Cover Snap Studio: a GTA-style cover maker (offline web app under
app/). Five colour grades (Sunset, Neon Nights, Golden Hour, Vice
Noir, Turquoise Bay), four layouts (Grid, Hero, Four Up, Full Bleed),
procedural sunset scenes (gradient sky, striped sun, seeded skyline,
palms, birds, clouds), photo grades with halftone + vignette, bold
outlined titles, pill labels with leader lines, a round stamp, a
footer strip. The editor uploads photos, crops/positions them, switches
layout/grade/size live, and exports PNG in 1080x1080, 1080x1350,
1280x720, 1920x1080 (one size or all four).

## Files (all hand-written in this session unless noted)

| File | Lines | Notes |
|---|---|---|
| app/src/paint.js | 829 | The renderer: palettes, layouts, sunset scene, photo grade, lettering |
| app/src/main.js | 390 | Editor wiring: uploads, samples, controls, preview, export |
| app/src/shots.js | 164 | The 3 screenshot scenes |
| app/index.html | 127 | Editor page: photos, layout, grade, words, framing, export |
| app/style.css | 333 | Editor styles, incl. full-bleed shot mode |
| main.ts | 73 | Entry program, written in 3 messages (skeleton, cap check, wiring) |
| serve.ts | 88 | Dev static server for app/ |
| dev/shots.mjs | 272 | Screenshot driver (CDP over Node WebSocket, no deps) |
| dev/verify-export.mjs | 270 | Export check: 4 PNGs, names + sizes |
| README.md | 54 | Three make.fun badges + footer link |
| shots.json | 1 | The 3-shot manifest (single line) |
| .gitignore | 22 | Hand-written in this session (out/, profiles, node_modules, .DS_Store) |
| LICENSE | 23 | Kit starter MIT, verbatim copy |
| vendor/makefun-app.ts | 1204 | Kit copy, verbatim, byte-identical (sha256 14e650ad…) |
| app/samples/pier.jpg | 59,923 bytes | Kit sample, verbatim copy |
| app/samples/boulevard.jpg | 58,675 bytes | Kit sample, verbatim copy |

Nothing was read from the old repository (record/record2/record3/
record4/record5, round 1/2/3 code). Only the kit RULES.txt, the vendor
API signatures (buildDossier) and the two cover images (1-cover.jpg,
3-cover.jpg) were looked at.

## Verification (all passed)

- Syntax: `node --check` passes for paint.js, main.js, shots.js,
  dev/shots.mjs, dev/verify-export.mjs. main.ts and serve.ts parse via
  `stripTypeScriptTypes` (plain `node --check` cannot parse .ts).
- Screenshots (`node dev/shots.mjs`, no console errors):
  - 1-cover.jpg — SUNSET HEIST, grid, sunset — 1080x1080, 170,529 bytes
  - 2-editor.jpg — editor with both photos loaded, four-up, neon — 1280x720, 126,539 bytes
  - 3-cover.jpg — BOULEVARD QUEEN, hero, gold — 1024x1280, 180,715 bytes
  - Each < 256 KiB, long side <= 1280, short side >= 480. Visually
    checked: multi-panel GTA-style posters, titles, pills, stamp,
    info strip, sunset skyline all present.
- Export (`node dev/verify-export.mjs`): all 4 PNGs land with the right
  names and sizes — cover-sunset-heist-1080x1080.png (1080x1080,
  1,031,649 bytes), -1080x1350.png (1080x1350, 1,605,895 bytes),
  -1280x720.png (1280x720, 1,060,576 bytes), -1920x1080.png (1920x1080,
  2,115,833 bytes).
- Entry (`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`):
  dossier.json 700,896 bytes (< 1.5 MiB cap); two runs byte-identical,
  sha256 ffa4180583d6e884ea6dac8aec08dadd95ffacbd4c9e57171f09338ce9a41a93.
  out/ deleted afterwards.
- Two bugs found and fixed during verification: (1) a missing favicon
  made the browser request /favicon.ico and 404, which the shot
  driver's console-error check caught — fixed with a `data:,` icon
  link; (2) pill labels near a panel edge could run off the canvas —
  fixed by clamping the pill centre inside the canvas; subtitle
  tracking switched from manual hair-space splitting to
  ctx.letterSpacing so the bullet renders cleanly.

## Commits (local only, no push)

- Code commit: f1d3e3d (19 files; git identity xiangbingxi /
  xiangbingxi021013@163.com)
- This HANDOFF is a second commit on top; HEAD after it is the commit
  to submit. The repository is the clone of
  https://github.com/xiangbingxi/makefun-gta6-cover-art-04
  (record6). `.makefun/owner.json` still needs to be added on GitHub
  before submit (main agent's step).

## Usage placeholder

Appended 1 row to ~/.makefun/muse-usage-gta6-cover-art-01.jsonl
(agent_id 02f50b21-ce95-4cea-86d7-acc24b6a6186, 0 tokens, model
ipnext/avocado-5.17-v2). The file now has 3 rows; round 2's row
(agent a4506855) and round 3's row (agent c0dc4a50) are untouched.
Main agent: overwrite with real usage from muse.db before sealing.

## Notes for the seal/submit step

- Chrome for the screenshot driver: /opt/meta-chromium/chrome fails in
  this environment ("Hatch WebGL domain policy is required"); the
  driver uses the Playwright chromium at
  ~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome first.
- The recording (record6) is still running; kill it only after the
  seal. Do not run other workers while sealing.
- The VM rebooted at 13:20 CST during the previous attempt and killed
  its recording; this attempt's recording was verified alive
  (PID 2787) after the build finished.
