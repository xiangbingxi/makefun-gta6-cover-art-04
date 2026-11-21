// Cover Snap Studio — screenshot scenes.
//
// shots.json names three shots; each one is a URL the screenshot driver
// (dev/shots.mjs) opens. This module reads the query, sets the editor
// state for the shot, paints the cover on a full-size canvas and raises
// window.__shotReady when the pixels are done, so the driver never
// screenshots a half-painted frame.
//
//   ?shot=cover&photo=pier&caption=Sunset%20Heist
//       A bare exported cover, edge to edge, at the shot size.
//   ?shot=editor&photo=boulevard&caption=Boulevard%20Queen
//       The editor page with a photo loaded, at the shot size.
//   ?shot=cover&photo=boulevard&caption=Boulevard%20Queen&layout=hero&grade=gold
//       A second cover, hero layout, gold grade.
//
// The query carries layout, grade and size too, so a shot is fully
// described by its URL and nothing else. Photos come from the built-in
// samples unless the shot names an upload, which a screenshot never does.

import {
  GRADE_KEYS,
  LAYOUT_KEYS,
  EXPORT_SIZES,
  paintCover,
  hashSeed,
} from './paint.js';

'use strict';

const SAMPLE_SRC = {
  pier: 'samples/pier.jpg',
  boulevard: 'samples/boulevard.jpg',
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('shot image failed: ' + src));
    img.src = src;
  });
}

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot') || 'cover';
  const photo = q.get('photo') || 'pier';
  const caption = q.get('caption') || 'Sunset Heist';
  const subtitle = q.get('subtitle') || 'LEONIDA \u2022 VICE CITY';
  const layout = LAYOUT_KEYS.includes(q.get('layout')) ? q.get('layout') : 'grid';
  const grade = GRADE_KEYS.includes(q.get('grade')) ? q.get('grade') : 'sunset';
  const second = q.get('photo2') || 'boulevard';
  return { shot, photo, caption, subtitle, layout, grade, second };
}

// Paint a bare cover into the #shot canvas, sized to the viewport.
async function paintShotCover(params) {
  const canvas = document.getElementById('shot');
  if (!canvas) throw new Error('no #shot canvas on the page');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.classList.add('shot-mode');
  const photoA = await loadImage(SAMPLE_SRC[params.photo] || SAMPLE_SRC.pier);
  let photoB = null;
  try {
    photoB = await loadImage(SAMPLE_SRC[params.second] || SAMPLE_SRC.boulevard);
  } catch (err) {
    photoB = null;
  }
  paintCover(canvas, {
    photoA,
    photoB,
    title: params.caption,
    subtitle: params.subtitle,
    grade: params.grade,
    layout: params.layout,
    seed: hashSeed(params.caption),
  });
}

// Paint the editor in its shot state: both samples loaded, the caption
// set, the layout and grade from the query. The editor's own boot loads
// the samples; this only steers it, then waits for the preview paint.
async function paintShotEditor(params) {
  document.body.classList.add('shot-mode', 'shot-editor');
  const mod = await import('./main.js');
  const state = mod.editorState;
  state.title = params.caption;
  state.subtitle = params.subtitle;
  state.layout = params.layout;
  state.grade = params.grade;
  state.seed = hashSeed(params.caption);
  const titleInput = document.getElementById('titleInput');
  if (titleInput) titleInput.value = params.caption;
  const subtitleInput = document.getElementById('subtitleInput');
  if (subtitleInput) subtitleInput.value = params.subtitle;
  // The editor boot already loads both samples; wait for them, then
  // repaint once with the shot state.
  for (let i = 0; i < 60 && !(state.photoA && state.photoB); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  mod.editorRepaint();
}

// The three shots, by name, for the driver and the docs.
export const SHOT_SCENES = [
  {
    name: '1-cover.jpg',
    query: '?shot=cover&photo=pier&caption=Sunset%20Heist&layout=grid&grade=sunset',
    w: 1080,
    h: 1080,
    note: 'SUNSET HEIST, grid, sunset, 1080x1080 — the cover.',
  },
  {
    name: '2-editor.jpg',
    query: '?shot=editor&photo=boulevard&caption=Boulevard%20Queen&layout=four&grade=neon',
    w: 1280,
    h: 720,
    note: 'Editor with both photos loaded, four-up, neon, 1280x720.',
  },
  {
    name: '3-cover.jpg',
    query: '?shot=cover&photo=boulevard&caption=Boulevard%20Queen&layout=hero&grade=gold',
    w: 1080,
    h: 1350,
    note: 'BOULEVARD QUEEN, hero, gold, 1080x1350 — the second cover.',
  },
];

export function shotManifest() {
  return SHOT_SCENES.map((s) => ({ name: s.name, query: s.query, w: s.w, h: s.h }));
}

async function runShot() {
  const params = readQuery();
  try {
    if (params.shot === 'editor') {
      await paintShotEditor(params);
    } else {
      await paintShotCover(params);
    }
  } catch (err) {
    console.error('[shots] shot failed', err);
    document.title = 'SHOT FAILED: ' + err.message;
  } finally {
    // The driver waits for this flag; set it even on failure so the
    // run ends instead of hanging, and the failure is visible in the
    // screenshot itself.
    window.__shotReady = true;
  }
}

// Only run when the page carries a ?shot= query; a plain visit is the
// editor, and main.js boots it.
if (new URLSearchParams(window.location.search).has('shot')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runShot);
  } else {
    runShot();
  }
}

// Export sizes the checker uses, re-exported for one import site.
export const shotExportSizes = EXPORT_SIZES;
