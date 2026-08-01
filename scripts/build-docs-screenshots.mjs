// ============================================================================
// build-docs-screenshots.mjs — regenerates the in-app documentation screenshots
// (data/docs/*.png). Node dev tool, NOT loaded by the browser and NOT part of
// the Netlify build — run it manually whenever the UI changes enough that the
// docs imagery is stale:
//
//   1. start the dev server (run-server.bat / dev-server.js) on :8123
//   2. node scripts/build-docs-screenshots.mjs
//
// Zero dependencies: raw Chrome DevTools Protocol over Node's built-in
// WebSocket (same approach as the reverted MP4 export tool). Chrome runs
// headless against a THROWAWAY profile, so the splash sign-in gate renders
// fresh and nothing touches your real browser storage.
//
// Shot types:
//   • full   — whole 1600×940 viewport (overview / portal pages)
//   • region — a panel or modal, clipped via getBoundingClientRect, scale 1.5-2
//   • element— a single control (button, chip, dropdown), scale 2 for crispness
//
// Output: data/docs/<name>.png + data/docs/manifest.json {name:{w,h,scale}}.
// The docs bodies in docs-content.js reference these by name; if you rename a
// shot here, grep docs-content.js for it.
// ============================================================================

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'docs');
const BASE = process.env.ADFLOW_URL || 'http://localhost:8123';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VW = 1600, VH = 940;

mkdirSync(OUT, { recursive: true });
const manifest = {};
const failures = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- launch Chrome, throwaway profile, parse the DevTools port ---------------
const profile = join(tmpdir(), 'adflow-docs-shots-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${VW},${VH}`, '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--force-color-profile=srgb', '--mute-audio',
  // Software raster. On the GPU path this run reliably lost its renderer partway
  // through the sequence — the renderer goes, the CDP socket follows, and every
  // remaining step rejects with "Inspected target navigated or closed". Slower
  // per shot, but it finishes.
  '--disable-gpu'
], { stdio: ['ignore', 'ignore', 'pipe'] });

const port = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('Chrome DevTools port never appeared:\n' + buf)), 20000);
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
    if (m) { clearTimeout(t); resolve(+m[1]); }
  });
});

// --- minimal CDP client over the PAGE target's websocket ---------------------
async function pageWsUrl() {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    if (page) return page.webSocketDebuggerUrl;
    await sleep(200);
  }
  throw new Error('no page target');
}
const ws = new WebSocket(await pageWsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const eventWaiters = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id !== undefined) {
    const p = pending.get(m.id); pending.delete(m.id);
    if (!p) return;
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  } else {
    if (process.env.ADFLOW_SHOT_TRACE && /^(Page\.frameNavigated|Runtime\.executionContextsCleared|Inspector\.)/.test(m.method)) {
      console.log('    [trace]', m.method, JSON.stringify(m.params || {}).slice(0, 120));
    }
    for (let i = eventWaiters.length - 1; i >= 0; i--) {
      if (eventWaiters[i].event === m.method) { eventWaiters[i].resolve(m.params); eventWaiters.splice(i, 1); }
    }
  }
};
const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
  const id = ++msgId;
  const t = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out after ' + timeoutMs + 'ms')); }, timeoutMs);
  pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('CDP socket closed')); pending.clear(); };
const once = (event, timeout = 20000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout waiting ' + event)), timeout);
  eventWaiters.push({ event, resolve: (p) => { clearTimeout(t); resolve(p); } });
});

await send('Page.enable');
await send('Runtime.enable');

async function nav(url) {
  const loaded = once('Page.loadEventFired', 30000);
  await send('Page.navigate', { url });
  await loaded;
}

// Evaluate in-page. Async IIFE bodies welcome; throws surface here with text.
//
// Retries once on "Inspected target navigated or closed". During boot the app
// swaps the page's execution context out from under an in-flight evaluate, and
// the whole run used to die on the first one that lost the race — reproducibly,
// right after the splash shot. The page itself is fine; re-evaluating lands in
// the new context.
async function ev(expression, awaitPromise = true) {
  let r;
  for (let attempt = 0; ; attempt++) {
    try {
      r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      break;
    } catch (err) {
      const contextGone = /navigated or closed|Execution context was destroyed|Cannot find context/i.test(err.message || '');
      if (!contextGone || attempt >= 2) throw err;
      await sleep(600);
    }
  }
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('page eval failed: ' + (d.exception?.description || d.text));
  }
  return r.result?.value;
}

// Rect of a selector (or union of selectors), padded + viewport-clamped.
async function rectOf(selectors, pad = 8) {
  return await ev(`(() => {
    const sels = ${JSON.stringify([].concat(selectors))};
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9, found = false;
    for (const s of sels) {
      const n = document.querySelector(s);
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      found = true;
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
    }
    if (!found) return null;
    const p = ${pad};
    x1 = Math.max(0, x1 - p); y1 = Math.max(0, y1 - p);
    x2 = Math.min(innerWidth, x2 + p); y2 = Math.min(innerHeight, y2 + p);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  })()`, false);
}

// Freeze motion before capturing. Docs images are stills, and a running
// animation makes the compositor produce a fresh frame forever — the assets and
// link-group panels (looping highlight + thumbnail transitions) would sit there
// until Page.captureScreenshot timed out at 25s, twice, then give up. Frozen,
// they capture instantly and deterministically.
const FREEZE_CSS = `(() => {
  if (document.getElementById('__docs_freeze')) return true;
  const s = document.createElement('style');
  s.id = '__docs_freeze';
  s.textContent = '*,*::before,*::after{animation-play-state:paused!important;' +
                  'animation-delay:0s!important;transition:none!important;' +
                  'caret-color:transparent!important;}';
  document.head.appendChild(s);
  return true;
})()`;

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

// A setup step that must not sink the run. Posing the app for a shot is
// best-effort: if a selector moved, that shot is wrong or missing and gets
// reported, but the other forty still get captured. Everything after the boot
// sequence goes through this.
async function stepv(expression, awaitPromise = true) {
  try {
    return await ev(expression, awaitPromise);
  } catch (err) {
    const label = String(expression).replace(/\s+/g, ' ').trim().slice(0, 58);
    failures.push('setup [' + label + '…]: ' + err.message);
    console.log('  !', ts(), 'setup failed —', err.message.slice(0, 90));
    return null;
  }
}
async function shot(name, opts = {}) {
  try {
    try { await ev(FREEZE_CSS, false); } catch (e) { /* not worth failing a shot over */ }
    let clip;
    if (opts.sel) {
      const r = await rectOf(opts.sel, opts.pad ?? 8);
      if (!r) throw new Error('selector not found/empty: ' + opts.sel);
      clip = { x: r.x, y: r.y, width: Math.min(r.w, opts.maxW ?? r.w), height: Math.min(r.h, opts.maxH ?? r.h), scale: opts.scale ?? 2 };
    }
    let r;
    try {
      r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }, 25000);
    } catch (first) {
      await sleep(700);   // one retry — a raster hiccup shouldn't sink the run
      r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }, 25000);
    }
    writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    manifest[name] = clip
      ? { w: Math.round(clip.width), h: Math.round(clip.height), scale: clip.scale }
      : { w: VW, h: VH, scale: 1 };
    console.log('  ✓', ts(), name, manifest[name].w + 'x' + manifest[name].h, '@' + manifest[name].scale + 'x');
  } catch (err) {
    failures.push(name + ': ' + err.message);
    console.log('  ✗', ts(), name, '—', err.message);
  }
}

// ============================================================================
// EDITOR
// ============================================================================
console.log('editor…');
await nav(BASE + '/index.html');

// 1. The sign-in gate on a fresh profile.
await ev(`(async () => {
  for (let i = 0; i < 100; i++) {
    const sp = document.getElementById('app-splash');
    if (sp && sp.classList.contains('app-splash-gate-active')) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('splash gate never appeared');
})()`);
await sleep(400);
await shot('splash-signin');

// Dismiss the gate via its real button, then PROVE it is gone — the app keeps
// rendering behind the gate, so a weak "state exists" check passes while the
// splash still covers everything and every later shot silently captures it.
await ev(`(async () => {
  document.getElementById('splash-gate-local').click();
  for (let i = 0; i < 150; i++) {
    const sp = document.getElementById('app-splash');
    const gone = !sp || sp.classList.contains('app-splash-out') || getComputedStyle(sp).display === 'none' || getComputedStyle(sp).opacity === '0';
    if (gone && typeof state !== 'undefined' && document.querySelector('.canvas')) {
      await document.fonts.ready;
      document.querySelectorAll('.modal-bg').forEach(n => n.remove());
      const vum = document.getElementById('version-update-modal');
      if (vum) vum.style.display = 'none';
      // The splash keeps an infinite glow animation even when faded out —
      // remove it entirely so it can't cost raster time in later captures.
      if (sp) sp.remove();
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('splash gate never dismissed');
})()`);
await sleep(800);

// Build a presentable demo project on top of the default boot project.
await stepv(`(async () => {
  try { _autosaveSuspended = true; } catch (e) {}
  const c = state.canvases.find(x => x.width === 300 && x.height === 250);
  const c2 = state.canvases.find(x => x.width === 728 && x.height === 90);
  state.activeCanvasId = c.id;
  state.projectName = 'RMIT_Nursing_2026';

  const frameTexts = c.elements.filter(e => e.type === 'text' && e.persistent === false);
  const head = frameTexts[0], sub = frameTexts[1];
  const btn = c.elements.find(e => e.type === 'button');

  if (head) Object.assign(head, { text: 'Study Nursing at RMIT', customName: 'Headline',
    inEnabled: true, animType: 'rise', riseSplit: 'word', riseFade: true,
    animDuration: 1, animDelay: 0.1,
    exitEnabled: true, exitType: 'unreveal', exitStart: 2, exitDuration: 0.6,
    dynamic: { text: true } });
  if (sub) Object.assign(sub, { text: 'Applications close 30 Sept', customName: 'Subheading',
    inEnabled: true, animType: 'typing', typingUnit: 'word', animDuration: 0.8, animDelay: 0.7 });
  if (btn) Object.assign(btn, { text: 'Apply now',
    inEnabled: true, animType: 'word-pop', popUnit: 'word', animDuration: 0.5, animDelay: 1.2,
    fxEnabled: true, effectType: 'pulse', effDelay: 1.8, effDuration: 2 });

  // Mask pair: stock photo clipped by a rounded rect, auto-grouped like the UI does.
  const fid = state.activeFrameId;
  const img = { id: 'demo_img', type: 'image', assetId: 'img_rmit_2026_Health.jpg',
    name: '2026_Health.jpg', customName: 'Course photo', x: 168, y: 96, width: 124, height: 146,
    persistent: false, frameId: fid, objectFit: 'cover', groupId: 'g_demo',
    dynamic: { image: true } };
  const mask = { id: 'demo_mask', type: 'rect', isMask: true, maskTargetId: 'demo_img',
    customName: 'Photo mask', x: 176, y: 104, width: 108, height: 130, radius: 12,
    persistent: false, frameId: fid, fill: '#ffffff', groupId: 'g_demo' };
  c.elements.push(img, mask);

  // A live-linked headline group across two sizes.
  const head2 = c2 && c2.elements.find(e => e.type === 'text' && e.persistent === false);
  if (head && head2) {
    state.linkGroups = state.linkGroups || {};
    state.linkGroups['lg_demo'] = { id: 'lg_demo', name: 'Headline', category: 'text',
      liveLink: true, syncProperties: getDefaultSync(head) };
    head.linkGroupId = 'lg_demo'; head2.linkGroupId = 'lg_demo';
    head2.text = head.text;
  }

  // A small data sheet bound to the headline group + the photo.
  state.dataMerge = { enabled: true,
    columns: ['Course', 'Headline', 'Hero'],
    rows: [
      { Course: 'Nursing', Headline: 'Study Nursing at RMIT', Hero: '2026_Health.jpg' },
      { Course: 'Engineering', Headline: 'Study Engineering at RMIT', Hero: '2026_Engineering.jpg' },
      { Course: 'Business', Headline: 'Study Business at RMIT', Hero: '2026_Business.jpg' }
    ],
    keyColumn: 'Course', activeVersion: 0, locked: false,
    mappings: { 'g:lg_demo::text': 'Headline', 'el:demo_img::image': 'Hero' },
    skipHeaders: false };

  const rmit = (state.assetFolders || []).find(f => f.id === 'af_rmit');
  if (rmit) rmit.collapsed = false;

  state.selectedElementId = null; state.layerSelection = [];
  render();
  seqExpanded = true; localStorage.setItem(SEQ_LS_KEY, '1'); renderSequencer(true);
  await new Promise(r => setTimeout(r, 400));
})()`);
await sleep(500);
// Fresh-profile sections can start collapsed; the docs want them all open.
await stepv(`(() => {
  document.querySelectorAll('.panel-section.collapsed').forEach(s => s.classList.remove('collapsed'));
})()`, false);
await sleep(300);

// --- full + region shots ------------------------------------------------------
await shot('editor-overview');
await shot('topbar', { sel: '.topbar', pad: 0, scale: 1.5 });
await shot('panel-canvases', { sel: '#panel-section-canvases', scale: 2 });
await shot('panel-add-elements', { sel: '#panel-section-add-elements', scale: 2 });
await shot('panel-layers', { sel: '#panel-section-layers', scale: 2, maxH: 460 });
await shot('panel-assets', { sel: '#panel-section-assets', scale: 2, maxH: 420 });
await shot('panel-link-groups', { sel: '#panel-section-link-groups', scale: 2 });
await stepv(`(() => { const b = document.getElementById('btn-ai-resize'); return b ? b.parentElement.setAttribute('data-shot-anchor','1') : null; })()`, false);
await shot('autoresize-buttons', { sel: '[data-shot-anchor="1"]', scale: 2 });
await shot('frames-strip', { sel: '#frame-controls-wrap', scale: 2 });
await shot('version-dropdown', { sel: '#version-select-container', pad: 10, scale: 2 });

// --- selection-dependent shots -------------------------------------------------
const select = (id) => ev(`(async () => {
  state.selectedElementId = ${JSON.stringify(id)}; state.layerSelection = [${JSON.stringify(id)}];
  render(); await new Promise(r => setTimeout(r, 350));
})()`);

await stepv(`(async () => { const c = getActiveCanvas();
  const h = c.elements.find(e => e.customName === 'Headline'); window.__ids = {
    head: h && h.id,
    sub: (c.elements.find(e => e.customName === 'Subheading') || {}).id,
    img: 'demo_img', mask: 'demo_mask' }; })()`);
const ids = await stepv(`window.__ids`, false);

await select(ids.head);
await shot('panel-animation', { sel: '#header-animation', pad: 6, scale: 2, maxH: 620 });
await stepv(`(() => { const h = document.getElementById('header-animation'); const s = h && h.closest('.panel-section'); if (s) s.setAttribute('data-shot-anim','1'); })()`, false);
await shot('panel-animation-full', { sel: '[data-shot-anim="1"]', scale: 1.5, maxH: 700 });
await shot('dynamic-data-panel', { sel: '#panel-section-dynamic-data', scale: 2, maxH: 420 });

await select(ids.sub);
await shot('anim-typing-controls', { sel: '[data-shot-anim="1"]', scale: 1.5, maxH: 700 });

await select(ids.img);
await shot('props-image', { sel: '#props', pad: 0, scale: 1.25, maxH: 780 });
// Drop-to-replace affordance on the preview thumbnail.
await stepv(`(async () => {
  const pc = document.querySelector('#props .img-preview-container[data-img-drop="1"]');
  if (!pc) throw new Error('no droppable preview');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }));
  pc.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await new Promise(r => setTimeout(r, 200));
})()`);
await shot('img-drop-hint', { sel: '#props .img-preview-container', pad: 10, scale: 2 });
await stepv(`(() => { const pc = document.querySelector('#props .img-preview-container');
  if (pc) pc.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })); })()`, false);

// The masked image on canvas, selected.
await stepv(`(() => { const f = document.querySelector('.canvas-frame[data-canvas-id="' + state.activeCanvasId + '"]'); if (f) f.setAttribute('data-shot-canvas','1'); })()`, false);
await shot('canvas-masked', { sel: '[data-shot-canvas="1"]', pad: 14, scale: 1.5 });

// --- timeline ----------------------------------------------------------------
await select(ids.head);
await shot('timeline-overview', { sel: '#sequencer-panel', pad: 0, scale: 1.5 });
await stepv(`(async () => { seqFxEditId = null;
  const c = getActiveCanvas(); const b = c.elements.find(e => e.fxEnabled && e.effectType && e.effectType !== 'none');
  if (b) { state.selectedElementId = b.id; state.layerSelection = [b.id]; render(); await new Promise(r => setTimeout(r, 250));
    seqFxEditId = b.id; renderSequencer(true); await new Promise(r => setTimeout(r, 250)); }
})()`);
await shot('timeline-fx-isolated', { sel: '#sequencer-panel', pad: 0, scale: 1.5 });
await stepv(`(async () => { seqExitFxEdit(); renderSequencer(true); await new Promise(r => setTimeout(r, 200)); })()`);

await stepv(`(async () => {
  const chip = document.querySelector('.seq-chip-in[data-el="' + ${JSON.stringify(ids.head)} + '"]') || document.querySelector('.seq-chip-in');
  const el = getActiveCanvas().elements.find(e => e.id === (chip ? chip.dataset.el : null));
  seqOpenPresetPopover(el, 'in', chip.getBoundingClientRect());
  await new Promise(r => setTimeout(r, 250));
})()`);
await shot('timeline-preset-menu', { sel: ['.seq-popover', '.seq-chip-in'], pad: 10, scale: 2 });
await stepv(`seqCloseNPopover()`, false);
await stepv(`(async () => { seqOpenSettingsPopover(document.getElementById('seq-settings-btn').getBoundingClientRect()); await new Promise(r => setTimeout(r, 200)); })()`);
await shot('timeline-settings', { sel: ['.seq-popover', '#seq-settings-btn'], pad: 10, scale: 2 });
await stepv(`seqCloseNPopover()`, false);

// --- menus & modals ------------------------------------------------------------
await stepv(`(async () => {
  const node = document.querySelector('.el[data-id="' + ${JSON.stringify(ids.head)} + '"]');
  const r = node.getBoundingClientRect();
  node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await new Promise(r2 => setTimeout(r2, 250));
  const sub = document.querySelector('#ctx-menu .ctx-submenu');
  if (sub) sub.style.display = 'block';
})()`);
await shot('ctx-menu-element', { sel: ['#ctx-menu', '#ctx-menu .ctx-submenu'], pad: 10, scale: 1.5 });
await stepv(`(() => { const m = document.getElementById('ctx-menu'); if (m) m.style.display = 'none'; })()`, false);

await stepv(`(() => { const d = document.getElementById('menu-file-new').closest('.dropdown'); d.style.display = 'block'; d.setAttribute('data-shot-menu','1'); })()`, false);
await shot('file-menu', { sel: '[data-shot-menu="1"]', pad: 10, scale: 1.5 });
await stepv(`(() => { const d = document.querySelector('[data-shot-menu="1"]'); d.style.display = ''; })()`, false);

const modalShot = async (openExpr, name, scale = 1.25) => {
  await stepv(`(async () => { document.querySelectorAll('.modal-bg').forEach(n => n.remove()); ${openExpr}; await new Promise(r => setTimeout(r, 450)); })()`);
  await shot(name, { sel: '.modal-bg .modal', pad: 12, scale });
  await stepv(`document.querySelectorAll('.modal-bg').forEach(n => n.remove())`, false);
};
await modalShot(`document.getElementById('menu-file-new').click()`, 'new-project-modal');
await modalShot(`document.getElementById('menu-open-settings').click()`, 'settings-modal');
await modalShot(`document.getElementById('menu-help-shortcuts').click()`, 'shortcuts-modal', 1.1);
await modalShot(`openAutoResizeModal()`, 'autoresize-modal');
await modalShot(`openDataPanel()`, 'data-versions', 1.1);

// ============================================================================
// PREVIEW PORTAL
// ============================================================================
console.log('preview portal…');
await nav(BASE + '/preview.html');
await stepv(`(async () => { for (let i = 0; i < 100; i++) {
  const e = document.getElementById('pv-empty');
  if (e && getComputedStyle(e).display !== 'none') return;
  await new Promise(r => setTimeout(r, 100)); } throw new Error('pv-empty never showed'); })()`);
await sleep(400);
await shot('portal-empty');

// Build a small real .flow in-page (stock photos fetched into the bundle).
const FLOW_BUILDER = `
window.__flow = async (isTemplate) => {
  const imgUrl = async (u) => { const b = await (await fetch(u)).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
  const hero = await imgUrl('data/assets/2026_Health.jpg');
  const mkC = (id, w, h) => ({ id, name: w + 'x' + h, width: w, height: h, elements: [
    { id: id + '_bg', type: 'rect', customName: 'Background', color: '#000054', x: 0, y: 0, width: w, height: h, persistent: false, frameId: 0 },
    { id: id + '_img', type: 'image', assetId: 'imgHero', name: '2026_Health.jpg', x: Math.round(w * 0.55), y: 8, width: Math.round(w * 0.42), height: h - 16, persistent: false, frameId: 0, objectFit: 'cover', linkGroupId: 'lgI', dynamic: { image: true } },
    { id: id + '_t', type: 'text', customName: 'Headline', text: 'Study Nursing at RMIT', color: '#ffffff', fontSize: Math.max(14, Math.round(h * 0.11)), x: 10, y: 10, width: Math.round(w * 0.5), height: Math.round(h * 0.6), persistent: false, frameId: 0, linkGroupId: 'lgT', dynamic: { text: true }, inEnabled: true, animType: 'rise', riseSplit: 'word' }
  ]});
  const st = { projectName: 'RMIT_Nursing_2026', canvases: [mkC('cA', 300, 250), mkC('cB', 728, 90), mkC('cC', 160, 600)],
    activeCanvasId: 'cA', activeFrameId: 0,
    frames: [{ id: 0, duration: 3, transition: 'fade', transitionDuration: 0.5 }],
    linkGroups: { lgT: { id: 'lgT', name: 'Headline', category: 'text', syncProperties: { text: true } },
                  lgI: { id: 'lgI', name: 'Hero', category: 'image', syncProperties: { image: true } } },
    assets: { imgHero: hero }, assetNames: { imgHero: '2026_Health.jpg' }, assetLibrary: [], assetFolders: [],
    dataMerge: { enabled: true, columns: ['Course', 'Headline', 'Hero'],
      rows: [ { Course: 'Nursing', Headline: 'Study Nursing at RMIT', Hero: '2026_Health.jpg' },
              { Course: 'Engineering', Headline: 'Study Engineering at RMIT', Hero: '2026_Engineering.jpg' },
              { Course: 'Business', Headline: 'Study Business at RMIT', Hero: '2026_Business.jpg' } ],
      keyColumn: 'Course', activeVersion: null, locked: false,
      mappings: { 'g:lgT::text': 'Headline', 'g:lgI::image': 'Hero' }, skipHeaders: false } };
  if (isTemplate) st.isTemplate = true;
  const zip = new JSZip();
  zip.file('meta.json', JSON.stringify({ magic: 'adflow', version: 1, isTemplate: !!isTemplate }));
  zip.file('project.json', JSON.stringify(st));
  return await zip.generateAsync({ type: 'blob' });
};`;
await stepv(FLOW_BUILDER, false);
await stepv(`(async () => { const b = await window.__flow(false); await processProjectFile(b); await new Promise(r => setTimeout(r, 1500)); })()`);
await shot('portal-loaded');

// Third-party ads, side by side.
await stepv(`(async () => {
  const mkAd = async (name, w, h, c1, c2, label) => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><html><head><meta name="ad.size" content="width=' + w + ',height=' + h + '">' +
      '<style>html,body{margin:0;height:100%}#a{width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,' + c1 + ',' + c2 + ');color:#fff;font:700 ' + Math.round(h / 6) + 'px Arial;' +
      'animation:p 2s ease-in-out infinite}@keyframes p{50%{filter:brightness(1.25)}}</style></head>' +
      '<body><div id="a">' + label + '</div></body></html>');
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], name, { type: 'application/zip' });
  };
  const ads = [ await mkAd('agency_300x250.zip', 300, 250, '#7c5cff', '#2d1b69', 'AGENCY AD'),
                await mkAd('partner_728x90.zip', 728, 90, '#E60028', '#5c0212', 'PARTNER 728x90') ];
  await loadExternalAds(ads);
  await new Promise(r => setTimeout(r, 1400));
})()`);
await shot('portal-external');
await shot('portal-external-controls', { sel: '#external-controls', pad: 10, scale: 2 });

// ============================================================================
// BATCH PORTAL
// ============================================================================
console.log('batch portal…');
await nav(BASE + '/batch.html');
await stepv(`(async () => { for (let i = 0; i < 100; i++) {
  const e = document.getElementById('batch-empty');
  if (e && getComputedStyle(e).display !== 'none') return;
  await new Promise(r => setTimeout(r, 100)); } throw new Error('batch-empty never showed'); })()`);
await sleep(400);
await shot('batch-empty');
await stepv(FLOW_BUILDER, false);
await stepv(`(async () => { const b = await window.__flow(true); await processProjectFile(b); await new Promise(r => setTimeout(r, 1800));
  const sel = document.getElementById('select-version'); if (sel && [...sel.options].some(o => o.value === '0')) { sel.value = '0'; sel.dispatchEvent(new Event('change')); }
  await new Promise(r => setTimeout(r, 900)); })()`);
await shot('batch-loaded');
await shot('batch-sidebar', { sel: '.sidebar', pad: 0, scale: 1.5, maxH: 900 });

// ============================================================================
finish();

// Always write the manifest and say what happened. A late failure used to throw
// past the reporting and lose the record of everything that HAD been captured.
function finish(fatal) {
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\ndone:', Object.keys(manifest).length, 'shots →', OUT);
  if (fatal) console.log('FATAL (run stopped early):', fatal.message);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  -', f)); }
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failures.length || fatal ? 1 : 0);
}
