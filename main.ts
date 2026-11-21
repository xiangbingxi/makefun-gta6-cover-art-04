// Cover Snap Studio — the entry program (Node 22, standard library only).
//
// Hands the app in: it copies app/ and screenshots/ from beside this
// file to /output and writes /output/dossier.json with buildDossier from
// the vendored make.fun library. Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program runs twice and both runs must write the same bytes: the
// copy is a plain recursive copy and buildDossier is deterministic, so
// nothing here depends on time, randomness or the environment.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The gate refuses a dossier over 1.5 MiB, so check the bytes we just
// wrote and fail loudly instead of handing in an entry the scorer
// would refuse. The check runs after the write, so the file on disk is
// always the one buildDossier produced.
const DOSSIER_MAX_BYTES = 1572864;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail early, before the dossier is built, when a screenshot is
// missing or over the gate's 256 KiB cap: a bad screenshot would make
// the whole entry invalid, and it is cheaper to say so here.
const SHOT_MAX_BYTES = 262144;
const shotsDir = join(here, 'screenshots');
if (existsSync(shotsDir)) {
  for (const name of readdirSync(shotsDir).sort()) {
    if (name.startsWith('.')) continue;
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > SHOT_MAX_BYTES) {
      throw new Error(`screenshot ${name} is ${bytes} bytes, over the 256 KiB cap.`);
    }
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

const dossierBytes = statSync(dossierPath).size;
if (dossierBytes > DOSSIER_MAX_BYTES) {
  throw new Error(
    `dossier.json is ${dossierBytes} bytes, over the 1.5 MiB (${DOSSIER_MAX_BYTES}) cap — ` +
      'trim the app source or the screenshots and run again.',
  );
}

// A one-line summary so a local run shows what was handed in. The
// line goes to stdout only; nothing about the run is written into
// /output, so the two grader runs stay byte-identical.
console.log(`Cover Snap Studio: dossier.json ${dossierBytes} bytes written to ${out}.`);
