// ============================================================================
// State — multi-canvas model, all serializable to JSON.
// ============================================================================
// Random overlay joke selector
(function() {
  const jokes = [
    "Get a real work equipment",
    "What is this, a screen for ants?",
    "Are you designing on a smart fridge?",
    "Your browser is too small, just like my patience.",
    "Enhance! ...No seriously, we need more pixels.",
    "We're going to need a bigger monitor.",
    "This screen is tighter than our display budget.",
    "Banner production requires actual screen real estate.",
    "Your viewport is currently in 'pocket' mode.",
    "A wild mobile device appeared! Studio used Block.",
    "This app does not fit in your pocket. Yet.",
    "Are you trying to build HTML5 banners on a pager?",
    "Please maximize your window or buy a larger screen.",
    "Warning: Viewport is below minimum design-grade limits.",
    "Your screen is smaller than my motivation on a Friday afternoon.",
    "Are you building HTML5 ads on a microwave?",
    "Error 404: Screen real estate not found.",
    "Is this a custom viewport for smartwatches?",
    "If I wanted to design on this size, I'd build app icons.",
    "Responsive design doesn't mean *this* responsive.",
    "My eyes are squinting harder than a CSS compiler.",
    "This resolution belongs in 1995.",
    "Did the client ask you to fit the logo, copy, disclaimer, and CTA on *this*?",
    "Please expand your screen. The CSS grid is claustrophobic.",
    "This viewport is tighter than a zip file on a budget.",
    "Go find a desktop. Canvas production is not a mobile game.",
    "Where did the rest of your pixels go?",
    "Too small. Even the media queries are protesting.",
    "I've seen larger screen viewports on a calculator.",
    "Is that a screen or a stamp?",
    "Your screen resolution has been demoted to thumbnail."
  ];
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  const setJoke = () => {
    const el = document.querySelector('#size-overlay h2');
    if (el) el.textContent = joke;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setJoke);
  } else {
    setJoke();
  }
})();

const urlSizeCache = {};


// Auto-resize engine (rule-based v2) lives in `auto-resize-engine.js`. That
// file is loaded BEFORE this one in index.html, so its constants and
// functions (ROLE_IDS, ROLE_LABELS, ROLE_PICKER_ORDER, autoAssignRole,
// ensureRolesAssignedAll, runRuleBasedAutoResize, etc.) are available
// globally by the time anything in this file runs.


const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 8);

// isLineHeightAuto() / getResolvedLineHeight() now provided by scripts/render-runtime.js

let isSpaceDown = false;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let scrollStartX = 0, scrollStartY = 0;

// The six sizes a blank board is built from unless you say otherwise — the RMIT
// display set, not a catalogue. Deliberately short: every one of these is ticked by
// default, so anything added here becomes a canvas in every new project.
const PRESET_SIZES = [
  { name: 'Wide Skyscraper', width: 160, height: 600 },
  { name: 'Medium Rectangle', width: 300, height: 250 },
  { name: 'Half Page', width: 300, height: 600 },
  { name: 'Leaderboard', width: 728, height: 90 },
  { name: 'Mobile Leaderboard', width: 320, height: 50 },
  { name: 'Billboard', width: 970, height: 250 }
];

// The catalogue to PICK from, which is a different job to the one above: nothing here
// is created unless it is chosen, so it can afford to be long. Grouped because a flat
// list of forty sizes is a list nobody reads.
//
// Nothing exceeds 2900px on either side. That is not arbitrary — the board is
// BOARD_SIZE (3000) square, so a canvas bigger than that has corners nobody can pan
// to. It is why 4K and A4-at-300dpi are absent while QHD and A4-at-150dpi are here.
const CANVAS_SIZE_CATALOG = [
  {
    group: 'Display ads', sizes: [
      { name: 'Medium Rectangle', width: 300, height: 250 },
      { name: 'Large Rectangle', width: 336, height: 280 },
      { name: 'Square', width: 250, height: 250 },
      { name: 'Small Square', width: 200, height: 200 },
      { name: 'Half Page', width: 300, height: 600 },
      { name: 'Portrait', width: 300, height: 1050 },
      { name: 'Skyscraper', width: 120, height: 600 },
      { name: 'Wide Skyscraper', width: 160, height: 600 },
      { name: 'Leaderboard', width: 728, height: 90 },
      { name: 'Large Leaderboard', width: 970, height: 90 },
      { name: 'Billboard', width: 970, height: 250 },
      { name: 'Mobile Banner', width: 300, height: 50 },
      { name: 'Mobile Leaderboard', width: 320, height: 50 },
      { name: 'Large Mobile Banner', width: 320, height: 100 },
      { name: 'Mobile Interstitial', width: 320, height: 480 },
      { name: 'Mobile Full Screen', width: 360, height: 640 }
    ]
  },
  {
    group: 'Social', sizes: [
      { name: 'Instagram Square', width: 1080, height: 1080 },
      { name: 'Instagram Portrait', width: 1080, height: 1350 },
      { name: 'Story / Reel', width: 1080, height: 1920 },
      { name: 'Facebook Feed', width: 1200, height: 630 },
      { name: 'Facebook Cover', width: 820, height: 312 },
      { name: 'LinkedIn Feed', width: 1200, height: 627 },
      { name: 'X Post', width: 1600, height: 900 },
      { name: 'YouTube Thumbnail', width: 1280, height: 720 },
      { name: 'Pinterest Pin', width: 1000, height: 1500 }
    ]
  },
  {
    group: 'Screens & devices', sizes: [
      { name: 'Laptop', width: 1366, height: 768 },
      { name: 'Desktop HD', width: 1920, height: 1080 },
      { name: 'Desktop QHD', width: 2560, height: 1440 },
      { name: 'MacBook Air', width: 1440, height: 900 },
      { name: 'iPad', width: 820, height: 1180 },
      { name: 'iPad Pro', width: 1024, height: 1366 },
      { name: 'iPhone', width: 390, height: 844 },
      { name: 'iPhone Pro Max', width: 430, height: 932 },
      { name: 'Android Phone', width: 412, height: 915 }
    ]
  },
  {
    group: 'Raster & design', sizes: [
      { name: 'Square 500', width: 500, height: 500 },
      { name: 'Square 1000', width: 1000, height: 1000 },
      { name: 'Square 2000', width: 2000, height: 2000 },
      { name: '4:3 Landscape', width: 800, height: 600 },
      { name: '4:3 Large', width: 1600, height: 1200 },
      { name: '3:2 Landscape', width: 1500, height: 1000 },
      { name: 'A4 Portrait (150 dpi)', width: 1240, height: 1754 },
      { name: 'A5 Portrait (150 dpi)', width: 874, height: 1240 },
      { name: 'US Letter (150 dpi)', width: 1275, height: 1650 }
    ]
  }
];

// The pannable board is BOARD_SIZE×BOARD_SIZE px (kept in sync with the
// `.workspace-canvas` width/height in styles.css). Canvases are placed at
// absolute workspaceX/workspaceY coords on it. We anchor content near the
// top-left (BOARD_MARGIN) rather than the old centre (~2050) so the board can
// be small without users panning into empty void, while still leaving margin
// on every side for temporarily parking elements.
const BOARD_SIZE = 3000;
const BOARD_MARGIN = 500;

// Initial layout positions in the all-sizes workspace (anchored at BOARD_MARGIN)
const INITIAL_LAYOUT = [
  { x: 500, y: 500 },
  { x: 700, y: 500 },
  { x: 1040, y: 500 },
  { x: 1380, y: 500 },
  { x: 1380, y: 670 },
  { x: 1380, y: 800 },
];

function seedCanvas(preset, layoutIdx) {
  const id = uid();
  return {
    id,
    name: preset.name,
    width: preset.width,
    height: preset.height,
    bgColor: '#0f172a',
    workspaceX: INITIAL_LAYOUT[layoutIdx]?.x ?? (BOARD_MARGIN + (layoutIdx || 0) * 30),
    workspaceY: INITIAL_LAYOUT[layoutIdx]?.y ?? (BOARD_MARGIN + (layoutIdx || 0) * 30),
    elements: defaultElements(preset),
  };
}

function defaultElements(preset) {
  // Adapt seed content to canvas proportions
  const w = preset.width, h = preset.height;
  const isTall = h > w * 1.5;
  const isWide = w > h * 3;
  const fs = Math.max(14, Math.min(40, Math.round(Math.min(w, h) * 0.12)));
  const pad = Math.max(10, Math.round(Math.min(w, h) * 0.06));
  const out = [];
  out.push(Object.assign(makeElement('text'),
    {
      x: pad, y: pad, text: 'Summer sale',
      fontSize: fs, color: '#ffffff', weight: '700', fontFamily: 'Museo',
      width: Math.max(120, w - pad * 2 - (w * 0.25)), height: Math.round(fs * 1.2)
    }));
  if (!isWide || w > 600) {
    out.push(Object.assign(makeElement('text'),
      {
        x: pad, y: pad + Math.round(fs * 1.2) + 8, text: 'Up to 50% off',
        fontSize: Math.max(11, Math.round(fs * 0.55)),
        color: '#c7ccdb', weight: '400', fontFamily: 'Helvetica Neue LT Pro',
        width: w - pad * 2, height: Math.round(Math.max(11, Math.round(fs * 0.55)) * 1.2)
      }));
  }
  const btnW = Math.min(140, Math.round(w * 0.35));
  const btnH = Math.min(40, Math.round(h * 0.15));
  out.push(Object.assign(makeElement('button'),
    {
      x: pad,
      y: isTall ? h - btnH - pad : h - btnH - pad,
      text: 'Shop now', bg: '#7c5cff', color: '#fff',
      fontSize: Math.max(11, Math.round(btnH * 0.42)),
      radius: 6, width: btnW, height: btnH, isClickArea: true,
      fontFamily: 'Helvetica Neue LT Pro', weight: '500'
    }));

  const logoW = Math.max(60, Math.min(100, Math.round(w * 0.2)));
  const logoH = Math.round(logoW * 0.35); // rough aspect ratio for RMIT logo
  out.push(Object.assign(makeElement('image'),
    { customName: 'RMIT Logo', assetId: 'data/Elements/RMIT_White.svg', x: w - logoW - pad, y: pad, width: logoW, height: logoH, persistent: 'top' }));

  out.push(Object.assign(makeElement('text'),
    {
      customName: 'Compliance Text', text: 'CRICOS: 00122A | RTO: 3046',
      fontSize: 8, color: '#9aa1b6', weight: '400',
      width: 140, height: 12,
      x: 6, y: h - 14, textAlign: 'left', persistent: 'top'
    }));

  return out;
}

function makeElement(type) {
  let fId = 1;
  try { fId = state.activeFrameId || 1; } catch (e) { }
  // New elements default to all animation categories enabled EXCEPT out (inEnabled
  // / fxEnabled on, exitEnabled off). The presets start at 'none' so nothing
  // actually animates until the user picks one, but the sections are shown.
  const base = { id: uid(), x: 20, y: 20, width: 120, height: 40, animType: 'none', animDuration: 1.0, animDelay: 0.0, effectType: 'none', inEnabled: true, fxEnabled: true, frameId: fId, persistent: false };
  switch (type) {
    // Museo 700 is the RMIT display face, and matches the button default.
    case 'text': return { ...base, type, text: 'Your headline', fontSize: 22, color: '#ffffff', weight: '700', fontFamily: 'Museo', width: 220, height: 32 };
    case 'rect': return { ...base, type, color: '#7c5cff', width: 120, height: 80, radius: 8 };
    case 'circle': return { ...base, type, color: '#22d3ee', width: 80, height: 80 };
    case 'line': return { ...base, type, color: '#ffffff', width: 160, height: 3, opacity: 100 };
    case 'pixel': return { ...base, type, color: '#e61e2a', width: 100, height: 100 };
    case 'button': {
      let buttonBg = '#000054';
      try {
        const c = getActiveCanvas();
        if (c) {
          const bgVal = (getCanvasBg(c, fId) || '').trim().toLowerCase();
          const cleanBg = bgVal.startsWith('#') ? bgVal : '#' + bgVal;
          if (cleanBg === '#000054') {
            buttonBg = '#e61e2a';
          } else if (cleanBg === '#e61e2a') {
            buttonBg = '#000054';
          }
        }
      } catch (err) {}
      return { ...base, type, text: 'Learn more', fontSize: 14, color: '#ffffff', bg: buttonBg, radius: 6, fontFamily: 'Museo', weight: '700', width: 130, height: 40, isClickArea: true, autoSize: true, maxFontSize: 40, wrapText: true };
    }
    case 'image': return { ...base, type, assetId: null, width: 140, height: 90, objectFit: 'contain' };
  }
}

// Initial state: all 5 preset canvases pre-seeded
const state = {
  projectName: 'RMIT_ad',
  clickTag: 'https://www.rmit.edu.au/',
  compressedAssetsMap: {},
  frames: [{ id: 1, duration: 2 }],
  activeFrameId: 1,
  canvases: PRESET_SIZES.map((p, i) => seedCanvas(p, i)),
  activeCanvasId: null,
  selectedElementId: null,
  layerSelection: [],
  assetSelection: [],
  zoom: 1.0,
  activeTool: 'select',
  editingElementId: null,      // inline-edit (text) mode
  isolatedGroupId: null,
  assets: {
    'rmit_logo': 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMTkuNjcgNzYuMjMiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6ICNmZmY7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxnIGlkPSJMYXllcl8xLTIiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+CiAgICA8ZyBpZD0iUk1JVF93aGl0ZSI+CiAgICAgIDxnPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI2LjIxLDBoLTYuNjh2NS40M2gtMTEuMTV2MTEuMzRIMHYxNi42NWg4LjM3djExLjM0aDExLjEzdjUuNDNoNS45MWMxMy43OCwwLDI1LjkzLTExLjEzLDI1LjkzLTI1LjAyUzQwLjAzLDAsMjYuMjEsMCIvPgogICAgICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNjAuNDEgNC43OSAxNjYuMjMgNC43OSAxNjYuMjMgNDUuMzcgMTYwLjQxIDQ1LjM3IDE2MC40MSA0Ny40NiAxODAuNTggNDcuNDYgMTgwLjU4IDQ1LjM3IDE3NC43OCA0NS4zNyAxNzQuNzggNC43OSAxODAuNTggNC43OSAxODAuNTggMi42NyAxNjAuNDEgMi42NyAxNjAuNDEgNC43OSIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTIxOC45NCwyLjY1aC0zNS44OGwtLjczLDExLjgxaDIuMTJjMS4yMy04LjU4LDIuODEtMTAuNjEsMTIuMjctMTAuMTN2NDEuMDNoLTYuMTh2Mi4xaDIwLjk2di0yLjFoLTYuMThWNC4zM2M5LjQ0LS40OCwxMS4wNiwxLjU1LDEyLjI3LDEwLjEzaDIuMDhsLS43My0xMS44MVoiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNDIuMjMsNS40N3YzOS44OWgtNS43N3YyLjFoMjAuMTR2LTIuMWgtNS43N1Y0Ljc3aDUuNzV2LTIuMTRoLTE2LjU0bC05LjcyLDMwLjY1LTkuMzctMzAuNjVoLTE2LjQ3djIuMTJoNS43OXY0MC42aC02LjI1Yy01LjgyLjE0LTUuOTEtNC44MS01Ljg4LTUuODQuMDktMTAuOTMtMi4zNy0xNC44OS0xMi44NC0xNi41MXYtLjE0YzYuMjUtLjY2LDE0LjIzLTIuNDQsMTQuMjMtMTAuMDEsMC05LjMzLTguNjktMTAuMi0xNi4wMy0xMC4yaC0yMS42djIuMTJoNS43OXY0MC42aC01Ljc5djIuMTJoMjAuMTZ2LTIuMTJoLTUuNzl2LTIxLjM5YzMuNzItLjE0LDcuOTEuOCw5Ljc4LDIuNDIsMS43NiwxLjQ4LDIuNjksNi4wOSwyLjY5LDExLjYzLDAsNi44NCwzLjU0LDkuNDQsMTAuMzMsOS40NGgxOS40M3YtMi4xaC01LjY2VjUuNDdoLjE0bDEzLjM0LDQyLjAxaDIuMjZsMTMuNDMtNDIuMDFoLjIxWk03Ni4yNywyMS44NWwtLjAyLjAyVjQuNzdoNS44NGM1Ljk4LDAsOC4xOSwxLjUxLDguMTksOS4wMywwLDYtMi40OSw4LjA1LTguNTEsOC4wNSwwLDAtNS41LDAtNS41LDBaIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNzguNTUsNTkuOTR2OS42OWMwLDIuNjctMS42Nyw0LjI0LTQuMiw0LjI0cy00LjItMS41NS00LjItNC4ydi05Ljc0YzAtMS4xMi0uNDgtMS42LTEuNi0xLjZoLTIuNTF2Mi4xNGgxLjA3Yy4zNCwwLC41NS4xOC41NS41NWgtLjAyejAsOC43NCwwLDguNzRjMCwzLjgzLDIuNzQsNi40NSw2LjczLDYuNDVzNi42Ni0yLjYyLDYuNjYtNi40NXYtOC43NGMwLS4zNi4yMS0uNTUuNTUtLjU1aDEuMDd2LTIuMTRoLTIuNDljLTEuMTIsMC0xLjYyLjQ4LTEuNjIsMS42Ii8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNOTcuMzksNTkuOTR2OS41M2MwLDEsLjE4LDIuMzkuMTgsMi4zOWgtLjA1cy0uODItMS40Ni0xLjQ2LTIuMzlsLTcuODItMTEuMTNoLTIuMjZ2MTQuODdjMCwuMzQtLjIxLjU1LS41NS41NWgtMS4wN3YyLjE0aDIuNTFjMS4xMiwwLDEuNi0uNDgsMS42LTEuNnYtOS41M2MwLS45OC0uMTYtMi4zOS0uMTYtMi4zOWguMDVzLjgsMS40NiwxLjQ0LDIuMzlsNy44NSwxMS4xM2gyLjI0di0xNC44N2MwLS4zNi4yMS0uNTUuNTUtLjU1aDEuMDd2LTIuMTRoLTIuNDljLTEuMTQsMC0xLjYyLjQ4LTEuNjIsMS42Ii8+CiAgICAgICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9IjEwNC4yMSA2MC40OSAxMDUuOTIgNjAuNDkgMTA1LjkyIDczLjc2IDEwNC4yMSA3My43NiAxMDQuMjEgNzUuOTEgMTEwLjAxIDc1LjkxIDExMC4wMSA3My43NiAxMDguMyA3My43NiAxMDguMyA2MC40OSAxMTAuMDEgNjAuNDkgMTEwLjAxIDU4LjM0IDEwNC4yMSA1OC4zNCAxMDQuMjEgNjAuNDkiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMjQuMSw1OS43OGwtMy44NSwxMC44M2MtLjM0Ljk2LS42NiwyLjQyLS42NiwyLjQyaC0uMDVzLS4zNC0xLjQ4LS42Ni0yLjQybC0zLjg1LTEwLjgzYy0uNDEtMS4xNi0uODQtMS40NC0yLjA4LTEuNDRoLTEuMzl2Mi4xNGguMzRjLjQzLDAsLjY2LjA5LjgyLjU1aC0uMDJsNS41MiwxNC44N2gyLjY1bDUuNTItMTQuODdjLjE2LS40Ni4zNi0uNTUuODItLjU1aC4zNHYtMi4xNGgtMS4zOWMtMS4yMywwLTEuNjQuMjctMi4wNSwxLjQ0Ii8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTM5LjM2LDczLjI0YzAsLjM0LS4yMS41NS0uNTUuNTVoLTUuMTNjLS4zNCwwLS41NS0uMjEtLjU1LS41NXYtNS4xMWg2LjE0di0yLjE0aC02LjE0di01LjVoNWMuMzQsMCwuNTUuMTguNTUuNTV2MS4xMmgyLjI2di0yLjIxYzAtMS4xMi0uNDgtMS42LTEuNi0xLjZoLTEwLjMzdjIuMTRoMS42MnYxMy44NGMwLDEuMTIuNDgsMS42LDEuNiwxLjZoNy44MmMxLjEyLDAsMS42LS40OCwxLjYtMS42di0yLjIxaC0yLjh2MS4xMloiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNTYuMTMsNzMuMTlsLTIuMTItNC4yYy0uMy0uNTctLjc1LS44LS43NS0uOHYtLjA1YzEuMjUtLjI3LDMuMTctMS43MSwzLjE3LTQuNjUsMC0zLjIyLTIuMTctNS4xNS01LjI1LTUuMTVoLTcuNjZ2Mi4xNGgxLjYydjE1LjQyaDIuNDl2LTdoMi4yOGMuOTYsMCwxLjI4LjE0LDEuNzMuOTZsMi4zOSw0LjcyYy41NywxLjE0LDEuMDcsMS4zMiwyLjQ0LDEuMzJoMS4yM3YtMi4xNGgtLjMyYy0uNjIsMC0xLS4wNS0xLjI1LS41N00xNTAuODYsNjYuNzhoLTMuMjR2LTYuM2gzLjI4YzEuODUsMCwyLjk3LDEuMTQsMi45NywzLjFzLTEuMTIsMy4xOS0zLjAxLDMuMTkiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNjIuMzUsNjIuNjhjMC0xLjMyLDEuMTktMi4zNywzLjA4LTIuMzcsMS4zOSwwLDIuNzEuNjgsMi43MSwxLjZ2LjgyaDIuMjh2LTEuNDRjMC0yLjM5LTMuMTItMy4yNC01LTMuMjQtMy4zMywwLTUuNjMsMi4wNS01LjYzLDQuNywwLDUuNDcsOC40OCw0LjksOC40OCw4LjU4LDAsMS42Mi0xLjM3LDIuNjItMy4wMSwyLjYyLTIuNTEsMC00LjI3LTEuOTctNC4zOS0yLjExbC0xLjQ1LDEuNzRzMi4wOCwyLjYyLDUuODIsMi42MmMzLjQ3LDAsNS41Ny0yLjMsNS41Ny01LDAtNS43Ny04LjQ2LTQuOTctOC40Ni04LjUzIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTYwLjg3LDcxLjgyczAsMCwuMDEuMDFoLjAxcy0uMDItLjAxLS4wMi0uMDFaIi8+CiAgICAgICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9IjE3My40MSA2MC40OSAxNzUuMTIgNjAuNDkgMTc1LjEyIDczLjc2IDE3My40MSA3My43NiAxNzMuNDEgNzUuOTEgMTc5LjIxIDc1LjkxIDE3OS4yMSA3My43NiAxNzcuNSA3My43NiAxNzcuNSA2MC40OSAxNzkuMjEgNjAuNDkgMTc5LjIxIDU4LjM0IDE3My40MSA1OC4zNCAxNzMuNDEgNjAuNDkiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xOTQuNCw1OC4zN2gtMTIuMDljLTEuMTIsMC0xLjQ4LjM3LTEuNDgsMS40OHYyLjNoMi4yMXYtMS4xMmMwLS4zNy4yMS0uNTUuNTUtLjU1aDMuNTF2MTUuNDJoMi40OXYtMTUuNDJoMy41NGMuMzQsMCwuNTUuMTguNTUuNTV2MS4xMmgyLjIxdi0yLjNjMC0xLjEyLS4zNi0xLjQ4LTEuNDgtMS40OCIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTIwOC4wMSw1OS42OWwtMi42NSw0LjQyYy0uNTkuOTYtMS4wNywxLjk2LTEuMDcsMS45NmgtLjA1cy0uNS0uOTgtMS4wNy0xLjk2bC0yLjY3LTQuNDJjLS43MS0xLjE2LTEuMTktMS4zNS0yLjM3LTEuMzVoLTEuMTR2Mi4xNGguNWMuNTIsMCwuNzUuMDksMS4wNy42Mmw0LjQ1LDcuMTRoLjAydjcuNjZoMi40OXYtNy42NmwtLjQyLTcuMTRjLjMyLS41Mi41Ny0uNjIsMS4wOS0uNjJoLjQ4di0yLjE0aC0xLjE0Yy0xLjE5LDAtMS42OS4xOC0yLjM3LDEuMzUiLz4KICAgICAgPC9nPgogICAgPC9nPgogIDwvZz4KPC9zdmc+'
  },
  showRulers: true,
  snapEnabled: true,
  snapToElements: true,
  snapToCanvas: true,
  snapToGuides: true,
  cropToCanvas: false,
  tempTopDuringDrag: false,
  loopAd: false,
  previewCurrentOnly: false,
  guides: [],
  activeSmartGuides: null,
  showSafezones: false,
  adSizeLimit: 150,      // max exported ad weight in KB (IAB display-ad standard)
  snapDistance: 5,       // snapping distance tolerance in pixels
  defaultBg: '#0f172a',  // default background for newly created canvases
  savedHistoryLimit: 50,    // undo-stack depth — bumped from 10 in v0.16.8
  autosaveInterval: 10,     // local IndexedDB auto-save interval in seconds (5-60)
  zoomStep: 0.1,            // mouse scroll zoom step percentage (e.g. 0.1 = 10%)
  showCanvasSizes: true,    // renders dimension labels inside canvas frame headers
  canvasSpacing: 60,        // vertical/horizontal grid gap spacing between canvases
  safezoneStandard: 5,      // standard aspect layouts safezone padding %
  safezoneNarrow: 8,        // skinny aspect layouts safezone padding %
  nudgeDefault: 1,          // standard arrow key nudge delta in pixels
  nudgeShift: 10,           // Shift + arrow key nudge delta in pixels
  exportFormat: 'png',      // export image format preference: png, jpeg, webp
  exportQuality: 80,        // image quality compression factor % (for jpeg/webp)
  compressFormat: 'jpeg',   // auto-compression output: 'jpeg' (PNG for transparency — ad-server safe) or 'webp'
  subheadingAutoHide: true, // allow Auto-Hide Subheading setting override
  defaultCricosCode: '00122A', // RMIT default compliance CRICOS code
  clipboard: null,
  outlineMode: false,
  linkGroups: {},
  assetNames: {},        // assetId -> original filename (for data-merge image lookup)
  assetLibrary: [],      // saved reusable elements/groups (Assets panel)
  assetFolders: [],      // folders organizing the Assets panel (1 level deep)
  favoriteAnimations: JSON.parse(localStorage.getItem('favoriteAnimations') || '[]'),
  filterFavorites: false,
  validationSettings: {
    textSize: true,
    contrast: true,
    transitionTiming: true,
    infiniteMotion: true,
    cricos: true,
    logo: true,
    brandColors: true,
    brandFonts: true
  },
  // Data-merge / versioning: bind named element "slots" to spreadsheet columns so a
  // single template produces one finished ad set per row (e.g. one per RMIT course).
  dataMerge: {
    enabled: false,
    columns: [],         // header names, in order
    rows: [],            // array of { columnName: value }
    keyColumn: null,     // column used to name exported zips
    activeVersion: null, // index into rows, or null = template defaults
    locked: false,       // when true, dynamic slots are read-only in the editor
    mappings: {},        // 'slotKey::field' -> columnName  (slotKey = 'g:'+gid | 'el:'+id | 'clicktag')
    skipHeaders: false   // if true, CSV imports skip the first row as headers and generate auto-headers
  }
};
state.activeCanvasId = state.canvases[0].id;

const history = [];
let historyIndex = -1;
var sizeUpdateTimeout = null;
let startupTemplates = [];

// The auto-size / auto-hug sizers (measureButtonWidth, measureTextFits) measure
// label text with canvas.measureText / a hidden <div>. Both depend on the real
// web font being loaded — the @font-face fonts (Museo, Helvetica Neue LT Pro)
// download lazily, so a cold load/refresh can measure against the FALLBACK font
// and pick a too-small width/font, which makes single-line button labels wrap.
// The user previously had to zoom in/out to force a re-render (by which point
// the font had loaded) to fix it. ensureAppFontsLoaded() forces those fonts to
// download up front so callers can re-render once measurement is reliable.
// Mirrors the families/weights declared in styles.css.
let _appFontsReadyPromise = null;
function ensureAppFontsLoaded() {
  if (_appFontsReadyPromise) return _appFontsReadyPromise;
  if (!document.fonts || !document.fonts.load) {
    _appFontsReadyPromise = Promise.resolve();
    return _appFontsReadyPromise;
  }
  const specs = [
    "300 16px 'Museo'", "500 16px 'Museo'", "700 16px 'Museo'",
    "300 16px 'Helvetica Neue LT Pro'", "400 16px 'Helvetica Neue LT Pro'",
    "500 16px 'Helvetica Neue LT Pro'", "600 16px 'Helvetica Neue LT Pro'"
  ];
  // document.fonts.ready only resolves for fonts already REQUESTED, so we kick
  // an explicit load of each spec first; .ready then waits for them all.
  _appFontsReadyPromise = Promise.all(
    specs.map(s => document.fonts.load(s).catch(() => {}))
  ).then(() => document.fonts.ready).catch(() => {});
  return _appFontsReadyPromise;
}

function measureButtonWidth(el) {
  const canvas = measureButtonWidth.canvas || (measureButtonWidth.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = `${el.weight || '600'} ${el.fontSize || 14}px ${el.fontFamily || 'Arial'}`;
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = (el.letterSpacing || 0) + 'px';
  }
  const textW = ctx.measureText(el.text).width;
  // Add 2px safety padding to prevent layout engine rounding/kerning shifts from causing premature wraps
  return Math.ceil(textW) + (el.paddingLR || 16) * 2 + 2;
}

// getMeasureDiv() / DEFAULT_WRAP_MIN / measureTextFits() / calculateAutoSize()
// now provided by scripts/render-runtime.js — see the note there on why the
// Auto-size fitter has to be shared with batch.html and preview.html.



// Re-entrancy guard: any pushHistory() call that fires DURING a restore
// (e.g. via render() → some downstream side-effect) gets short-circuited.
// Prevents the restore itself from polluting history with a duplicate of
// the snapshot we just popped.
let _restoringHistory = false;

function pushHistory() {
  if (_restoringHistory) return;
  const snapshot = JSON.stringify({
    canvases:          state.canvases,
    frames:            state.frames,
    activeCanvasId:    state.activeCanvasId,
    activeFrameId:     state.activeFrameId,
    selectedElementId: state.selectedElementId,
    layerSelection:    state.layerSelection,
    guides:            state.guides,
    linkGroups:        state.linkGroups,
    dataMerge:         state.dataMerge,
    projectName:       state.projectName,
    // clickTag is ad CONTENT (the exit URL baked into exports), so it is
    // undoable. Being in the snapshot also defeats the duplicate-skip below
    // so queueSizeUpdate() re-runs the URL validation when it changes.
    // App/validator PREFERENCES (adSizeLimit, validationSettings, snap*,
    // theme, ...) are deliberately NOT snapshotted: undo must never flip
    // the user's settings. Their save handlers call queueSizeUpdate()
    // directly when revalidation is needed.
    clickTag:          state.clickTag
  });
  // Skip exact duplicates (e.g. a no-op drag).
  if (historyIndex >= 0 && history[historyIndex] === snapshot) return;
  // Drop any forward (redo) branch — making a new change invalidates redo.
  history.splice(historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
  // Trim from the oldest end until we're at/below the configured limit.
  // The default jumped from 10 to 50 in v0.16.8; max 100 from Settings.
  const limit = Math.max(5, Math.min(100, state.savedHistoryLimit || 50));
  while (history.length > limit) {
    history.shift();
    historyIndex--;
  }
  // typeof guard: the very first pushHistory() fires at load time from
  // autosave.js, before project-dialogs.js (which defines queueSizeUpdate)
  // has loaded. Boot-time validation is queued by app-boot.js instead.
  if (typeof queueSizeUpdate === 'function') queueSizeUpdate();
  scheduleAutosave();
}

// Debounced history push for rapid-fire micro-edits (arrow-key nudges).
// Holding an arrow key produces one history entry per pause instead of one
// per keystroke — and instead of none at all, which silently merged the
// nudge into the NEXT action's undo step.
let _pendingHistoryTimer = null;
function pushHistoryDebounced(delay = 500) {
  if (_pendingHistoryTimer) clearTimeout(_pendingHistoryTimer);
  _pendingHistoryTimer = setTimeout(() => {
    _pendingHistoryTimer = null;
    pushHistory();
  }, delay);
}

// Commit any pending debounced push NOW. undo()/redo() call this first so a
// nudge followed by an immediate Ctrl+Z undoes the nudge itself, not the
// action before it (and so the pending timer can't fire after a restore and
// wipe the redo branch).
function flushPendingHistory() {
  if (_pendingHistoryTimer) {
    clearTimeout(_pendingHistoryTimer);
    _pendingHistoryTimer = null;
    pushHistory();
  }
}

function getCappedHistory(limit) {
  const l = limit !== undefined ? limit : (state.savedHistoryLimit || 50);
  if (history.length <= l) {
    return {
      history: [...history],
      historyIndex: historyIndex
    };
  }

  // Choose a sliding window of size `l` around historyIndex
  let start = historyIndex - Math.floor(l / 2);
  if (start < 0) {
    start = 0;
  }
  let end = start + l - 1;
  if (end >= history.length) {
    end = history.length - 1;
    start = end - l + 1;
    if (start < 0) start = 0;
  }

  const slicedHistory = history.slice(start, end + 1);
  const newIndex = historyIndex - start;
  return {
    history: slicedHistory,
    historyIndex: newIndex
  };
}

// The clickTag the viewer is actually looking at: the active data-merge
// version's bound column value when one is set, else the project default.
// Mirrors the per-row resolution in export-pipeline.js so the editor
// validation badges agree with what the export panel reports.
function getEffectiveClickTag() {
  const dm = state.dataMerge;
  if (dm && dm.enabled && dm.activeVersion != null && dm.mappings) {
    const ctCol = dm.mappings['clicktag::url'];
    const row = dm.rows && dm.rows[dm.activeVersion];
    if (ctCol && row && row[ctCol] != null && String(row[ctCol]).trim() !== '') {
      return String(row[ctCol]).trim();
    }
  }
  return state.clickTag ? state.clickTag.trim() : '';
}

// Returns null when the URL is a valid clickTag, else the error message.
function validateClickTagUrl(urlStr) {
  if (!urlStr) return 'Missing clickTag URL';
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'clickTag URL must start with http:// or https://';
    }
    if (!url.hostname.includes('.') || url.hostname.split('.').pop().length < 2) {
      return 'clickTag URL must be a valid website name with domain';
    }
    return null;
  } catch (e) {
    return 'clickTag URL format is invalid (e.g. https://example.com)';
  }
}

