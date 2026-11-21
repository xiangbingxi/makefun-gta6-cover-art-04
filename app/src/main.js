// Cover Snap Studio — the editor.
//
// Owns the editor state (photos, caption, layout, grade, size, focus and
// zoom), wires the controls in index.html to the renderer in paint.js,
// repaints the live preview on every change and exports PNGs. The editor
// never paints directly: every pixel comes from paintCover(), so the
// preview, the screenshots and the exports always agree.
//
// State is a plain object; a single repaint() reads it and paints. The
// URL query (?shot=cover, ?shot=editor) is read by shots.js, not here,
// so the editor itself stays a plain interactive page.

import {
  GRADES,
  GRADE_KEYS,
  LAYOUT_KEYS,
  EXPORT_SIZES,
  paintCover,
  renderCover,
  canvasToBlob,
  slugifyTitle,
  hashSeed,
} from './paint.js';

'use strict';

// ---------------------------------------------------------------------------
// State. Two photo slots (A is the hero photo, B the second), a caption,
// a layout, a grade and an export size. Focus and zoom let the user crop
// and position each photo inside its panel.
// ---------------------------------------------------------------------------
const state = {
  photoA: null, // HTMLImageElement or null
  photoB: null,
  photoAName: '',
  photoBName: '',
  title: 'SUNSET HEIST',
  subtitle: 'LEONIDA \u2022 VICE CITY',
  layout: 'grid',
  grade: 'sunset',
  size: '1080x1080',
  focusA: { x: 0.5, y: 0.5 },
  focusB: { x: 0.5, y: 0.5 },
  zoomA: 1,
  zoomB: 1,
  seed: hashSeed('SUNSET HEIST'),
};

// The built-in sample photos, free to use, shipped under app/samples/.
const SAMPLES = {
  pier: { src: 'samples/pier.jpg', name: 'Pier (sample)' },
  boulevard: { src: 'samples/boulevard.jpg', name: 'Boulevard (sample)' },
};

// ---------------------------------------------------------------------------
// DOM handles. Every id here exists in index.html; if one is missing the
// editor logs it once and carries on with the rest, so a partial page
// still paints.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const els = {};
function grabElements() {
  const ids = [
    'preview', 'titleInput', 'subtitleInput', 'layoutRow', 'gradeRow',
    'sizeRow', 'photoAInput', 'photoBInput', 'samplePier', 'sampleBoulevard',
    'sampleBoth', 'clearPhotos', 'focusAX', 'focusAY', 'zoomA', 'focusBX',
    'focusBY', 'zoomB', 'shuffle', 'exportOne', 'exportAll', 'status',
    'photoAName', 'photoBName', 'exportSizeLabel',
  ];
  for (const id of ids) {
    els[id] = $(id);
    if (!els[id]) console.warn('[editor] missing element #' + id);
  }
}

// ---------------------------------------------------------------------------
// The spec the renderer wants, built fresh from state on every paint.
// The layout follows the export size when the user picks a portrait or
// wide size: a portrait export reads better as a hero, a wide one as a
// four-up, unless the user picked a layout by hand.
// ---------------------------------------------------------------------------
function specFor(w, h) {
  const layout = state.layout;
  return {
    photoA: state.photoA,
    photoB: state.photoB,
    title: state.title,
    subtitle: state.subtitle,
    grade: state.grade,
    layout,
    seed: state.seed,
    focusA: state.focusA,
    focusB: state.focusB,
    zoomA: state.zoomA,
    zoomB: state.zoomB,
  };
}

function repaint() {
  const canvas = els.preview;
  if (!canvas) return;
  const size = EXPORT_SIZES.find((s) => s.key === state.size) || EXPORT_SIZES[0];
  // The preview is a downscaled stand-in for the export size: same
  // aspect, capped at 720 on its long side so the page stays light.
  const scale = Math.min(1, 720 / Math.max(size.w, size.h));
  canvas.width = Math.max(240, Math.round(size.w * scale));
  canvas.height = Math.max(240, Math.round(size.h * scale));
  paintCover(canvas, specFor(canvas.width, canvas.height));
  if (els.exportSizeLabel) {
    els.exportSizeLabel.textContent = size.label;
  }
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

// ---------------------------------------------------------------------------
// Photos. A slot takes either an uploaded file (read on this machine,
// never uploaded anywhere) or one of the built-in samples.
// ---------------------------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image: ' + src));
    img.src = src;
  });
}

async function setPhoto(slot, img, name) {
  if (slot === 'A') {
    state.photoA = img;
    state.photoAName = name;
    if (els.photoAName) els.photoAName.textContent = name;
  } else {
    state.photoB = img;
    state.photoBName = name;
    if (els.photoBName) els.photoBName.textContent = name;
  }
  repaint();
  setStatus(name + ' loaded into slot ' + slot + '.');
}

async function handleFile(slot, file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('That file is not an image — pick a JPG or PNG.');
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    await setPhoto(slot, img, file.name);
  } catch (err) {
    setStatus('Could not read that image. Try another file.');
    console.error(err);
  }
}

async function loadSample(key, slot) {
  const sample = SAMPLES[key];
  if (!sample) return;
  try {
    const img = await loadImage(sample.src);
    await setPhoto(slot, img, sample.name);
  } catch (err) {
    setStatus('Sample photo failed to load.');
    console.error(err);
  }
}

async function loadBothSamples() {
  await loadSample('pier', 'A');
  await loadSample('boulevard', 'B');
}

// ---------------------------------------------------------------------------
// Controls. Rows of buttons for layout, grade and size; sliders for
// focus and zoom; text fields for the caption. Every change repaints.
// ---------------------------------------------------------------------------
function buildRow(rowEl, keys, activeKey, onPick, labels) {
  if (!rowEl) return;
  rowEl.innerHTML = '';
  for (const key of keys) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (key === activeKey ? ' chip--active' : '');
    btn.dataset.value = key;
    btn.textContent = labels ? labels[key] : key;
    btn.addEventListener('click', () => {
      onPick(key);
      for (const other of rowEl.querySelectorAll('.chip')) {
        other.classList.toggle('chip--active', other.dataset.value === key);
      }
      repaint();
    });
    rowEl.appendChild(btn);
  }
}

function buildControls() {
  buildRow(els.layoutRow, LAYOUT_KEYS, state.layout, (key) => {
    state.layout = key;
    setStatus('Layout: ' + key + '.');
  }, { grid: 'Grid', hero: 'Hero', four: 'Four up', bleed: 'Full bleed' });

  buildRow(els.gradeRow, GRADE_KEYS, state.grade, (key) => {
    state.grade = key;
    setStatus('Grade: ' + GRADES[key].label + '.');
  }, Object.fromEntries(GRADE_KEYS.map((k) => [k, GRADES[k].label])));

  buildRow(els.sizeRow, EXPORT_SIZES.map((s) => s.key), state.size, (key) => {
    state.size = key;
    // Portrait exports read best as a hero, wide ones as four-up; the
    // user can still override the layout by hand afterwards.
    if (key === '1080x1350') state.layout = 'hero';
    else if (key === '1280x720' || key === '1920x1080') state.layout = 'four';
    else state.layout = 'grid';
    syncLayoutRow();
    setStatus('Export size: ' + key + '.');
  }, Object.fromEntries(EXPORT_SIZES.map((s) => [s.key, s.key])));

  // Caption fields.
  if (els.titleInput) {
    els.titleInput.value = state.title;
    els.titleInput.addEventListener('input', () => {
      state.title = els.titleInput.value || 'UNTITLED';
      state.seed = hashSeed(state.title);
      repaint();
    });
  }
  if (els.subtitleInput) {
    els.subtitleInput.value = state.subtitle;
    els.subtitleInput.addEventListener('input', () => {
      state.subtitle = els.subtitleInput.value || '';
      repaint();
    });
  }

  // Photo inputs.
  if (els.photoAInput) {
    els.photoAInput.addEventListener('change', () => handleFile('A', els.photoAInput.files[0]));
  }
  if (els.photoBInput) {
    els.photoBInput.addEventListener('change', () => handleFile('B', els.photoBInput.files[0]));
  }
  if (els.samplePier) els.samplePier.addEventListener('click', () => loadSample('pier', 'A'));
  if (els.sampleBoulevard) els.sampleBoulevard.addEventListener('click', () => loadSample('boulevard', 'B'));
  if (els.sampleBoth) els.sampleBoth.addEventListener('click', loadBothSamples);
  if (els.clearPhotos) {
    els.clearPhotos.addEventListener('click', () => {
      state.photoA = null;
      state.photoB = null;
      state.photoAName = '';
      state.photoBName = '';
      if (els.photoAName) els.photoAName.textContent = 'No photo — sunset placeholder';
      if (els.photoBName) els.photoBName.textContent = 'No photo — sunset placeholder';
      repaint();
      setStatus('Photos cleared. Sunset scenes stand in.');
    });
  }

  // Focus and zoom sliders, per slot.
  bindSlider(els.focusAX, (v) => { state.focusA.x = v; repaint(); });
  bindSlider(els.focusAY, (v) => { state.focusA.y = v; repaint(); });
  bindSlider(els.zoomA, (v) => { state.zoomA = v; repaint(); });
  bindSlider(els.focusBX, (v) => { state.focusB.x = v; repaint(); });
  bindSlider(els.focusBY, (v) => { state.focusB.y = v; repaint(); });
  bindSlider(els.zoomB, (v) => { state.zoomB = v; repaint(); });

  // Shuffle re-seeds the sunset scenes.
  if (els.shuffle) {
    els.shuffle.addEventListener('click', () => {
      state.seed = (Math.random() * 0xffffffff) >>> 0;
      repaint();
      setStatus('New sunset scenes, same caption.');
    });
  }
}

function bindSlider(input, onChange) {
  if (!input) return;
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
}

function syncLayoutRow() {
  if (!els.layoutRow) return;
  for (const chip of els.layoutRow.querySelectorAll('.chip')) {
    chip.classList.toggle('chip--active', chip.dataset.value === state.layout);
  }
}

// ---------------------------------------------------------------------------
// Export. One size, or all four. Each export renders a fresh canvas at
// full size through the same paintCover() the preview uses, then saves
// it as a PNG download. The filename carries the caption slug and the
// size so exports never overwrite each other.
// ---------------------------------------------------------------------------
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportSize(sizeKey) {
  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) || EXPORT_SIZES[0];
  const spec = specFor(size.w, size.h);
  // The layout follows the export shape, as in the size picker.
  if (sizeKey === '1080x1350') spec.layout = 'hero';
  else if (sizeKey === '1280x720' || sizeKey === '1920x1080') spec.layout = 'four';
  const canvas = renderCover(spec, size.w, size.h);
  const blob = await canvasToBlob(canvas);
  const slug = slugifyTitle(state.title);
  const filename = `cover-${slug}-${size.key}.png`;
  downloadBlob(blob, filename);
  return { filename, bytes: blob.size, w: size.w, h: size.h };
}

async function exportAll() {
  setStatus('Exporting all four sizes…');
  const results = [];
  for (const size of EXPORT_SIZES) {
    try {
      const r = await exportSize(size.key);
      results.push(r);
    } catch (err) {
      console.error('export failed for ' + size.key, err);
      setStatus('Export failed for ' + size.key + '.');
      return results;
    }
    // A breath between downloads so the browser queues them cleanly.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  setStatus('Exported ' + results.length + ' PNGs — check your downloads.');
  return results;
}

function buildExportButtons() {
  if (els.exportOne) {
    els.exportOne.addEventListener('click', async () => {
      setStatus('Exporting ' + state.size + '…');
      try {
        const r = await exportSize(state.size);
        setStatus('Saved ' + r.filename + ' (' + (r.bytes / 1024).toFixed(0) + ' KB).');
      } catch (err) {
        setStatus('Export failed.');
        console.error(err);
      }
    });
  }
  if (els.exportAll) {
    els.exportAll.addEventListener('click', () => { exportAll(); });
  }
}

// ---------------------------------------------------------------------------
// Boot. Load both samples so the first paint already shows a cover,
// then paint. The editor works with no network: samples are files under
// app/, every script is a file under app/.
// ---------------------------------------------------------------------------
export function bootEditor() {
  grabElements();
  buildControls();
  buildExportButtons();
  loadBothSamples().then(() => {
    setStatus('Ready — pick a photo, a layout and a grade, then export.');
  });
  repaint();
}

// The page loads main.js as a module and calls bootEditor on DOM ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootEditor);
} else {
  bootEditor();
}

// Exposed for the screenshot scenes and the export checker.
export const editorState = state;
export const editorSpecFor = specFor;
export const editorRepaint = repaint;
export const editorExportAll = exportAll;
export const editorExportSize = exportSize;
