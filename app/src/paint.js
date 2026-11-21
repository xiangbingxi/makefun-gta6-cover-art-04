// Cover Snap Studio — the cover renderer.
//
// Paints GTA-style multi-panel cover art on a 2D canvas: seeded sunset
// scenes, photo panels with a colour grade, bold outlined lettering,
// pill labels with leader lines, a round stamp and a footer strip.
// Everything is deterministic: the same spec and seed paint the same
// pixels every time, so an export can be reproduced byte for byte.
//
// The renderer knows nothing about the DOM except the canvas it is
// handed. The editor (main.js) owns state and the screenshot scenes
// (shots.js) own the shot parameters; both call paintCover() here.

'use strict';

// ---------------------------------------------------------------------------
// Seeded randomness. mulberry32 is small, fast and stable across engines,
// which is what a deterministic export needs. Never use Math.random()
// anywhere in a paint path: two runs of the same spec must match.
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A cheap string hash so a caption can seed its own skyline.
export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Colour grades. Five looks, each a full palette: the sky gradient, the
// sun, the skyline silhouettes, the gutter ink, the photo wash and the
// pill colours. A grade is one object; the renderer never hard-codes a
// colour, it always reads the active grade.
// ---------------------------------------------------------------------------
export const GRADES = {
  sunset: {
    label: 'Sunset',
    sky: ['#ffb347', '#ff7e5f', '#e75480', '#7b2fbe'],
    sun: '#fff3b0',
    sunCore: '#ffe66d',
    skyline: '#2a0a4a',
    palm: '#1c0633',
    ink: '#1d0b33',
    gutter: '#1d0b33',
    wash: 'rgba(255, 94, 98, 0.16)',
    washShadow: 'rgba(43, 10, 74, 0.22)',
    pillBg: '#1d0b33',
    pillText: '#ffffff',
    pillEdge: '#ffffff',
    titleFill: '#fff7d6',
    titleEdge: '#1d0b33',
    stampInk: '#ffffff',
    footerText: '#cfc4e8',
    dot: 'rgba(255, 255, 255, 0.10)',
  },
  neon: {
    label: 'Neon Nights',
    sky: ['#0f0c29', '#302b63', '#ff2e88', '#00e5ff'],
    sun: '#ff5fa2',
    sunCore: '#ff8fb8',
    skyline: '#0a0618',
    palm: '#05030f',
    ink: '#0a0618',
    gutter: '#0a0618',
    wash: 'rgba(0, 229, 255, 0.14)',
    washShadow: 'rgba(10, 6, 24, 0.30)',
    pillBg: '#0a0618',
    pillText: '#7df9ff',
    pillEdge: '#7df9ff',
    titleFill: '#eafcff',
    titleEdge: '#0a0618',
    stampInk: '#7df9ff',
    footerText: '#8f86c9',
    dot: 'rgba(125, 249, 255, 0.12)',
  },
  gold: {
    label: 'Golden Hour',
    sky: ['#ffe259', '#ffa751', '#f7797d', '#8e2de2'],
    sun: '#fffbe6',
    sunCore: '#ffdf6b',
    skyline: '#3d1e5c',
    palm: '#2c1445',
    ink: '#2c1445',
    gutter: '#2c1445',
    wash: 'rgba(255, 167, 81, 0.18)',
    washShadow: 'rgba(44, 20, 69, 0.24)',
    pillBg: '#2c1445',
    pillText: '#ffe9a8',
    pillEdge: '#ffe9a8',
    titleFill: '#fff8dc',
    titleEdge: '#2c1445',
    stampInk: '#ffe9a8',
    footerText: '#d9c8ef',
    dot: 'rgba(255, 255, 255, 0.10)',
  },
  noir: {
    label: 'Vice Noir',
    sky: ['#232526', '#414345', '#6a4c93', '#c6426e'],
    sun: '#f5f0e6',
    sunCore: '#e8dcc8',
    skyline: '#101014',
    palm: '#0a0a0d',
    ink: '#101014',
    gutter: '#101014',
    wash: 'rgba(198, 66, 110, 0.14)',
    washShadow: 'rgba(16, 16, 20, 0.34)',
    pillBg: '#101014',
    pillText: '#f5f0e6',
    pillEdge: '#f5f0e6',
    titleFill: '#f5f0e6',
    titleEdge: '#101014',
    stampInk: '#f5f0e6',
    footerText: '#9a94a8',
    dot: 'rgba(245, 240, 230, 0.10)',
  },
  bay: {
    label: 'Turquoise Bay',
    sky: ['#43cea2', '#2bc0e4', '#1e7fa8', '#5b2a86'],
    sun: '#fff9c4',
    sunCore: '#ffe082',
    skyline: '#123a5c',
    palm: '#0b2a44',
    ink: '#0b2a44',
    gutter: '#0b2a44',
    wash: 'rgba(43, 192, 228, 0.16)',
    washShadow: 'rgba(11, 42, 68, 0.26)',
    pillBg: '#0b2a44',
    pillText: '#b8f1ff',
    pillEdge: '#b8f1ff',
    titleFill: '#f2feff',
    titleEdge: '#0b2a44',
    stampInk: '#b8f1ff',
    footerText: '#b9d6e8',
    dot: 'rgba(255, 255, 255, 0.10)',
  },
};

export const GRADE_KEYS = ['sunset', 'neon', 'gold', 'noir', 'bay'];

export function gradeOf(key) {
  return GRADES[key] || GRADES.sunset;
}

// ---------------------------------------------------------------------------
// Layouts. A layout turns a canvas size and a gutter into named panel
// rectangles. Panels are the only geometry the painter needs: photo
// panels, sunset panels and the title band are all rectangles.
// ---------------------------------------------------------------------------
export const LAYOUT_KEYS = ['grid', 'hero', 'four', 'bleed'];

export function layoutPanels(layout, w, h, gutter) {
  const g = gutter;
  const full = { x: 0, y: 0, w, h };
  if (layout === 'hero') {
    // Hero photo across the top two thirds, two sunset panels below.
    const heroH = Math.round((h - g * 3) * 0.62);
    const lowerY = heroH + g;
    const lowerH = h - lowerY - g;
    const halfW = Math.round((w - g * 3) / 2);
    return {
      full,
      photoA: { x: g, y: g, w: w - g * 2, h: heroH },
      sunsetA: { x: g, y: lowerY, w: halfW, h: lowerH },
      sunsetB: { x: g + halfW + g, y: lowerY, w: w - g * 2 - halfW - g, h: lowerH },
      titleBand: { x: g, y: g + heroH - Math.round(heroH * 0.34), w: w - g * 2, h: Math.round(heroH * 0.34) },
      footer: { x: 0, y: h - Math.round(h * 0.045), w, h: Math.round(h * 0.045) },
    };
  }
  if (layout === 'four') {
    // Four equal panels, two by two.
    const halfW = Math.round((w - g * 3) / 2);
    const halfH = Math.round((h - g * 3) / 2);
    return {
      full,
      photoA: { x: g, y: g, w: halfW, h: halfH },
      photoB: { x: g + halfW + g, y: g, w: w - g * 2 - halfW, h: halfH },
      sunsetA: { x: g, y: g + halfH + g, w: halfW, h: h - g * 2 - halfH - g },
      sunsetB: { x: g + halfW + g, y: g + halfH + g, w: w - g * 2 - halfW, h: h - g * 2 - halfH - g },
      titleBand: { x: g, y: g + halfH - Math.round(halfH * 0.42), w: w - g * 2, h: Math.round(halfH * 0.42) },
      footer: { x: 0, y: h - Math.round(h * 0.06), w, h: Math.round(h * 0.06) },
    };
  }
  if (layout === 'bleed') {
    // One full-bleed photo with a sunset band along the bottom.
    const bandH = Math.round(h * 0.30);
    return {
      full,
      photoA: { x: 0, y: 0, w, h },
      sunsetA: { x: 0, y: h - bandH, w, h: bandH },
      titleBand: { x: g, y: h - bandH - Math.round(h * 0.22), w: w - g * 2, h: Math.round(h * 0.22) },
      footer: { x: 0, y: h - Math.round(h * 0.045), w, h: Math.round(h * 0.045) },
    };
  }
  // grid (default): big photo top-left, two sunset panels top-right,
  // one wide sunset strip along the bottom.
  const topH = Math.round((h - g * 3) * 0.56);
  const bottomY = topH + g;
  const bottomH = h - bottomY - g;
  const leftW = Math.round((w - g * 3) * 0.62);
  const rightX = leftW + g;
  const rightW = w - g * 2 - leftW - g;
  const rightHalfH = Math.round((topH - g) / 2);
  return {
    full,
    photoA: { x: g, y: g, w: leftW, h: topH },
    sunsetA: { x: rightX, y: g, w: rightW, h: rightHalfH },
    sunsetB: { x: rightX, y: g + rightHalfH + g, w: rightW, h: topH - rightHalfH - g },
    sunsetC: { x: g, y: bottomY, w: w - g * 2, h: bottomH },
    titleBand: { x: g, y: g + topH - Math.round(topH * 0.36), w: w - g * 2, h: Math.round(topH * 0.36) },
    footer: { x: 0, y: h - Math.round(h * 0.045), w, h: Math.round(h * 0.045) },
  };
}

// ---------------------------------------------------------------------------
// Small drawing helpers. Each one is pure canvas work with no state kept
// between calls, so a panel can be painted, cleared and repainted freely.
// ---------------------------------------------------------------------------
function clipRect(ctx, r) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

function skyGradient(ctx, r, grade) {
  const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  const stops = grade.sky;
  for (let i = 0; i < stops.length; i += 1) {
    grad.addColorStop(i / (stops.length - 1), stops[i]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

// A sun disc cut by horizontal slits, the retro synthwave look.
function stripedSun(ctx, cx, cy, radius, grade) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grade.sun;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = grade.sunCore;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
  ctx.fill();
  // Slits grow wider toward the bottom of the disc.
  ctx.fillStyle = grade.sky[grade.sky.length - 1];
  const slitCount = 5;
  for (let i = 0; i < slitCount; i += 1) {
    const t = i / (slitCount - 1);
    const y = cy + radius * (0.05 + t * 0.75);
    const half = Math.sqrt(Math.max(0, radius * radius - (y - cy) * (y - cy)));
    const thickness = radius * (0.03 + t * 0.05);
    ctx.fillRect(cx - half, y, half * 2, thickness);
  }
  ctx.restore();
}

// Seeded city skyline: rectangles of varying height along the base.
function skyline(ctx, r, grade, rng, seedOffset) {
  const base = r.y + r.h;
  const local = mulberry32((seedOffset + 7) >>> 0);
  let x = r.x;
  const buildings = [];
  while (x < r.x + r.w) {
    const bw = r.w * (0.04 + local() * 0.07);
    const bh = r.h * (0.22 + local() * 0.5);
    buildings.push({ x, w: bw, h: bh });
    x += bw + r.w * 0.008;
  }
  ctx.fillStyle = grade.skyline;
  for (const b of buildings) {
    ctx.fillRect(b.x, base - b.h, b.w, b.h);
    // A rooftop antenna on every third building.
    if (buildings.indexOf(b) % 3 === 0) {
      ctx.fillRect(b.x + b.w / 2 - 1, base - b.h - r.h * 0.08, 2, r.h * 0.08);
    }
  }
  // A few lit windows, seeded so they never move between runs.
  ctx.fillStyle = grade.sunCore;
  for (const b of buildings) {
    const lit = 1 + Math.floor(local() * 4);
    for (let i = 0; i < lit; i += 1) {
      const wx = b.x + b.w * (0.2 + local() * 0.6);
      const wy = base - b.h + b.h * (0.15 + local() * 0.7);
      ctx.fillRect(wx, wy, Math.max(2, r.w * 0.006), Math.max(2, r.h * 0.02));
    }
  }
}

// A palm silhouette: curved trunk and seven drooping fronds.
function palm(ctx, x, y, size, grade, rng) {
  ctx.save();
  ctx.strokeStyle = grade.palm;
  ctx.fillStyle = grade.palm;
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.lineCap = 'round';
  // Trunk, leaning slightly.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + size * 0.06, y - size * 0.55, x + size * 0.14, y - size * 0.95);
  ctx.stroke();
  const topX = x + size * 0.14;
  const topY = y - size * 0.95;
  // Seven fronds fanning out from the crown.
  for (let i = 0; i < 7; i += 1) {
    const angle = Math.PI * (1.05 + (i / 6) * 0.9);
    const len = size * (0.42 + rng() * 0.14);
    const endX = topX + Math.cos(angle) * len;
    const endY = topY + Math.sin(angle) * len * 0.55 + size * 0.16;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(angle) * len * 0.5,
      topY + Math.sin(angle) * len * 0.5 - size * 0.1,
      endX,
      endY,
    );
    ctx.lineWidth = Math.max(1.5, size * 0.03);
    ctx.stroke();
  }
  // Coconuts.
  ctx.beginPath();
  ctx.arc(topX + size * 0.03, topY + size * 0.03, size * 0.035, 0, Math.PI * 2);
  ctx.arc(topX - size * 0.03, topY + size * 0.04, size * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Tiny birds: two short arcs each, seeded positions.
function birds(ctx, r, rng) {
  ctx.save();
  ctx.strokeStyle = 'rgba(20, 6, 40, 0.85)';
  ctx.lineWidth = Math.max(1.5, r.h * 0.006);
  ctx.lineCap = 'round';
  const count = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i += 1) {
    const bx = r.x + r.w * (0.12 + rng() * 0.7);
    const by = r.y + r.h * (0.1 + rng() * 0.3);
    const span = r.w * (0.02 + rng() * 0.02);
    ctx.beginPath();
    ctx.moveTo(bx - span, by);
    ctx.quadraticCurveTo(bx - span * 0.4, by - span * 0.5, bx, by);
    ctx.quadraticCurveTo(bx + span * 0.4, by - span * 0.5, bx + span, by);
    ctx.stroke();
  }
  ctx.restore();
}

// Soft horizontal cloud bands, low alpha, seeded.
function clouds(ctx, r, grade, rng) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  const count = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) {
    const cy = r.y + r.h * (0.12 + rng() * 0.5);
    const cw = r.w * (0.2 + rng() * 0.35);
    const cx = r.x + rng() * (r.w - cw);
    const ch = r.h * (0.02 + rng() * 0.03);
    ctx.beginPath();
    ctx.ellipse(cx + cw / 2, cy, cw / 2, ch, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A halftone dot grid over a rectangle, fading toward the bottom.
function halftone(ctx, r, spacing, colour, maxAlpha) {
  ctx.save();
  const step = Math.max(6, spacing);
  for (let y = r.y + step / 2; y < r.y + r.h; y += step) {
    const fade = 0.35 + 0.65 * ((y - r.y) / r.h);
    ctx.fillStyle = colour;
    ctx.globalAlpha = Math.min(maxAlpha, maxAlpha * fade + 0.02);
    for (let x = r.x + step / 2; x < r.x + r.w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, step * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Sparse film grain: seeded speckles, darker and lighter.
function grain(ctx, r, rng, amount) {
  ctx.save();
  const count = Math.floor((r.w * r.h) / 900) * amount;
  for (let i = 0; i < count; i += 1) {
    const x = r.x + rng() * r.w;
    const y = r.y + rng() * r.h;
    const light = rng() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Photo panels. The image is drawn cover-fit, then graded: a colour wash,
// a halftone pass and a vignette so the photo sits in the same world as
// the painted sunsets beside it.
// ---------------------------------------------------------------------------
export function drawPhoto(ctx, img, r, grade, opts) {
  const o = opts || {};
  const focusX = o.focusX ?? 0.5;
  const focusY = o.focusY ?? 0.5;
  const zoom = o.zoom ?? 1;
  if (!img || !img.naturalWidth) {
    // No photo yet: paint the sunset scene as a placeholder panel.
    paintSunsetPanel(ctx, r, grade, o.seed ?? 1, o);
    return;
  }
  clipRect(ctx, r);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(r.w / iw, r.h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = r.x + (r.w - dw) * focusX;
  const dy = r.y + (r.h - dh) * focusY;
  ctx.drawImage(img, dx, dy, dw, dh);
  // Colour wash unifies the photo with the grade.
  ctx.fillStyle = grade.wash;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Vignette: darkened corners pull the eye to the middle.
  const vg = ctx.createRadialGradient(
    r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.35,
    r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, grade.washShadow);
  ctx.fillStyle = vg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Halftone and grain finish the print look.
  halftone(ctx, r, Math.max(7, r.w * 0.012), grade.dot, 0.5);
  const rng = mulberry32((o.seed ?? 1) * 31 + 5);
  grain(ctx, r, rng, 1);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Sunset panels. A full painted scene: sky, striped sun, skyline, palms,
// birds, clouds, halftone and grain. The seed decides the skyline and
// the palm placement; the same seed always paints the same scene.
// ---------------------------------------------------------------------------
export function paintSunsetPanel(ctx, r, grade, seed, opts) {
  const o = opts || {};
  const rng = mulberry32(seed >>> 0);
  clipRect(ctx, r);
  skyGradient(ctx, r, grade);
  clouds(ctx, r, grade, rng);
  // Sun: centred by default, or pushed to a side for variety.
  const sunX = r.x + r.w * (o.sunX ?? 0.5);
  const sunY = r.y + r.h * (o.sunY ?? 0.52);
  const sunR = Math.min(r.w, r.h) * (o.sunR ?? 0.3);
  stripedSun(ctx, sunX, sunY, sunR, grade);
  birds(ctx, r, rng);
  skyline(ctx, r, grade, rng, seed);
  // Palms at the panel edges, one or two depending on width.
  const palmCount = r.w > r.h * 1.2 ? 2 : 1;
  for (let i = 0; i < palmCount; i += 1) {
    const px = r.x + r.w * (i === 0 ? 0.08 + rng() * 0.06 : 0.86 + rng() * 0.06);
    const py = r.y + r.h * (0.98 + rng() * 0.02);
    const ps = r.h * (0.34 + rng() * 0.12);
    palm(ctx, px, py, ps, grade, rng);
  }
  halftone(ctx, r, Math.max(7, r.w * 0.012), grade.dot, 0.55);
  grain(ctx, r, rng, 1);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Lettering. The title is heavy, slightly sheared, outlined in the ink
// colour and filled pale, with a smaller subtitle beneath. The font size
// shrinks until the title fits the band, so any caption stays on one line.
// ---------------------------------------------------------------------------
const TITLE_FAMILY = '"Arial Black", "Archivo Black", "Helvetica Neue", Arial, sans-serif';
const BODY_FAMILY = '"Helvetica Neue", Arial, sans-serif';

export function fitTitleFont(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `900 ${size}px ${TITLE_FAMILY}`;
  while (size > 24 && ctx.measureText(text).width > maxWidth) {
    size = Math.floor(size * 0.92);
    ctx.font = `900 ${size}px ${TITLE_FAMILY}`;
  }
  return size;
}

export function drawTitle(ctx, band, title, subtitle, grade) {
  const text = (title || 'UNTITLED').toUpperCase();
  const sub = (subtitle || 'LEONIDA \u2022 VICE CITY').toUpperCase();
  const pad = band.w * 0.03;
  const maxW = band.w - pad * 2;
  const startSize = Math.round(band.h * 0.52);
  const size = fitTitleFont(ctx, text, maxW, startSize);
  const cx = band.x + band.w / 2;
  const titleY = band.y + band.h * 0.56;
  ctx.save();
  // Slight shear for the poster slant.
  ctx.transform(1, 0, -0.06, 1, band.h * 0.02, 0);
  ctx.font = `900 ${size}px ${TITLE_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = grade.titleEdge;
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.strokeText(text, cx, titleY);
  ctx.fillStyle = grade.titleFill;
  ctx.fillText(text, cx, titleY);
  ctx.restore();
  // Subtitle, tracked out, under the title. letterSpacing tracks it
  // out; splitting the string by hand would put hair spaces around the
  // bullet too, which renders as a stray mark at small sizes.
  const subSize = Math.max(14, Math.round(band.h * 0.16));
  ctx.save();
  ctx.font = `700 ${subSize}px ${BODY_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = grade.titleEdge;
  ctx.lineWidth = Math.max(2, subSize * 0.16);
  const subY = band.y + band.h * 0.88;
  let spacing = Math.max(2, subSize * 0.28);
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  while (spacing > 0 && ctx.measureText(sub).width > maxW) {
    spacing = Math.max(0, spacing - 1);
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  }
  ctx.strokeText(sub, cx, subY);
  ctx.fillText(sub, cx, subY);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pill labels: a rounded tag with a leader line down to a dot, pointing
// at something in the photo. direction 'down' hangs the line below the
// pill; 'up' runs it above.
// ---------------------------------------------------------------------------
export function drawPill(ctx, label, x, y, grade, direction) {
  const dir = direction || 'down';
  const fontSize = Math.max(13, Math.round(22));
  ctx.save();
  ctx.font = `700 ${fontSize}px ${BODY_FAMILY}`;
  const tw = ctx.measureText(label).width;
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.55;
  const w = tw + padX * 2;
  const h = fontSize + padY * 2;
  // Keep the whole pill on the canvas: clamp its centre so neither
  // edge crosses the canvas bounds. The leader line and dot follow the
  // clamped centre, so the line stays attached to the pill.
  const canvasW = ctx.canvas ? ctx.canvas.width : x + w;
  const cx = Math.min(Math.max(x, w / 2 + 4), canvasW - w / 2 - 4);
  const px = cx - w / 2;
  const py = y - h / 2;
  // Leader line first, so the pill sits on top of it.
  const lineLen = h * 1.9;
  const dotR = Math.max(3, fontSize * 0.22);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, fontSize * 0.12);
  ctx.beginPath();
  if (dir === 'down') {
    ctx.moveTo(cx, py + h);
    ctx.lineTo(cx, py + h + lineLen);
  } else {
    ctx.moveTo(cx, py);
    ctx.lineTo(cx, py - lineLen);
  }
  ctx.stroke();
  const dotY = dir === 'down' ? py + h + lineLen + dotR : py - lineLen - dotR;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  // The pill itself.
  ctx.beginPath();
  ctx.roundRect(px, py, w, h, h / 2);
  ctx.fillStyle = grade.pillBg;
  ctx.fill();
  ctx.strokeStyle = grade.pillEdge;
  ctx.lineWidth = Math.max(1.5, fontSize * 0.09);
  ctx.stroke();
  ctx.fillStyle = grade.pillText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + fontSize * 0.06);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The round stamp: two concentric rings, a star in the middle and text
// set on a circle between the rings. The text is split into a top arc
// and a bottom arc so it reads around the stamp.
// ---------------------------------------------------------------------------
export function drawStamp(ctx, cx, cy, radius, grade, topText, bottomText) {
  ctx.save();
  ctx.strokeStyle = grade.stampInk;
  ctx.fillStyle = grade.stampInk;
  ctx.lineWidth = Math.max(2, radius * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, radius * 0.015);
  ctx.stroke();
  // Star in the centre.
  const starR = radius * 0.34;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? starR : starR * 0.45;
    const sx = cx + Math.cos(ang) * rr;
    const sy = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
  // Text on the ring, letter by letter.
  const ringR = radius * 0.91;
  const fontSize = Math.max(8, radius * 0.11);
  ctx.font = `700 ${fontSize}px ${BODY_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = (topText || 'VICE CITY \u2022 LEONIDA').toUpperCase();
  const bottom = (bottomText || 'EST. 2026').toUpperCase();
  // Top arc reads left to right across the top.
  const topSpan = Math.PI * 0.9;
  for (let i = 0; i < top.length; i += 1) {
    const t = top.length === 1 ? 0.5 : i / (top.length - 1);
    const ang = -Math.PI / 2 - topSpan / 2 + t * topSpan;
    const lx = cx + Math.cos(ang) * ringR;
    const ly = cy + Math.sin(ang) * ringR;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillText(top[i], 0, 0);
    ctx.restore();
  }
  // Bottom arc reads left to right across the bottom.
  const botSpan = Math.PI * 0.7;
  for (let i = 0; i < bottom.length; i += 1) {
    const t = bottom.length === 1 ? 0.5 : i / (bottom.length - 1);
    const ang = Math.PI / 2 - botSpan / 2 + t * botSpan;
    const lx = cx + Math.cos(ang) * ringR;
    const ly = cy + Math.sin(ang) * ringR;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang - Math.PI / 2);
    ctx.fillText(bottom[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Footer strip: small tracked-out caps text centred in the gutter.
// ---------------------------------------------------------------------------
export function drawFooter(ctx, rect, text, grade) {
  const line = (text || 'A LEONIDA STORY \u2022 STARRING YOU \u2022 SHOT ON THE BOULEVARD').toUpperCase();
  ctx.save();
  const size = Math.max(11, Math.round(rect.h * 0.42));
  ctx.font = `700 ${size}px ${BODY_FAMILY}`;
  ctx.fillStyle = grade.footerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The cover itself. A spec carries everything the painter needs:
//   photoA, photoB   loaded images (or null for a painted placeholder)
//   title, subtitle  the caption lines
//   grade            a key of GRADES
//   layout           a key of LAYOUT_KEYS
//   seed             the scene seed
//   pills            [{ label, fx, fy, dir }] in fractions of the photo
//   stamp            { show, fx, fy } in fractions of the canvas
//   footer           footer text
//   focusA, focusB   photo focus points { x, y } in 0..1
//   zoomA, zoomB     photo zoom, 1 is fit
// Panels are painted in order: gutter, photos, sunsets, title, pills,
// stamp, footer. The title band sits over the photo so the lettering
// overlaps the image, the poster look.
// ---------------------------------------------------------------------------
export function paintCover(canvas, spec) {
  const s = spec || {};
  const grade = gradeOf(s.grade);
  const layout = LAYOUT_KEYS.includes(s.layout) ? s.layout : 'grid';
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const gutter = Math.max(8, Math.round(Math.min(w, h) * 0.02));
  const seed = (s.seed ?? hashSeed(s.title || 'cover')) >>> 0;
  const panels = layoutPanels(layout, w, h, gutter);

  // Gutter: the dark frame everything sits in.
  ctx.fillStyle = grade.gutter;
  ctx.fillRect(0, 0, w, h);

  // Photo panels.
  drawPhoto(ctx, s.photoA || null, panels.photoA, grade, {
    seed: seed + 11,
    focusX: s.focusA?.x ?? 0.5,
    focusY: s.focusA?.y ?? 0.5,
    zoom: s.zoomA ?? 1,
  });
  if (panels.photoB) {
    drawPhoto(ctx, s.photoB || null, panels.photoB, grade, {
      seed: seed + 23,
      focusX: s.focusB?.x ?? 0.5,
      focusY: s.focusB?.y ?? 0.5,
      zoom: s.zoomB ?? 1,
    });
  }

  // Sunset panels, each with its own seed so no two scenes repeat.
  const sunsetKeys = ['sunsetA', 'sunsetB', 'sunsetC'];
  let sunsetIndex = 0;
  for (const key of sunsetKeys) {
    const p = panels[key];
    if (!p) continue;
    const sunSide = sunsetIndex % 2 === 0 ? 0.62 : 0.38;
    paintSunsetPanel(ctx, p, grade, seed + 100 + sunsetIndex * 37, {
      sunX: sunSide,
      sunY: 0.5,
      sunR: 0.3,
    });
    sunsetIndex += 1;
  }

  // Title across the photo, overlapping the image edge.
  drawTitle(ctx, panels.titleBand, s.title, s.subtitle, grade);

  // Pill labels, positioned as fractions of the first photo panel.
  const pills = s.pills || defaultPills(layout);
  const anchor = panels.photoA;
  for (const pill of pills) {
    const px = anchor.x + anchor.w * (pill.fx ?? 0.2);
    const py = anchor.y + anchor.h * (pill.fy ?? 0.15);
    drawPill(ctx, pill.label, px, py, grade, pill.dir || 'down');
  }

  // The round stamp, bottom-right of the canvas by default.
  const stamp = s.stamp || {};
  if (stamp.show !== false) {
    const sx = w * (stamp.fx ?? 0.86);
    const sy = h * (stamp.fy ?? 0.86);
    const sr = Math.min(w, h) * (stamp.r ?? 0.075);
    drawStamp(ctx, sx, sy, sr, grade, stamp.top, stamp.bottom);
  }

  // Footer strip.
  drawFooter(ctx, panels.footer, s.footer, grade);
  return canvas;
}

function defaultPills(layout) {
  if (layout === 'hero') {
    return [
      { label: 'GOLDEN HOUR', fx: 0.16, fy: 0.14, dir: 'down' },
      { label: 'THE GETAWAY', fx: 0.84, fy: 0.14, dir: 'down' },
    ];
  }
  if (layout === 'four') {
    return [
      { label: 'GOLDEN HOUR', fx: 0.2, fy: 0.2, dir: 'down' },
      { label: 'VICE CITY', fx: 0.8, fy: 0.2, dir: 'down' },
    ];
  }
  return [
    { label: 'GOLDEN HOUR', fx: 0.18, fy: 0.12, dir: 'down' },
    { label: 'THE GETAWAY', fx: 0.82, fy: 0.12, dir: 'down' },
  ];
}

// ---------------------------------------------------------------------------
// Export sizes and a convenience renderer. renderCover() builds a fresh
// canvas at the requested size, paints the spec on it and hands it back,
// so export and preview share one code path and one look.
// ---------------------------------------------------------------------------
export const EXPORT_SIZES = [
  { key: '1080x1080', w: 1080, h: 1080, label: 'Square 1080 \u00d7 1080' },
  { key: '1080x1350', w: 1080, h: 1350, label: 'Portrait 1080 \u00d7 1350' },
  { key: '1280x720', w: 1280, h: 720, label: 'Wide 1280 \u00d7 720' },
  { key: '1920x1080', w: 1920, h: 1080, label: 'Full HD 1920 \u00d7 1080' },
];

export function renderCover(spec, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paintCover(canvas, spec);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned nothing'));
    }, 'image/png');
  });
}

export function slugifyTitle(title) {
  return (title || 'cover')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'cover';
}
