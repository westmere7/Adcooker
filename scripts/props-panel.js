// ============================================================================
// Properties panel
// ============================================================================
let activeFramePreviewType = null;
let framePreviewTimeoutId = null;

// Registered by the props-panel wiring each render; lets a global guard stop
// previews even after the panel DOM was rebuilt (which swallows mouseleave).
let stopElementAnimPreviewFn = null;
let stopElementEffectPreviewFn = null;
let stopElementExitPreviewFn = null;
// updateProp closure for the CURRENTLY selected element, registered by
// renderProps so the sequencer can commit edits through the exact same code
// path as the props panel (multi-select fan-out, side effects, render(true)
// link-sync). Null whenever nothing is selected — callers must select +
// renderProps() first.
let activeUpdatePropFn = null;
// startPreviewLoop is a closure inside renderProps(); register it so the
// top-level wireCustomSelects() (animDirection dropdown) can drive the preview.
let startElementAnimPreviewFn = null;
let startElementExitPreviewFn = null;
let applyElementEffectPreviewFn = null;
// Set when a hover-driven effect preview starts via the global startEffectPreview
// (panDir custom select), which bypasses the panel closure's activeEffectVal.
let hoverEffectPreviewActive = false;

const PRESET_DESCRIPTIONS = {
  // In Animations
  'in-none': "No entry animation.",
  'in-fade-in': "Smoothly fades in the element.",
  'in-slide': "Slides in the element from a specified direction.",
  'in-swipe': "Reveals the element via a linear sliding wipe transition.",
  'in-zoom': "Zooms/scales in the element from its anchor point.",
  'in-split': "Splits open the element from a center angle.",
  'in-blur': "Fades in the element with a smooth camera blur.",
  'in-typing': "Fades/types in text characters or words sequentially.",
  'in-rise': "Letters, words, or lines rise into view from beneath a mask.",

  // Animation FX
  'eff-none': "No active Animation FX.",
  'eff-pulse': "Repeatedly scales the element up and down slightly.",
  'eff-float': "Slowly floats the element up and down.",
  'eff-flash': "Flashes the opacity of the element repeatedly.",
  'eff-wiggle': "Tilts the element back and forth continuously.",
  'eff-spin': "Rotates the element continuously by a set angle.",
  'eff-heartbeat': "A sudden double-pulse beat simulation.",
  'eff-pan': "Repeatedly moves/pans the element along an axis.",
  'eff-zoom': "Repeatedly zooms/scales the element's scale.",

  // Frame Transitions
  'frame-none': "No transition between frames.",
  'frame-fade': "Fades out the previous frame while fading in the next.",
  'frame-slide': "Slides the next frame over the top of the previous.",
  'frame-push': "Pushes the previous frame out of view with the next.",
  'frame-swipe': "Wipes the previous frame into the next frame.",
  'frame-zoom': "Scales in the next frame from the center or corners.",
  'frame-split': "Splits open the previous frame to reveal the next.",
  'frame-iris': "Reveals the next frame through an expanding shape (circle, square, diamond, or pixel).",
  'frame-blur': "Blurs the previous frame and cross-fades into the next.",
  'frame-corner-fold': "Folds the corner of the previous frame back to reveal the next."
};

function getPreviewDomNodes(el, previewType = 'inAnim') {
  let idsToPreview = [];
  const lg = el.linkGroupId ? state.linkGroups?.[el.linkGroupId] : null;
  const isSyncOn = lg && (previewType === 'inAnim' ? lg.syncProperties?.inAnim : previewType === 'outAnim' ? lg.syncProperties?.outAnim : lg.syncProperties?.effect);
  if (el.linkGroupId && lg?.liveLink === true && isSyncOn) {
    const gid = el.linkGroupId;
    state.canvases.forEach(c => {
      c.elements.forEach(targetEl => {
        if (targetEl.linkGroupId === gid) {
          idsToPreview.push(targetEl.id);
        }
      });
    });
  } else {
    idsToPreview = state.layerSelection.length > 1 ? [...state.layerSelection] : [el.id];
  }
  
  return idsToPreview.map(id => document.querySelector(`.el[data-id="${id}"]`)).filter(Boolean);
}

function stopAllAnimationPreviews() {
  if (stopElementAnimPreviewFn) stopElementAnimPreviewFn();
  if (stopElementEffectPreviewFn) stopElementEffectPreviewFn();
  if (stopElementExitPreviewFn) stopElementExitPreviewFn();
  if (activeFramePreviewType || framePreviewTimeoutId) stopFrameTransitionPreview();
}

// Per-panel mouseleave can be missed when renderProps() rebuilds the panel under
// the cursor, leaving a preview running forever. This document-level guard stops
// every preview as soon as the pointer hovers anything outside the 3 sub-panels.
document.addEventListener('mouseover', (e) => {
  const t = e.target;
  if (t && t.closest && t.closest('#in-transition-preview-area, #out-transition-preview-area, #effects-preview-area, #frame-transition-preview-area, #sequencer-panel')) return;
  stopAllAnimationPreviews();
});
document.addEventListener('mouseleave', () => stopAllAnimationPreviews());

function startFrameTransitionPreview(type) {
  if (framePreviewTimeoutId) {
    clearTimeout(framePreviewTimeoutId);
    framePreviewTimeoutId = null;
  }
  activeFramePreviewType = type;
  if (type === 'none') {
    stopFrameTransitionPreview();
    return;
  }

  const activeIdx = state.frames.findIndex(f => f.id === state.activeFrameId);
  if (activeIdx < 0) return;
  if (activeIdx === 0 && !state.loopAd) return;
  const prevFrameId = activeIdx === 0
    ? state.frames[state.frames.length - 1].id
    : state.frames[activeIdx - 1].id;
  const nextFrameId = state.activeFrameId;

  const runCycle = () => {
    if (activeFramePreviewType !== type) return;

    const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
    if (!currentFrame) return;

    const duration = currentFrame.transitionDuration !== undefined ? currentFrame.transitionDuration : 0.5;
    const fade = currentFrame.transitionFade !== false;
    const bounce = !!currentFrame.transitionBounce;
    const zoomFrom = currentFrame.transitionZoomFrom !== undefined ? currentFrame.transitionZoomFrom : 80;
    const angle = currentFrame.transitionAngle !== undefined ? currentFrame.transitionAngle : 0;
    const irisShape = currentFrame.transitionIrisShape || 'circle';
    const irisOrigin = currentFrame.transitionIrisOrigin || 'center';
    const blurAmount = currentFrame.transitionBlurAmount !== undefined ? currentFrame.transitionBlurAmount : 20;
    const blurScaleVal = currentFrame.transitionBlurScale !== undefined ? currentFrame.transitionBlurScale : 100;
    const blurScale = blurScaleVal / 100;

    const activeOverlays = [];

    state.canvases.forEach(c => {
      const canvasDom = document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"] .canvas`);
      if (!canvasDom) return;

      let dir = currentFrame.transitionDirection || (type.startsWith('slide-') ? type.replace('slide-', '') : (type.startsWith('swipe-') ? type.replace('swipe-', '') : 'left'));
      if (dir === 'short' || dir === 'long') {
        const isShort = dir === 'short';
        if (c.width > c.height) {
          dir = isShort ? 'up' : 'left';
        } else if (c.width < c.height) {
          dir = isShort ? 'left' : 'up';
        } else {
          dir = isShort ? 'up' : 'left';
        }
      }

      let overlay = canvasDom.querySelector('.frame-transition-preview-overlay');
      if (overlay) overlay.remove();

      overlay = document.createElement('div');
      overlay.className = 'frame-transition-preview-overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '1000';
      overlay.style.pointerEvents = 'none';
      overlay.style.overflow = 'hidden';
      overlay.style.perspective = '1200px';

      const excludePers = !!currentFrame.excludePersistent;

      const prevContainer = document.createElement('div');
      prevContainer.style.position = 'absolute';
      prevContainer.style.inset = '0';
      prevContainer.style.background = getCanvasBg(c, prevFrameId);
      prevContainer.style.zIndex = '1';

      const prevBot = document.createElement('div'); prevBot.style.position = 'absolute'; prevBot.style.inset = '0'; prevBot.style.zIndex = '1';
      const prevMid = document.createElement('div'); prevMid.style.position = 'absolute'; prevMid.style.inset = '0'; prevMid.style.zIndex = '2';
      const prevTop = document.createElement('div'); prevTop.style.position = 'absolute'; prevTop.style.inset = '0'; prevTop.style.zIndex = '3';
      prevContainer.appendChild(prevBot);
      prevContainer.appendChild(prevMid);
      prevContainer.appendChild(prevTop);

      c.elements.forEach(el => {
        if (el.persistent === 'bottom') {
          if (!excludePers) prevBot.appendChild(elementNode(el, c));
        }
        else if (el.persistent === 'top') {
          if (!excludePers) prevTop.appendChild(elementNode(el, c));
        }
        else if (el.frameId === prevFrameId) prevMid.appendChild(elementNode(el, c));
      });
      overlay.appendChild(prevContainer);

      const nextContainer = document.createElement('div');
      nextContainer.style.position = 'absolute';
      nextContainer.style.inset = '0';
      nextContainer.style.background = getCanvasBg(c, nextFrameId);
      nextContainer.style.zIndex = '2';

      const nextBot = document.createElement('div'); nextBot.style.position = 'absolute'; nextBot.style.inset = '0'; nextBot.style.zIndex = '1';
      const nextMid = document.createElement('div'); nextMid.style.position = 'absolute'; nextMid.style.inset = '0'; nextMid.style.zIndex = '2';
      const nextTop = document.createElement('div'); nextTop.style.position = 'absolute'; nextTop.style.inset = '0'; nextTop.style.zIndex = '3';
      nextContainer.appendChild(nextBot);
      nextContainer.appendChild(nextMid);
      nextContainer.appendChild(nextTop);

      c.elements.forEach(el => {
        if (el.persistent === 'bottom') {
          if (!excludePers) nextBot.appendChild(elementNode(el, c));
        }
        else if (el.persistent === 'top') {
          if (!excludePers) nextTop.appendChild(elementNode(el, c));
        }
        else if (el.frameId === nextFrameId) nextMid.appendChild(elementNode(el, c));
      });
      overlay.appendChild(nextContainer);

      if (excludePers) {
        const staticBot = document.createElement('div');
        staticBot.style.position = 'absolute';
        staticBot.style.inset = '0';
        staticBot.style.zIndex = '0';
        c.elements.forEach(el => {
          if (el.persistent === 'bottom') staticBot.appendChild(elementNode(el, c));
        });
        overlay.appendChild(staticBot);

        const staticTop = document.createElement('div');
        staticTop.style.position = 'absolute';
        staticTop.style.inset = '0';
        staticTop.style.zIndex = '3';
        c.elements.forEach(el => {
          if (el.persistent === 'top') staticTop.appendChild(elementNode(el, c));
        });
        overlay.appendChild(staticTop);
      }

      canvasDom.appendChild(overlay);
      nextContainer.style.display = 'none';

      activeOverlays.push({ prevContainer, nextContainer, canvas: c, dir });
    });

    framePreviewTimeoutId = setTimeout(() => {
      if (activeFramePreviewType !== type) return;

      let keyframesText = '';

      activeOverlays.forEach(({ prevContainer, nextContainer, canvas, dir }) => {
        nextContainer.style.display = 'block';

        const animName = `preview-frame-trans-${canvas.id}-${Date.now()}`;
        const animNameOut = `preview-frame-trans-out-${canvas.id}-${Date.now()}`;
        let keyframes = '';
        let keyframesOut = '';

        if (type === 'iris') {
          const feather = false;
          if (feather) {
            nextContainer.style.webkitMaskRepeat = 'no-repeat';
            nextContainer.style.maskRepeat = 'no-repeat';
            nextContainer.style.webkitMaskSize = '100% 100%';
            nextContainer.style.maskSize = '100% 100%';
          }
        }

        if (type === 'fade') {
          keyframes = `@keyframes ${animName} { from { opacity: 0; } to { opacity: 1; } }`;
        } else if (type === 'slide' || type === 'push') {
          let transformFrom = '';
          let transformToOut = '';
          if (dir === 'up') { transformFrom = 'translateY(100%)'; transformToOut = 'translateY(-100%)'; }
          else if (dir === 'down') { transformFrom = 'translateY(-100%)'; transformToOut = 'translateY(100%)'; }
          else if (dir === 'left') { transformFrom = 'translateX(100%)'; transformToOut = 'translateX(-100%)'; }
          else if (dir === 'right') { transformFrom = 'translateX(-100%)'; transformToOut = 'translateX(100%)'; }

          if (bounce) {
            keyframes = `@keyframes ${animName} {\n`;
            const d = 4.0;
            const freq = 2.0;
            for (let pct = 0; pct <= 100; pct += 5) {
              const t = pct / 100;
              const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * freq * t);
              const currentDist = (100 * x).toFixed(2);
              let transformStr = '';
              if (dir === 'up') transformStr = `transform: translateY(${currentDist}%);`;
              else if (dir === 'down') transformStr = `transform: translateY(${-currentDist}%);`;
              else if (dir === 'left') transformStr = `transform: translateX(${currentDist}%);`;
              else if (dir === 'right') transformStr = `transform: translateX(${-currentDist}%);`;
              
              let opacityStr = '';
              if (fade) {
                if (pct === 0) opacityStr = 'opacity: 0; ';
                else if (pct >= 30) opacityStr = 'opacity: 1; ';
                else {
                  const opt = (t / 0.3).toFixed(2);
                  opacityStr = `opacity: ${opt}; `;
                }
              }
              keyframes += `      ${pct}% { ${transformStr} ${opacityStr}}\n`;
            }
            keyframes += '    }';
          } else {
            keyframes = `@keyframes ${animName} {
              from { transform: ${transformFrom}; ${fade ? 'opacity: 0;' : ''} }
              to { transform: translate(0); ${fade ? 'opacity: 1;' : ''} }
            }`;
          }

          if (type === 'push') {
            keyframesOut = `@keyframes ${animNameOut} {
              from { transform: translate(0); ${fade ? 'opacity: 1;' : ''} }
              to { transform: ${transformToOut}; ${fade ? 'opacity: 0;' : ''} }
            }`;
          }
        } else if (type === 'swipe') {
          const feather = false;
          if (feather) {
            let maskGrad = '';
            let maskSize = '';
            let posFrom = '';
            let posTo = '';
            
            if (dir === 'up') {
              maskGrad = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
              maskSize = '100% 300%';
              posFrom = '0 100%';
              posTo = '0 0';
            } else if (dir === 'down') {
              maskGrad = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
              maskSize = '100% 300%';
              posFrom = '0 100%';
              posTo = '0 0';
            } else if (dir === 'left') {
              maskGrad = 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
              maskSize = '300% 100%';
              posFrom = '100% 0';
              posTo = '0 0';
            } else if (dir === 'right') {
              maskGrad = 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
              maskSize = '300% 100%';
              posFrom = '100% 0';
              posTo = '0 0';
            }
            
            keyframes = `@keyframes ${animName} {
              from {
                -webkit-mask-image: ${maskGrad};
                mask-image: ${maskGrad};
                -webkit-mask-size: ${maskSize};
                mask-size: ${maskSize};
                -webkit-mask-position: ${posFrom};
                mask-position: ${posFrom};
              }
              to {
                -webkit-mask-image: ${maskGrad};
                mask-image: ${maskGrad};
                -webkit-mask-size: ${maskSize};
                mask-size: ${maskSize};
                -webkit-mask-position: ${posTo};
                mask-position: ${posTo};
              }
            }`;
          } else {
            let clipFrom = '';
            if (dir === 'up') clipFrom = 'inset(100% 0 0 0)';
            else if (dir === 'down') clipFrom = 'inset(0 0 100% 0)';
            else if (dir === 'left') clipFrom = 'inset(0 0 0 100%)';
            else if (dir === 'right') clipFrom = 'inset(0 100% 0 0)';
            
            keyframes = `@keyframes ${animName} {
              from { clip-path: ${clipFrom}; ${fade ? 'opacity: 0;' : ''} }
              to { clip-path: inset(0 0 0 0); ${fade ? 'opacity: 1;' : ''} }
            }`;
          }
        } else if (type === 'zoom') {
          const zf = zoomFrom / 100;
          if (bounce) {
            keyframes = `@keyframes ${animName} {\n`;
            const d = 4.0;
            const freq = 2.0;
            for (let pct = 0; pct <= 100; pct += 5) {
              const t = pct / 100;
              const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * freq * t);
              const scale = (1.0 + (zf - 1.0) * x).toFixed(3);
              
              let opacityStr = '';
              if (fade) {
                if (pct === 0) opacityStr = 'opacity: 0; ';
                else if (pct >= 30) opacityStr = 'opacity: 1; ';
                else {
                  const opt = (t / 0.3).toFixed(2);
                  opacityStr = `opacity: ${opt}; `;
                }
              }
              keyframes += `      ${pct}% { transform: scale(${scale}); ${opacityStr}}\n`;
            }
            keyframes += '    }';
          } else {
            keyframes = `@keyframes ${animName} {
              from { transform: scale(${zf}); ${fade ? 'opacity: 0;' : ''} }
              to { transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
            }`;
          }
        } else if (type === 'split') {
          const resolvedAngle = (dir === 'left' || dir === 'right') ? 90 : 0;
          const fromPoly = getSplitClipPath(resolvedAngle);
          keyframes = `@keyframes ${animName} {
            from { clip-path: ${fromPoly}; ${fade ? 'opacity: 0;' : ''} }
            to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); ${fade ? 'opacity: 1;' : ''} }
          }`;
        } else if (type === 'blur') {
          keyframes = `@keyframes ${animName} {
            from { filter: blur(${blurAmount}px); transform: scale(${blurScale}); ${fade ? 'opacity: 0;' : ''} }
            to { filter: blur(0px); transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
          }`;
          keyframesOut = `@keyframes ${animNameOut} {
            from { filter: blur(0px); transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
            to { filter: blur(${blurAmount}px); transform: scale(${2 - blurScale}); ${fade ? 'opacity: 0;' : ''} }
          }`;
        } else if (type === 'iris') {
          let originCoords = '50% 50%';
          if (irisOrigin === 'top-left') originCoords = '0% 0%';
          else if (irisOrigin === 'top-right') originCoords = '100% 0%';
          else if (irisOrigin === 'bottom-left') originCoords = '0% 100%';
          else if (irisOrigin === 'bottom-right') originCoords = '100% 100%';

          const feather = false;

          if (feather) {
            keyframes = `@keyframes ${animName} {\n`;
            for (let pct = 0; pct <= 100; pct += 5) {
              const t = pct / 100;
              const opacityStr = fade ? `opacity: ${t};` : '';
              const r1 = -30 * (1 - t) + 150 * t;
              const r2 = r1 + 30;
              const grad = `radial-gradient(circle at ${originCoords}, rgba(0,0,0,1) ${r1.toFixed(1)}%, rgba(0,0,0,0) ${r2.toFixed(1)}%)`;
              keyframes += `      ${pct}% {
                -webkit-mask-image: ${grad};
                mask-image: ${grad};
                ${opacityStr}
              }\n`;
            }
            keyframes += '    }';
          } else if (irisShape === 'rmit-pixel') {
            const W = canvas.width;
            const H = canvas.height;
            let ox = W / 2;
            let oy = H / 2;
            if (irisOrigin === 'top-left') { ox = 0; oy = 0; }
            else if (irisOrigin === 'top-right') { ox = W; oy = 0; }
            else if (irisOrigin === 'bottom-left') { ox = 0; oy = H; }
            else if (irisOrigin === 'bottom-right') { ox = W; oy = H; }

            const maxDist = Math.max(
              Math.hypot(ox - 0, oy - 0),
              Math.hypot(ox - W, oy - 0),
              Math.hypot(ox - 0, oy - H),
              Math.hypot(ox - W, oy - H)
            );
            const sMax = maxDist / 200;

            keyframes = `@keyframes ${animName} {\n`;
            for (let pct = 0; pct <= 100; pct += 5) {
              const t = pct / 100;
              const s = sMax * t;
              const tx = ox - 289.26 * s;
              const ty = oy - 278.38 * s;
              const cp = `path('${_buildPixelClipPath(s, s, tx, ty, 0, 0, 0)}')`;
              const opacityStr = fade ? `opacity: ${t};` : '';
              keyframes += `      ${pct}% {
                -webkit-clip-path: ${cp};
                clip-path: ${cp};
                ${opacityStr}
              }\n`;
            }
            keyframes += '    }';
          } else {
            let fromClip = '';
            let toClip = '';

            if (irisShape === 'circle') {
              fromClip = `circle(0% at ${originCoords})`;
              toClip = `circle(150% at ${originCoords})`;
            } else if (irisShape === 'square') {
              if (irisOrigin === 'center') {
                fromClip = 'inset(50%)';
                toClip = 'inset(0%)';
              } else if (irisOrigin === 'top-left') {
                fromClip = 'inset(0% 100% 100% 0%)';
                toClip = 'inset(0%)';
              } else if (irisOrigin === 'top-right') {
                fromClip = 'inset(0% 0% 100% 100%)';
                toClip = 'inset(0%)';
              } else if (irisOrigin === 'bottom-left') {
                fromClip = 'inset(100% 100% 0% 0%)';
                toClip = 'inset(0%)';
              } else if (irisOrigin === 'bottom-right') {
                fromClip = 'inset(100% 0% 0% 100%)';
                toClip = 'inset(0%)';
              }
            } else if (irisShape === 'diamond') {
              if (irisOrigin === 'center') {
                fromClip = 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)';
                toClip = 'polygon(50% -100%, 200% 50%, 50% 200%, -100% 50%)';
              } else if (irisOrigin === 'top-left') {
                fromClip = 'polygon(0% 0%, 0% 0%, 0% 0%)';
                toClip = 'polygon(0% 0%, 250% 0%, 0% 250%)';
              } else if (irisOrigin === 'top-right') {
                fromClip = 'polygon(100% 0%, 100% 0%, 100% 0%)';
                toClip = 'polygon(100% 0%, -150% 0%, 100% 250%)';
              } else if (irisOrigin === 'bottom-left') {
                fromClip = 'polygon(0% 100%, 0% 100%, 0% 100%)';
                toClip = 'polygon(0% 100%, 250% 100%, 0% -150%)';
              } else if (irisOrigin === 'bottom-right') {
                fromClip = 'polygon(100% 100%, 100% 100%, 100% 100%)';
                toClip = 'polygon(100% 100%, -150% 100%, 100% -150%)';
              }
            }

            keyframes = `@keyframes ${animName} {
              from { clip-path: ${fromClip}; ${fade ? 'opacity: 0;' : ''} }
              to { clip-path: ${toClip}; ${fade ? 'opacity: 1;' : ''} }
            }`;
          }
        } else if (type === 'corner-fold') {
          const corner = dir || 'bottom-right';
          let origin = '100% 100%';
          let rotateAxis = '1, 1, 0';
          let shadowOffset = '-15px -15px 40px';
          let startClip = 'polygon(100% 100%, 100% 100%, 100% 100%, 100% 100%)';

          if (corner === 'bottom-left') {
            origin = '0% 100%';
            rotateAxis = '-1, 1, 0';
            shadowOffset = '15px -15px 40px';
            startClip = 'polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)';
          } else if (corner === 'top-right') {
            origin = '100% 0%';
            rotateAxis = '1, -1, 0';
            shadowOffset = '-15px 15px 40px';
            startClip = 'polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)';
          } else if (corner === 'top-left') {
            origin = '0% 0%';
            rotateAxis = '-1, -1, 0';
            shadowOffset = '15px 15px 40px';
            startClip = 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)';
          }

          keyframes = `@keyframes ${animName} {
            0% {
              transform-origin: ${origin};
              clip-path: ${startClip};
              transform: rotate3d(${rotateAxis}, 45deg);
              box-shadow: 0 0 0 rgba(0,0,0,0);
              ${fade ? 'opacity: 0;' : ''}
            }
            40% {
              transform-origin: ${origin};
              box-shadow: ${shadowOffset} rgba(0,0,0,0.3);
              ${fade ? 'opacity: 1;' : ''}
            }
            100% {
              transform-origin: ${origin};
              clip-path: polygon(-50% -50%, 150% -50%, 150% 150%, -50% 150%);
              transform: rotate3d(0, 0, 0, 0deg);
              box-shadow: 0 0 0 rgba(0,0,0,0);
              ${fade ? 'opacity: 1;' : ''}
            }
          }`;
        }

        keyframesText += keyframes + '\n' + (keyframesOut || '') + '\n';

        const timingFunc = type === 'iris' ? 'ease-in-out' : 'ease';
        if (keyframesOut) {
          prevContainer.style.animation = `${animNameOut} ${duration}s ${timingFunc} both`;
        }
        nextContainer.style.animation = `${animName} ${duration}s ${timingFunc} both`;
      });

      let styleEl = document.getElementById('frame-transition-preview-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'frame-transition-preview-styles';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = keyframesText;

      framePreviewTimeoutId = setTimeout(() => {
        if (activeFramePreviewType === type) {
          runCycle();
        }
      }, (duration + 1.5) * 1000);

    }, 50);
  };

  runCycle();
}

function updateRunningFrameTransitionPreview() {
  if (activeFramePreviewType) {
    startFrameTransitionPreview(activeFramePreviewType);
  }
}

function stopFrameTransitionPreview() {
  activeFramePreviewType = null;
  if (framePreviewTimeoutId) {
    clearTimeout(framePreviewTimeoutId);
    framePreviewTimeoutId = null;
  }
  state.canvases.forEach(c => {
    const canvasDom = document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"] .canvas`);
    if (canvasDom) {
      const overlay = canvasDom.querySelector('.frame-transition-preview-overlay');
      if (overlay) overlay.remove();
    }
  });
  const styleEl = document.getElementById('frame-transition-preview-styles');
  if (styleEl) styleEl.remove();
}

function customSelect(key, options, currentVal, title, isFrameTrans = false, frameTransId = '', favCategory = '') {
  const currentOpt = options.find(o => o.val === currentVal) || options[0];
  const dropdownItems = options.map(opt => {
    let favHtml = '';
    if (favCategory && opt.val !== 'none') {
      const favKey = favCategory + opt.val;
      const isFav = state.favoriteAnimations?.includes(favKey);
      const starColor = isFav ? 'var(--accent-base)' : 'var(--text-muted)';
      const starFill = isFav ? 'var(--accent-base)' : 'var(--text-muted)';
      favHtml = `<svg class="fav-star-icon" data-fav-key="${favKey}" width="14" height="14" viewBox="0 0 24 24" fill="${starFill}" stroke="${starColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: auto; flex-shrink: 0; padding: 1px; border-radius: 3px; cursor: pointer; opacity: 1; transition: all 0.2s;" title="Toggle favorite"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }
    let itemTitle = opt.label;
    if (favCategory) {
      const descKey = favCategory + opt.val;
      const desc = PRESET_DESCRIPTIONS[descKey];
      if (desc) {
        let prefix = '';
        if (favCategory === 'in-') prefix = 'Animation';
        else if (favCategory === 'eff-') prefix = 'Effect';
        else if (favCategory === 'frame-') prefix = 'Transition';
        itemTitle = `${prefix}: ${opt.label}\n\n${desc}`;
      }
    }

    return `
    <div class="custom-select-item" data-value="${opt.val}" style="padding: 5px 8px; font-size: 11px; color: var(--text-main); cursor: pointer; transition: background 0.1s; display: flex; align-items: center; gap: 8px;" title="${itemTitle}">
      ${opt.img ? `<img src="${opt.img}" style="max-height: 18px; max-width: 40px; object-fit: contain; flex-shrink: 0; background: #475569; padding: 2px 4px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15);" />` : ''}
      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; ${opt.badge ? '' : 'flex: 1;'}">${opt.label}</span>
      ${opt.badge ? `<span class="preset-badge" style="margin-right: auto;">${opt.badge}</span>` : ''}
      ${favHtml}
    </div>
  `}).join('');

  const containerIdHtml = frameTransId ? `id="${frameTransId}"` : '';
  const dataKeyAttr = isFrameTrans ? `data-frame-k="${key}"` : `data-k="${key}"`;
  const isMainPreset = key === 'animType' || key === 'effectType' || key === 'transition' || key === 'exitType';
  const borderStyle = isMainPreset ? 'border: 1.5px solid var(--accent-base);' : 'border: 1px solid var(--border-light);';
  const extraTriggerClass = isMainPreset ? 'preset-select-trigger' : '';

  return `
    <div class="custom-select-container ${isFrameTrans ? 'frame-trans-select' : ''}" ${dataKeyAttr} ${containerIdHtml} style="position: relative; width: 100%;">
      <button class="custom-select-trigger ${extraTriggerClass}" title="${title}" style="width: 100%; display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); ${borderStyle} color: var(--text-main); border-radius: 6px; padding: 4px 6px; font-size: 11px; height: 24px; text-align: left; cursor: pointer; outline: none; min-width: 0;">
        <span class="custom-select-label" style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; white-space: nowrap; flex: 1;">
          ${currentOpt.img ? `<img src="${currentOpt.img}" style="max-height: 16px; max-width: 36px; object-fit: contain; flex-shrink: 0; background: #475569; padding: 2px 3px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15);" />` : ''}
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1;">${currentOpt.label}</span>
        </span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 4px; opacity: 0.7; pointer-events: none; flex-shrink: 0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="custom-select-dropdown" style="display: none; position: absolute; top: 26px; left: 0; right: 0; background: var(--bg-panel); border: 1px solid var(--border-light); border-radius: 6px; z-index: 10000; box-shadow: 0 8px 24px var(--shadow-medium); max-height: 200px; overflow-y: auto; padding: 4px 0;">
        ${dropdownItems}
      </div>
    </div>
  `;
}

function getFrameTransitionHtml(currentFrame) {
  // Unset transition exports as 'fade' (see generateExportHTML), so show 'Fade' —
  // not 'None' — for an unconfigured frame, keeping the panel and the TRANS toggle
  // consistent with what actually plays.
  let tType = currentFrame.transition || 'fade';
  let activePreset = 'none';
  if (tType === 'fade') activePreset = 'fade';
  else if (tType === 'slide') activePreset = 'slide';
  else if (tType === 'push') activePreset = 'push';
  else if (tType === 'swipe') activePreset = 'swipe';
  else if (tType === 'zoom') activePreset = 'zoom';
  else if (tType === 'split') activePreset = 'split';
  else if (tType === 'iris') activePreset = 'iris';
  else if (tType === 'blur') activePreset = 'blur';
  else if (tType === 'corner-fold') activePreset = 'corner-fold';

  const presets = [
    { val: 'none', label: 'None' },
    { val: 'fade', label: 'Fade' },
    { val: 'slide', label: 'Slide' },
    { val: 'push', label: 'Push' },
    { val: 'swipe', label: 'Swipe' },
    { val: 'zoom', label: 'Zoom' },
    { val: 'split', label: 'Split' },
    { val: 'iris', label: 'Iris' },
    { val: 'blur', label: 'Blur' },
    { val: 'corner-fold', label: 'Corner Fold' }
  ];

  let filteredPresets = presets;
  let favMessageHtml = '';
  if (state.filterFavorites) {
    filteredPresets = presets.filter(o => o.val === 'none' || state.favoriteAnimations?.includes('frame-' + o.val));
    if (filteredPresets.length <= 1) {
      favMessageHtml = `<div style="grid-column: span 3; font-size: 10px; color: var(--text-muted); line-height: 1.4; padding: 4px 0; text-align: center;">
        No favorite transitions. Click the star icon next to presets in the dropdown to add to favorites.
      </div>`;
    }
  }

  const presetButtons = filteredPresets.map(o => {
    const isActive = o.val === activePreset;
    const isFav = state.favoriteAnimations?.includes('frame-' + o.val);
    const favStyle = isFav ? 'outline: 1px solid var(--accent-base); outline-offset: -1px;' : '';
    return `<button class="align-btn frame-trans-btn ${isActive ? 'active' : ''}" data-val="${o.val}" style="font-size:10px; ${favStyle}" title="Transition: ${o.label}">${o.label}</button>`;
  }).join('');

  const durVal = currentFrame.transitionDuration !== undefined ? currentFrame.transitionDuration : 0.5;
  const durHtml = `<div class="prop-row" style="margin:0;"><label>Duration (s)</label><input type="number" step="0.1" id="frame-trans-duration" value="${durVal}" min="0.1" /></div>`;

  const showFade = ['slide', 'push', 'swipe', 'zoom', 'split', 'iris', 'blur', 'corner-fold'].includes(activePreset);
  const showFeather = false;
  let fadeToggleHtml = '';
  let featherToggleHtml = '';

  if (showFade) {
    const isFeathered = showFeather && !!currentFrame.transitionFeather;
    const resolvedFade = isFeathered ? false : (currentFrame.transitionFade !== false);
    const fadeDisabledAttr = isFeathered ? 'disabled' : '';
    const fadeOpacityStyle = isFeathered ? 'opacity: 0.5; pointer-events: none;' : '';

    fadeToggleHtml = `
      <div class="checkbox-row" style="height:24px; align-items:center; margin-top:14px; ${fadeOpacityStyle}">
        <input type="checkbox" id="frame-trans-fade" ${resolvedFade ? 'checked' : ''} ${fadeDisabledAttr} />
        <label for="frame-trans-fade" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
      </div>
    `;
  }

  if (showFeather) {
    const resolvedFeather = !!currentFrame.transitionFeather;
    featherToggleHtml = `
      <div class="checkbox-row" style="height:24px; align-items:center; margin-top:14px;">
        <input type="checkbox" id="frame-trans-feather" ${resolvedFeather ? 'checked' : ''} />
        <label for="frame-trans-feather" style="cursor:pointer; font-size:11px; white-space:nowrap;">Feather</label>
      </div>
    `;
  }

  const gridCols = (showFade && showFeather) ? 'grid-template-columns: 1.2fr 0.9fr 0.9fr;' : 'grid-template-columns: 1fr 1fr;';

  const standardProps = `
    <div class="prop-row" style="margin-bottom:8px;">
      <div style="display:grid; ${gridCols} gap:8px;">
        ${durHtml}
        ${fadeToggleHtml}
        ${featherToggleHtml}
      </div>
    </div>
  `;

  const excludePersVal = !!currentFrame.excludePersistent;
  const excludePersHtml = `
    <div class="prop-row" style="margin-bottom:8px;">
      <div class="checkbox-row" style="height:24px; align-items:center;">
        <input type="checkbox" id="frame-trans-exclude-persistent" ${excludePersVal ? 'checked' : ''} />
        <label for="frame-trans-exclude-persistent" style="cursor:pointer; font-size:11px;" title="Exclude persistent layers from frame transitions">Exclude persistent layers</label>
      </div>
    </div>
  `;

  let conditionalControls = '';
  if (activePreset === 'slide' || activePreset === 'push' || activePreset === 'swipe' || activePreset === 'split') {
    const currentDir = currentFrame.transitionDirection || 'left';
    let bounceHtml = '';
    if (activePreset === 'slide' || activePreset === 'push') {
      const hasBounce = !!currentFrame.transitionBounce;
      bounceHtml = `
        <div class="checkbox-row" style="height:24px; align-items:center; margin-top:14px;">
          <input type="checkbox" id="frame-trans-bounce" ${hasBounce ? 'checked' : ''} />
          <label for="frame-trans-bounce" style="cursor:pointer; font-size:11px; white-space:nowrap;">Bounce</label>
        </div>
      `;
    }
    conditionalControls = `
      <div class="prop-row" style="margin-bottom:8px;">
        <div class="prop-grid-2">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Direction</label>
            ${customSelect('direction', [
              { val: 'left', label: 'Left' },
              { val: 'right', label: 'Right' },
              { val: 'up', label: 'Up' },
              { val: 'down', label: 'Down' },
              { val: 'short', label: 'Short edge' },
              { val: 'long', label: 'Long edge' }
            ], currentDir, 'Transition direction', true, 'frame-trans-direction')}
          </div>
          ${bounceHtml}
        </div>
      </div>
    `;
  } else if (activePreset === 'zoom') {
    const zfVal = currentFrame.transitionZoomFrom !== undefined ? currentFrame.transitionZoomFrom : 80;
    const hasBounce = !!currentFrame.transitionBounce;
    conditionalControls = `
      <div class="prop-row" style="margin-bottom:8px;">
        <div class="prop-grid-2">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Zoom From (%)</label>
            <input type="number" min="0" max="500" id="frame-trans-zoom-from" value="${zfVal}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" />
          </div>
          <div class="checkbox-row" style="height:24px; align-items:center; margin-top:14px;">
            <input type="checkbox" id="frame-trans-bounce" ${hasBounce ? 'checked' : ''} />
            <label for="frame-trans-bounce" style="cursor:pointer; font-size:11px; white-space:nowrap;">Bounce</label>
          </div>
        </div>
      </div>
    `;
  } else if (activePreset === 'iris') {
    const currentShape = currentFrame.transitionIrisShape || 'circle';
    const currentOrigin = currentFrame.transitionIrisOrigin || 'center';
    conditionalControls = `
      <div class="prop-row" style="margin-bottom:8px;">
        <div class="prop-grid-2">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Shape</label>
            ${customSelect('irisShape', [
              { val: 'circle', label: 'Circle' },
              { val: 'square', label: 'Square' },
              { val: 'diamond', label: 'Diamond' },
              { val: 'rmit-pixel', label: 'RMIT Pixel' }
            ], currentShape, 'Iris Shape', true, 'frame-trans-iris-shape')}
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Origin</label>
            ${customSelect('irisOrigin', [
              { val: 'center', label: 'Center' },
              { val: 'top-left', label: 'Top-Left' },
              { val: 'top-right', label: 'Top-Right' },
              { val: 'bottom-left', label: 'Bottom-Left' },
              { val: 'bottom-right', label: 'Bottom-Right' }
            ], currentOrigin, 'Iris Origin', true, 'frame-trans-iris-origin')}
          </div>
        </div>
      </div>
    `;
  } else if (activePreset === 'blur') {
    const blurAmount = currentFrame.transitionBlurAmount !== undefined ? currentFrame.transitionBlurAmount : 20;
    const blurScale = currentFrame.transitionBlurScale !== undefined ? currentFrame.transitionBlurScale : 100;
    conditionalControls = `
      <div class="prop-row" style="margin-bottom:8px;">
        <div class="prop-grid-2">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Blur Amount (px)</label>
            <input type="number" min="0" max="100" id="frame-trans-blur-amount" value="${blurAmount}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Scale Blend (%)</label>
            <input type="number" min="10" max="500" id="frame-trans-blur-scale" value="${blurScale}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" />
          </div>
        </div>
      </div>
    `;
  } else if (activePreset === 'corner-fold') {
    const currentDir = currentFrame.transitionDirection || 'bottom-right';
    conditionalControls = `
      <div class="prop-row" style="margin-bottom:8px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label>Corner</label>
          ${customSelect('direction', [
            { val: 'bottom-right', label: 'Bottom-Right' },
            { val: 'bottom-left', label: 'Bottom-Left' },
            { val: 'top-right', label: 'Top-Right' },
            { val: 'top-left', label: 'Top-Left' }
          ], currentDir, 'Fold Corner', true, 'frame-trans-direction')}
        </div>
      </div>
    `;
  }

  return `
    <div id="frame-transition-preview-area" class="animation-sub-panel">
      <div class="prop-row" style="margin-bottom:6px;"><label class="anim-sub-head"><svg id="fi_11908101" width="12" height="12" viewBox="0 0 48 48" style="color: var(--accent-base); flex-shrink: 0;" fill="currentColor"><g transform="translate(-504 -648)"><g transform="scale(1.5)"><g id="SOLID" transform="scale(.667)"><g><path d="m511.861 693.334c-.902.713-2.133.848-3.168.347s-1.693-1.55-1.693-2.7v-37.963c0-1.15.657-2.199 1.693-2.7 1.035-.501 2.265-.366 3.167.347l24.005 18.976c.719.569 1.139 1.436 1.139 2.353 0 .918-.419 1.785-1.139 2.354z"></path></g><g><path d="m546 694h-3c-1.657 0-3-1.343-3-3v-38c0-1.657 1.343-3 3-3h3c1.657 0 3 1.343 3 3v38c0 1.657-1.343 3-3 3z"></path></g></g></g></g></svg>FRAME TRANSITION</label></div>
      <div style="margin-bottom:12px;">
        ${customSelect('transition', filteredPresets, activePreset, 'Select Frame Transition', true, 'frame-trans-select', 'frame-')}
        ${favMessageHtml}
      </div>
      ${activePreset !== 'none' ? excludePersHtml + standardProps + conditionalControls : ''}
    </div>
  `;
}

function wireFrameTransitionEvents() {
  const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
  if (!currentFrame) return;

  const durInp = propsEl.querySelector('#frame-trans-duration');
  if (durInp) {
    durInp.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    durInp.addEventListener('input', (e) => {
      currentFrame.transitionDuration = parseFloat(e.target.value) || 0.5;
      startFrameTransitionPreview(currentFrame.transition || 'none');
      render(true);
    });
    durInp.addEventListener('change', () => {
      pushHistory();
    });
  }

  const fadeChk = propsEl.querySelector('#frame-trans-fade');
  if (fadeChk) {
    fadeChk.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    fadeChk.addEventListener('change', (e) => {
      currentFrame.transitionFade = e.target.checked;
      pushHistory();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const featherChk = propsEl.querySelector('#frame-trans-feather');
  if (featherChk) {
    featherChk.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    featherChk.addEventListener('change', (e) => {
      currentFrame.transitionFeather = e.target.checked;
      if (currentFrame.transitionFeather) {
        currentFrame.transitionFade = false;
      }
      pushHistory();
      renderProps();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const exclPersChk = propsEl.querySelector('#frame-trans-exclude-persistent');
  if (exclPersChk) {
    exclPersChk.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    exclPersChk.addEventListener('change', (e) => {
      currentFrame.excludePersistent = e.target.checked;
      pushHistory();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const dirSelect = propsEl.querySelector('#frame-trans-direction');
  if (dirSelect) {
    dirSelect.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    dirSelect.addEventListener('change', (e) => {
      currentFrame.transitionDirection = e.target.value;
      pushHistory();
      renderProps();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const bounceChk = propsEl.querySelector('#frame-trans-bounce');
  if (bounceChk) {
    bounceChk.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    bounceChk.addEventListener('change', (e) => {
      currentFrame.transitionBounce = e.target.checked;
      pushHistory();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const zfInp = propsEl.querySelector('#frame-trans-zoom-from');
  if (zfInp) {
    zfInp.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    zfInp.addEventListener('input', (e) => {
      currentFrame.transitionZoomFrom = parseInt(e.target.value, 10) || 80;
      startFrameTransitionPreview(currentFrame.transition || 'none');
      render(true);
    });
    zfInp.addEventListener('change', () => {
      pushHistory();
    });
  }

  const angleInp = propsEl.querySelector('#frame-trans-angle');
  if (angleInp) {
    angleInp.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    angleInp.addEventListener('input', (e) => {
      currentFrame.transitionAngle = parseInt(e.target.value, 10) || 0;
      startFrameTransitionPreview(currentFrame.transition || 'none');
      render(true);
    });
    angleInp.addEventListener('change', () => {
      pushHistory();
    });
  }

  const shapeSelect = propsEl.querySelector('#frame-trans-iris-shape');
  if (shapeSelect) {
    shapeSelect.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    shapeSelect.addEventListener('change', (e) => {
      currentFrame.transitionIrisShape = e.target.value;
      pushHistory();
      renderProps();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const originSelect = propsEl.querySelector('#frame-trans-iris-origin');
  if (originSelect) {
    originSelect.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    originSelect.addEventListener('change', (e) => {
      currentFrame.transitionIrisOrigin = e.target.value;
      pushHistory();
      renderProps();
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
  }

  const blurAmtInp = propsEl.querySelector('#frame-trans-blur-amount');
  if (blurAmtInp) {
    blurAmtInp.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    blurAmtInp.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      currentFrame.transitionBlurAmount = isNaN(val) ? 20 : val;
      startFrameTransitionPreview(currentFrame.transition || 'none');
      render(true);
    });
    blurAmtInp.addEventListener('change', () => {
      pushHistory();
    });
  }

  const blurScaleInp = propsEl.querySelector('#frame-trans-blur-scale');
  if (blurScaleInp) {
    blurScaleInp.addEventListener('mouseenter', () => {
      startFrameTransitionPreview(currentFrame.transition || 'none');
    });
    blurScaleInp.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      currentFrame.transitionBlurScale = isNaN(val) ? 100 : val;
      startFrameTransitionPreview(currentFrame.transition || 'none');
      render(true);
    });
    blurScaleInp.addEventListener('change', () => {
      pushHistory();
    });
  }

  const area = propsEl.querySelector('#frame-transition-preview-area');
  if (area) {
    area.addEventListener('mouseleave', () => {
      stopFrameTransitionPreview();
    });
  }
}

// First-time defaults when an effect preset is chosen — shared by the props
// panel's dropdown and the sequencer's preset popover so both entry points
// initialise a preset identically.
function applyEffectPresetDefaults(el, val, updateProp) {
  if (val === 'pan') {
    if (el.panFromX === undefined && el.panFromY === undefined) {
      const dist = el.panDist !== undefined ? el.panDist : 50;
      if (el.panDir === 'L') { updateProp('panFromX', dist); updateProp('panFromY', 0); }
      else if (el.panDir === 'R') { updateProp('panFromX', -dist); updateProp('panFromY', 0); }
      else if (el.panDir === 'U') { updateProp('panFromX', 0); updateProp('panFromY', dist); }
      else if (el.panDir === 'D') { updateProp('panFromX', 0); updateProp('panFromY', -dist); }
      else { updateProp('panFromX', 0); updateProp('panFromY', -50); }
    }
    if (el.effDuration === undefined) updateProp('effDuration', 5);
    if (el.effOnce === undefined) updateProp('effOnce', true);
  } else if (val === 'zoom') {
    if (el.zoomTarget === undefined) updateProp('zoomTarget', 150);
    if (el.effDuration === undefined) updateProp('effDuration', 5);
  } else if (val === 'spin') {
    if (el.spinTarget === undefined) updateProp('spinTarget', 360);
    if (el.spinRepeat === undefined) updateProp('spinRepeat', 1);
    if (el.effDuration === undefined) updateProp('effDuration', 2);
    if (el.effEase === undefined) updateProp('effEase', true);
  } else if (val === 'pulse') {
    if (el.pulseScale === undefined) updateProp('pulseScale', 105);
    if (el.effSpeed === undefined) updateProp('effSpeed', 100);
  } else if (val === 'heartbeat') {
    if (el.heartbeatScale === undefined) updateProp('heartbeatScale', 130);
    if (el.effSpeed === undefined) updateProp('effSpeed', 100);
  } else if (val === 'float') {
    if (el.floatRange === undefined) updateProp('floatRange', 10);
    if (el.floatDirection === undefined) updateProp('floatDirection', 'up');
    if (el.effSpeed === undefined) updateProp('effSpeed', 100);
  } else if (val !== 'none') {
    if (el.effSpeed === undefined) updateProp('effSpeed', 100);
  }
  if (val !== 'none' && el.effDelay === undefined) {
    updateProp('effDelay', 0);
  }
}

function wireCustomSelects(el, updateProp) {
  // Wire Custom Styled Select Dropdowns & Preview on Hover
  propsEl.querySelectorAll('.custom-select-trigger').forEach(trigger => {
    trigger.onclick = (e) => {
      e.stopPropagation();
      const container = trigger.closest('.custom-select-container');
      const dropdown = container.querySelector('.custom-select-dropdown');
      const isOpen = dropdown.style.display === 'block';
      propsEl.querySelectorAll('.custom-select-dropdown').forEach(d => {
        if (d !== dropdown) d.style.display = 'none';
      });
      dropdown.style.display = isOpen ? 'none' : 'block';
    };

    trigger.onmouseenter = () => {
      const container = trigger.closest('.custom-select-container');
      const dropdown = container.querySelector('.custom-select-dropdown');
      const isOpen = dropdown && dropdown.style.display === 'block';
      if (isOpen) return;

      const isFrame = container.classList.contains('frame-trans-select');
      const key = isFrame ? container.dataset.frameK : container.dataset.k;
      if (isFrame) {
        const activeIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
        if (activeIdx > 0 || (activeIdx === 0 && state.loopAd)) {
          startFrameTransitionPreview(state.frames[activeIdx].transition || 'none');
        }
      } else {
        if (el) {
          if (key === 'animDirection' || key === 'riseSplit') {
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'panDir') {
            hoverEffectPreviewActive = true;
            startEffectPreview(el);
          } else if (key === 'animType') {
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'effectType') {
            if (applyElementEffectPreviewFn) applyElementEffectPreviewFn(el.effectType || 'none');
          } else if ((key === 'exitType' || key === 'exitDirection') && el.exitEnabled) {
            if (startElementExitPreviewFn) startElementExitPreviewFn(el.exitType || 'fade-out');
          }
        }
      }
    };

    trigger.onmouseleave = () => {
      const container = trigger.closest('.custom-select-container');
      const dropdown = container.querySelector('.custom-select-dropdown');
      const isOpen = dropdown && dropdown.style.display === 'block';
      if (isOpen) return;

      const isFrame = container.classList.contains('frame-trans-select');
      const key = isFrame ? container.dataset.frameK : container.dataset.k;
      if (isFrame) {
        stopFrameTransitionPreview();
      } else {
        if (key === 'animDirection' || key === 'animType' || key === 'riseSplit') {
          if (stopElementAnimPreviewFn) stopElementAnimPreviewFn();
        } else if (key === 'panDir') {
          hoverEffectPreviewActive = false;
          if (stopElementEffectPreviewFn) stopElementEffectPreviewFn();
        } else if (key === 'effectType') {
          if (stopElementEffectPreviewFn) stopElementEffectPreviewFn();
        } else if (key === 'exitType' || key === 'exitDirection') {
          if (stopElementExitPreviewFn) stopElementExitPreviewFn();
        }
      }
    };
  });

  propsEl.querySelectorAll('.custom-select-item').forEach(item => {
    const container = item.closest('.custom-select-container');
    const isFrame = container.classList.contains('frame-trans-select');
    const key = isFrame ? container.dataset.frameK : container.dataset.k;
    const val = item.dataset.value;

    item.onclick = (e) => {
      e.stopPropagation();
      container.querySelector('.custom-select-label').textContent = item.textContent.trim();
      container.querySelector('.custom-select-dropdown').style.display = 'none';

      if (isFrame) {
        const activeIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
        if (activeIdx > 0 || (activeIdx === 0 && state.loopAd)) {
          const currentFrame = state.frames[activeIdx];
          if (key === 'direction') currentFrame.transitionDirection = val;
          else if (key === 'irisShape') currentFrame.transitionIrisShape = val;
          else if (key === 'irisOrigin') currentFrame.transitionIrisOrigin = val;
          else if (key === 'transition') {
            currentFrame.transition = val;
            if (val === 'slide' || val === 'push' || val === 'swipe' || val === 'split') {
              if (!currentFrame.transitionDirection) currentFrame.transitionDirection = 'left';
            }
            if (val === 'corner-fold') {
              if (!currentFrame.transitionDirection) currentFrame.transitionDirection = 'bottom-right';
            }
            if (val === 'zoom') {
              if (currentFrame.transitionZoomFrom === undefined) currentFrame.transitionZoomFrom = 80;
            }
            if (val === 'iris') {
              if (!currentFrame.transitionIrisShape) currentFrame.transitionIrisShape = 'circle';
              if (!currentFrame.transitionIrisOrigin) currentFrame.transitionIrisOrigin = 'center';
            }
            if (val === 'blur') {
              if (currentFrame.transitionBlurAmount === undefined) currentFrame.transitionBlurAmount = 20;
              if (currentFrame.transitionBlurScale === undefined) currentFrame.transitionBlurScale = 100;
            }
            render(true);
          }

          pushHistory();
          renderProps();
          startFrameTransitionPreview(currentFrame.transition || 'none');
        }
      } else {
        if (el) {
          if (key === 'animDirection') {
            if ((el.animType || '').startsWith('swipe-')) {
              updateProp('animType', `swipe-${val}`);
            } else {
              updateProp('animDirection', val);
            }
          } else if (key === 'animType') {
            let targetVal = val;
            if (targetVal === 'swipe') targetVal = 'swipe-right';
            updateProp('animType', targetVal);
            delete el.animationMode; // legacy field retired; IN is driven by animType
          } else if (key === 'effectType') {
            updateProp('effectType', val);
            applyEffectPresetDefaults(el, val, updateProp);
          } else {
            updateProp(key, val);
          }
          pushHistory();
          renderProps();
          if (key === 'animDirection' || key === 'riseSplit') {
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'animType') {
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'effectType') {
            if (applyElementEffectPreviewFn) applyElementEffectPreviewFn(el.effectType || 'none');
          } else if (key === 'panDir') {
            hoverEffectPreviewActive = true;
            startEffectPreview(el);
          } else if ((key === 'exitType' || key === 'exitDirection') && el.exitEnabled) {
            if (startElementExitPreviewFn) startElementExitPreviewFn(el.exitType || 'fade-out');
          }
        }
      }
    };

    item.onmouseenter = () => {
      if (isFrame) {
        const activeIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
        if (activeIdx > 0 || (activeIdx === 0 && state.loopAd)) {
          const currentFrame = state.frames[activeIdx];
          const origDirection = currentFrame.transitionDirection || 'left';
          const origShape = currentFrame.transitionIrisShape || 'circle';
          const origOrigin = currentFrame.transitionIrisOrigin || 'center';
          const origTransition = currentFrame.transition || 'none';

          if (key === 'direction') currentFrame.transitionDirection = val;
          else if (key === 'irisShape') currentFrame.transitionIrisShape = val;
          else if (key === 'irisOrigin') currentFrame.transitionIrisOrigin = val;
          else if (key === 'transition') currentFrame.transition = val;

          startFrameTransitionPreview(currentFrame.transition || 'none');

          item.onmouseleave = () => {
            if (key === 'direction') currentFrame.transitionDirection = origDirection;
            else if (key === 'irisShape') currentFrame.transitionIrisShape = origShape;
            else if (key === 'irisOrigin') currentFrame.transitionIrisOrigin = origOrigin;
            else if (key === 'transition') currentFrame.transition = origTransition;
            startFrameTransitionPreview(currentFrame.transition || 'none');
          };
        }
      } else {
        if (el) {
          const origType = el.animType;
          const origDirection = el.animDirection;
          const origPanDir = el.panDir;
          const origExitType = el.exitType;
          const origExitDirection = el.exitDirection;
          const origRiseSplit = el.riseSplit;

          if (key === 'riseSplit') {
            el.riseSplit = val;
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'animDirection') {
            if ((el.animType || '').startsWith('swipe-')) {
              el.animType = `swipe-${val}`;
            } else {
              el.animDirection = val;
            }
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
          } else if (key === 'panDir') {
            el.panDir = val;
            hoverEffectPreviewActive = true;
            startEffectPreview(el);
          } else if (key === 'animType') {
            let targetVal = val;
            if (targetVal === 'swipe') targetVal = 'swipe-right';
            if (startElementAnimPreviewFn) startElementAnimPreviewFn(targetVal);
          } else if (key === 'effectType') {
            if (applyElementEffectPreviewFn) applyElementEffectPreviewFn(val);
          } else if (key === 'exitType' && el.exitEnabled) {
            if (startElementExitPreviewFn) startElementExitPreviewFn(val);
          } else if (key === 'exitDirection' && el.exitEnabled) {
            el.exitDirection = val;
            if (startElementExitPreviewFn) startElementExitPreviewFn(el.exitType || 'fade-out');
          }

          item.onmouseleave = () => {
            el.animType = origType;
            el.animDirection = origDirection;
            el.panDir = origPanDir;
            el.exitType = origExitType;
            el.exitDirection = origExitDirection;
            if (origRiseSplit === undefined) delete el.riseSplit; else el.riseSplit = origRiseSplit;
            if (key === 'animDirection' || key === 'riseSplit') {
              if (startElementAnimPreviewFn) startElementAnimPreviewFn(el.animType || 'none');
            } else if (key === 'panDir') {
              hoverEffectPreviewActive = true;
              startEffectPreview(el);
            } else if (key === 'animType') {
              if (stopElementAnimPreviewFn) stopElementAnimPreviewFn();
            } else if (key === 'effectType') {
              if (stopElementEffectPreviewFn) stopElementEffectPreviewFn();
            } else if (key === 'exitType' || key === 'exitDirection') {
              if (el.exitEnabled && startElementExitPreviewFn) startElementExitPreviewFn(el.exitType || 'fade-out');
              else if (stopElementExitPreviewFn) stopElementExitPreviewFn();
            }
          };
        }
      }
    };
  });

  propsEl.querySelectorAll('.fav-star-icon').forEach(star => {
    star.onclick = (e) => {
      e.stopPropagation();
      const favKey = star.dataset.favKey;
      if (!state.favoriteAnimations) state.favoriteAnimations = [];
      const idx = state.favoriteAnimations.indexOf(favKey);
      if (idx > -1) {
        state.favoriteAnimations.splice(idx, 1);
        star.setAttribute('fill', 'var(--text-muted)');
        star.setAttribute('stroke', 'var(--text-muted)');
        star.style.opacity = '1';
      } else {
        state.favoriteAnimations.push(favKey);
        star.setAttribute('fill', 'var(--accent-base)');
        star.setAttribute('stroke', 'var(--accent-base)');
        star.style.opacity = '1';
      }
      pushHistory();
      
      const subPanel = star.closest('.animation-sub-panel');
      if (state.filterFavorites && subPanel) {
        setTimeout(() => renderProps(), 150);
      }
    };
  });

  if (!window.customSelectGlobalBound) {
    window.customSelectGlobalBound = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-dropdown').forEach(d => d.style.display = 'none');
    });
  }
}

function renderProps() {
  // Stale-closure guard: cleared on every pass, re-registered further down
  // only when a selected element's wiring (updateProp) is actually bound.
  activeUpdatePropFn = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let el = getSelectedElement();
  const c = getActiveCanvas();
  const getBgStyle = (val) => val && val.includes('gradient') ? val : val;

  if (!el && state.layerSelection?.length > 0 && c) {
    const selectedElements = c.elements.filter(e => state.layerSelection.includes(e.id));
    if (selectedElements.length > 0) {
      el = selectedElements.find(e => e.type === 'text') || selectedElements[0];
    }
  }

  // Hex-copy button helpers — used by every hex color input across the app.
  const HEX_COPY_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const hexCopyBtn = (k, disabled = false) => {
    const disabledAttr = disabled ? 'disabled' : '';
    const pointerEvents = disabled ? 'pointer-events:none; opacity:0.4;' : '';
    const style = `position:absolute; right:4px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; padding:2px; color:var(--text-muted); display:flex; align-items:center; ${pointerEvents}`;
    return `<button class="hex-copy" data-target-k="${k}" title="Copy hex" tabindex="-1" ${disabledAttr} style="${style}">${HEX_COPY_SVG}</button>`;
  };
  const hexInputBox = (key, value, inputId = '', disabled = false) => {
    const disabledAttr = disabled ? 'disabled' : '';
    const pointerEvents = disabled ? 'pointer-events:none; opacity:0.5;' : '';
    const containerStyle = `position:relative; flex:1; min-width:0; ${pointerEvents}`;
    const inputStyle = `width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 24px 4px 6px; font-size:11px; outline:none; text-transform:uppercase; ${pointerEvents}`;
    return `<div style="${containerStyle}"><input type="text" data-k="${key}" ${inputId ? `id="${inputId}"` : ''} value="${(value || '').replace(/^#/, '')}" title="Hex color code" ${disabledAttr} style="${inputStyle}" />${hexCopyBtn(key, disabled)}</div>`;
  };

  // ---- Dynamic Data (data-merge / versioning) ----
  let dynamicHtml = '';
  if (typeof dmFieldsForType === 'function') {
    const selectedElements = (state.layerSelection && c) ? c.elements.filter(e => state.layerSelection.includes(e.id)) : [];
    const isMulti = selectedElements.length > 1;
    const isGroup = isMulti && selectedElements[0].groupId && selectedElements.every(e => e.groupId === selectedElements[0].groupId);

    if (isMulti) {
      const headerText = isGroup ? 'Group' : 'Multiple elements';
      dynamicHtml = `<div class="panel-section highlighted" id="panel-section-dynamic-data" data-permanent="true">
        <h3 class="panel-header-collapsible" id="header-dynamic-data" style="cursor: pointer; user-select: none; color: var(--text-label);">
          <span class="dd-marquee" style="flex:1; min-width:0; overflow:hidden; white-space:nowrap;">Dynamic Data<span style="color:var(--text-main);">: ${headerText}</span></span>
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="flex-shrink:0; transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </h3>`;
      
      const checkboxRows = [];
      const dm = state.dataMerge;
      
      selectedElements.forEach(itemEl => {
        if (itemEl.isMask) return; // Skip masks
        const dmFields = dmFieldsForType(itemEl.type);
        if (!dmFields || !dmFields.length) return;
        
        const sk = dmSlotKey(itemEl);
        const itemLabel = layerLabelText(itemEl);
        const fieldRows = [];
        
        dmFields.forEach(field => {
          const on = !!(itemEl.dynamic && itemEl.dynamic[field]);
          const id = `dm-chk-${field}-${itemEl.id}`;
          const key = sk + '::' + field;
          const currentMapping = (dm && dm.mappings) ? (dm.mappings[key] || '') : '';
          const colOptions = ['<option value="">— none —</option>'].concat(
            (dm && dm.columns ? dm.columns : []).map(colName => `<option value="${esc(colName)}" ${colName === currentMapping ? 'selected' : ''}>${esc(colName)}</option>`)
          ).join('');
          
          const displayLabel = `${itemLabel} (${DM_FIELD_LABEL[field] || field})`;

          fieldRows.push(`
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; padding-left:8px; box-sizing:border-box;">
              <div class="checkbox-row" style="flex:1; min-width:0; display:flex; align-items:center; gap:8px; margin-right:4px;">
                <input type="checkbox" id="${id}" class="dm-control dm-field-chk" data-el-id="${itemEl.id}" data-dm-field="${field}" title="Toggle dynamic data binding for ${esc(displayLabel)}" ${on ? 'checked' : ''}/>
                <label for="${id}" title="Toggle dynamic data binding for ${esc(displayLabel)}" style="cursor:pointer; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-weight:500; color:var(--text-main); font-size:11px;">${esc(DM_FIELD_LABEL[field] || field)}</label>
              </div>
              <select class="dm-control dm-field-select" data-el-id="${itemEl.id}" data-dm-field="${field}" title="Column header map for ${esc(displayLabel)}" style="width:130px; flex-shrink:0; padding:3px 4px; font-size:11px; outline:none; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; font-family:inherit; transition:opacity 0.2s;" ${on ? '' : 'disabled'}>
                ${colOptions}
              </select>
            </div>
          `);
        });
        if (fieldRows.length > 0) {
          checkboxRows.push(`
            <div class="dd-layer-group" data-el-id="${itemEl.id}" style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px; width:100%;">
              <div style="font-size:10px; color:var(--text-muted); font-weight:600; line-height:1.2; text-transform:uppercase; letter-spacing:0.03em; padding-left:4px; word-break:break-word; overflow-wrap:anywhere;" title="${esc(itemLabel)}">${esc(itemLabel)}</div>
              <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
                ${fieldRows.join('')}
              </div>
            </div>
          `);
        }
      });
      
      if (checkboxRows.length > 0) {
        dynamicHtml += `<div class="prop-row" style="display:flex; flex-direction:column; gap:2px; margin-bottom:8px; width:100%;">${checkboxRows.join('')}</div>`;
      } else {
        dynamicHtml += `<div class="prop-row" style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">No dynamic fields available for selected layers.</div>`;
      }
      
      const anyLinked = selectedElements.some(e => e.linkGroupId);
      if (anyLinked) {
        dynamicHtml += `<div class="prop-row" style="font-size:10px;color:var(--text-accent);margin-top:4px;line-height:1.4;font-weight:500;">Linked element — these toggles apply to every size in the link group.</div>`;
      }
      dynamicHtml += `<button class="btn primary dm-control" id="dm-open-from-props" title="Open spreadsheet view to edit dynamic data and banner versions" style="margin-top:10px;width:100%;font-size:11px;">Data and Versions...</button>`;
      dynamicHtml += `</div>`;
    } else if (el && el.isMask) {
      // Masks don't participate in dynamic data — show a permanent notice.
      dynamicHtml = `<div class="panel-section highlighted" id="panel-section-dynamic-data" data-permanent="true">
        <h3 class="panel-header-collapsible" id="header-dynamic-data" style="cursor: pointer; user-select: none; color: var(--text-label);">
          <span>Dynamic Data</span>
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </h3>
        <div class="prop-row" style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">
          <b style="color:var(--text-accent);">Disabled while layer is a mask.</b><br>
          Right-click to toggle "Use as mask" off to bind data.
        </div>
        <button class="btn primary dm-control" id="dm-open-from-props" title="Open spreadsheet view to edit dynamic data and banner versions" style="width:100%;font-size:11px;">Data and Versions...</button>
      </div>`;
    } else if (el && dmFieldsForType(el.type).length) {
      const dmFields = dmFieldsForType(el.type);
      dynamicHtml = `<div class="panel-section highlighted" id="panel-section-dynamic-data" data-permanent="true">
        <h3 class="panel-header-collapsible" id="header-dynamic-data" style="cursor: pointer; user-select: none; color: var(--text-label);">
          <span class="dd-marquee" style="flex:1; min-width:0; overflow:hidden; white-space:nowrap;">Dynamic Data<span style="color:var(--text-main);">: ${esc(layerLabelText(el))}</span></span>
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="flex-shrink:0; transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </h3>`;
      const checkboxRows = [];
      const dm = state.dataMerge;
      const sk = dmSlotKey(el);
      dmFields.forEach(field => {
        const on = !!(el.dynamic && el.dynamic[field]);
        const id = `dm-chk-${field}-${el.id}`;
        const key = sk + '::' + field;
        const currentMapping = (dm && dm.mappings) ? (dm.mappings[key] || '') : '';
        const colOptions = ['<option value="">— none —</option>'].concat(
          (dm && dm.columns ? dm.columns : []).map(c => `<option value="${esc(c)}" ${c === currentMapping ? 'selected' : ''}>${esc(c)}</option>`)
        ).join('');

        checkboxRows.push(`
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; width:100%;">
            <div class="checkbox-row" style="flex:1; min-width:0; display:flex; align-items:center; gap:8px; margin-right:4px;">
              <input type="checkbox" id="${id}" class="dm-control dm-field-chk" data-el-id="${el.id}" data-dm-field="${field}" title="Toggle dynamic data binding for ${DM_FIELD_LABEL[field] || field}" ${on ? 'checked' : ''}/>
              <label for="${id}" title="Toggle dynamic data binding for ${DM_FIELD_LABEL[field] || field}" style="cursor:pointer; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-weight:500;">${DM_FIELD_LABEL[field] || field}</label>
            </div>
            <select class="dm-control dm-field-select" data-el-id="${el.id}" data-dm-field="${field}" title="Column header map for ${DM_FIELD_LABEL[field] || field}" style="width:130px; flex-shrink:0; padding:3px 4px; font-size:11px; outline:none; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; font-family:inherit; transition:opacity 0.2s;" ${on ? '' : 'disabled'}>
              ${colOptions}
            </select>
          </div>
        `);
      });
      dynamicHtml += `<div class="prop-row" style="display:flex; flex-direction:column; gap:2px; margin-bottom:8px; width:100%;">${checkboxRows.join('')}</div>`;
      if (el.linkGroupId) {
        dynamicHtml += `<div class="prop-row" style="font-size:10px;color:var(--text-accent);margin-top:4px;line-height:1.4;font-weight:500;">Linked element — these toggles apply to every size in the link group.</div>`;
      }
      dynamicHtml += `<button class="btn primary dm-control" id="dm-open-from-props" title="Open spreadsheet view to edit dynamic data and banner versions" style="margin-top:10px;width:100%;font-size:11px;">Data and Versions...</button>`;
      dynamicHtml += `</div>`;
    } else {
      dynamicHtml = `<div class="panel-section highlighted" id="panel-section-dynamic-data" data-permanent="true">
        <h3 class="panel-header-collapsible" id="header-dynamic-data" style="cursor: pointer; user-select: none; color: var(--text-label);">
          <span>Dynamic Data</span>
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </h3>
        <div class="prop-row" style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">
          Connect layer properties (text, image, colors) to a spreadsheet to generate multiple version variants of this banner set automatically.
        </div>
        <button class="btn primary dm-control" id="dm-open-from-props" title="Open spreadsheet view to edit dynamic data and banner versions" style="width:100%;font-size:11px;">Data and Versions...</button>
      </div>`;
    }
  }

  if (!el) {
    if (!c) { propsEl.innerHTML = '<div class="panel-section"><h3>Properties</h3><div class="prop-empty">No canvas.</div></div>'; return; }
    
    const activeIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
    let frameTransitionSectionHtml = '';
    if (state.loopAd || (state.frames.length > 1 && activeIdx > 0)) {
      frameTransitionSectionHtml = `
        <div class="panel-section" id="panel-section-animation">
          <h3 class="panel-header-collapsible" id="header-animation" style="cursor: pointer; user-select: none;">
            <span>Animation</span>
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </h3>
          <div class="panel-section-content">
            ${getFrameTransitionHtml(state.frames[activeIdx])}
          </div>
        </div>
      `;
    }

    const autoSettings = (typeof getAutoResizeSettings === 'function') ? getAutoResizeSettings() : null;
    const isSyncCanvasBg = !!(autoSettings && autoSettings.behaviour && autoSettings.behaviour.syncCanvasBg === true);

    // show canvas properties when no element is selected
    propsEl.innerHTML = `
      ${dynamicHtml}
      <div class="panel-section" id="panel-section-canvas-settings">
        <h3 class="panel-header-collapsible" id="header-canvas-settings" style="cursor: pointer; user-select: none;">
          <span>Canvas Settings</span>
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </h3>
        <div class="panel-section-content">
        <div class="prop-row">
          <label>Dimensions</label>
          <div class="prop-grid-2">
            <input type="number" id="c-w" value="${c.width}" title="Canvas Width (px)" />
            <input type="number" id="c-h" value="${c.height}" title="Canvas Height (px)" />
          </div>
        </div>
        <div class="prop-row" style="margin-top:12px;">
          <label>Background Color</label>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <button class="cp-trigger" data-k="canvas-bg" id="c-bg-color" title="Choose canvas background color" style="width:24px; height:24px; border-radius:4px; border:1px solid var(--border-light); cursor:pointer; background:${getBgStyle(getCanvasBg(c, state.activeFrameId)) || '#000'}"></button>
            <span style="display:none;">${hexInputBox('canvas-bg', getCanvasBg(c, state.activeFrameId), 'c-bg-color-hex')}</span>
            <div class="checkbox-row">
              <input type="checkbox" id="c-bg-per-frame" title="When ON, the background colour you pick applies to the current frame only (other frames keep their own colour). When OFF, every frame on this canvas unifies to the current colour." ${state.bgPerFrame === true ? 'checked' : ''} />
              <label for="c-bg-per-frame" title="When ON, the background colour you pick applies to the current frame only (other frames keep their own colour). When OFF, every frame on this canvas unifies to the current colour.">Per frame</label>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="c-bg-per-canvas" title="When ON, the background colour you pick applies to this canvas only (other canvas sizes keep their own colour). When OFF, every canvas unifies to the current colour." ${state.bgPerCanvas === true ? 'checked' : ''} />
              <label for="c-bg-per-canvas" title="When ON, the background colour you pick applies to this canvas only (other canvas sizes keep their own colour). When OFF, every canvas unifies to the current colour.">Per canvas</label>
            </div>
          </div>
        </div>
        <div class="prop-row" style="margin-top:12px;">
          <div class="checkbox-row">
            <input type="checkbox" id="c-full-click" title="Make the entire canvas clickable (landing page redirect)" ${c.fullClickArea !== false ? 'checked' : ''} />
            <label for="c-full-click" title="Make the entire canvas clickable (landing page redirect)">Use entire canvas as click area</label>
          </div>
        </div>
        <div class="prop-row" style="margin-top:8px;">
          <div class="checkbox-row">
            <input type="checkbox" id="c-show-safezones" title="Show the safezone overlay (centered guides + edge inset) on every canvas" ${state.showSafezones ? 'checked' : ''} />
            <label for="c-show-safezones" title="Show the safezone overlay (centered guides + edge inset) on every canvas">Show safezones on all canvases</label>
          </div>
        </div>

        <div class="prop-row" style="margin-top:16px; display:flex; flex-direction:column; gap:8px;">
          <button id="c-btn-preview" title="Toggle preview mode for this canvas" style="
            width:100%; padding:8px 12px; border-radius:6px; border:none; cursor:pointer;
            background:var(--accent-base); color:var(--text-on-accent, #fff); font-size:12px; font-weight:600;
            font-family:inherit; display:flex; align-items:center; justify-content:center; gap:6px;
            box-shadow:0 2px 8px rgba(0,0,0,0.25); transition:filter 0.15s;
          ">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Preview
          </button>
          <div style="display:flex; gap:6px;">
            <button id="btn-ai-resize" title="Auto-resize from selected canvas" style="
              flex:1; padding:8px 12px; border-radius:6px; border:1px solid var(--border-light); cursor:pointer;
              background:var(--bg-btn); color:var(--text-main); font-size:11px; font-weight:600;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:6px;
              transition:border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3H13M21 3V11M21 3L11 13M3 21H11M3 21V13M3 21L13 11"/></svg>
              Auto-resize
            </button>
            <button id="btn-ai-resize-settings" title="Auto-Resize settings — engine + behaviour + live linking" style="
              padding:8px; border-radius:6px; border:1px solid var(--border-light); cursor:pointer;
              background:var(--bg-btn); color:var(--text-main); display:flex; align-items:center; justify-content:center;
              transition:border-color 0.15s;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
          <div style="display:flex; gap:6px;">
            <button id="c-btn-dl-zip" title="Download this size as a zip package containing HTML and assets" style="
              flex:1; padding:7px 0; border-radius:6px; border:1px solid var(--border-light); cursor:pointer;
              background:var(--bg-input); color:var(--text-main); font-size:11px; font-weight:500;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:4px;
              transition:border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download ZIP
            </button>
            <button id="c-btn-dl-img" title="Download a PNG snapshot of the current canvas" style="
              flex:1; padding:7px 0; border-radius:6px; border:1px solid var(--border-light); cursor:pointer;
              background:var(--bg-input); color:var(--text-main); font-size:11px; font-weight:500;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:4px;
              transition:border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L11 18"/></svg>
              Download PNG
            </button>
          </div>
        </div>

        <div class="prop-row" style="margin-top:12px;">
          <label>Clear all</label>
          <div style="display:flex; gap:6px;">
            <button id="c-btn-clear-current" title="Clear every element on this canvas only" style="
              flex:1; padding:7px 0; border-radius:6px; cursor:pointer;
              background:rgba(239, 68, 68, 0.05); color:#ef4444; font-size:11px; font-weight:500;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:4px;
              border:1px solid rgba(239, 68, 68, 0.25);
              transition:background 0.15s, border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Current
            </button>
            <button id="c-btn-clear-others" title="Clear every other canvas; keep this one untouched" style="
              flex:1; padding:7px 0; border-radius:6px; cursor:pointer;
              background:rgba(239, 68, 68, 0.05); color:#ef4444; font-size:11px; font-weight:500;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:4px;
              border:1px solid rgba(239, 68, 68, 0.25);
              transition:background 0.15s, border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="12" y1="11" x2="12" y2="17"></line></svg>
              Others
            </button>
            <button id="c-btn-clear-all" title="Clear every element on every canvas in the project" style="
              flex:1; padding:7px 0; border-radius:6px; cursor:pointer;
              background:rgba(239, 68, 68, 0.05); color:#ef4444; font-size:11px; font-weight:500;
              font-family:inherit; display:flex; align-items:center; justify-content:center; gap:4px;
              border:1px solid rgba(239, 68, 68, 0.25);
              transition:background 0.15s, border-color 0.15s; white-space:nowrap;
            ">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              All
            </button>
          </div>
        </div>
      </div></div>
      ${frameTransitionSectionHtml}`;
    const wInp = document.getElementById('c-w');
    const hInp = document.getElementById('c-h');

    wInp.addEventListener('input', e => { c.width = Math.max(20, +e.target.value || 20); render(true); });
    wInp.addEventListener('change', () => pushHistory());

    hInp.addEventListener('input', e => { c.height = Math.max(20, +e.target.value || 20); render(true); });
    hInp.addEventListener('change', () => pushHistory());

    const bgColor = document.getElementById('c-bg-color');
    const bgHex = document.getElementById('c-bg-color-hex');
    const bgPerFrame = document.getElementById('c-bg-per-frame');
    const bgPerCanvas = document.getElementById('c-bg-per-canvas');
    const fullClick = document.getElementById('c-full-click');

    // Write a bg colour using the current Per-frame / Per-canvas mode:
    //  • Per-frame OFF: writes c.bgColor (every frame on this canvas
    //    reads it as fallback) and clears c.bgByFrame so prior per-frame
    //    overrides don't linger.
    //  • Per-frame ON: writes the active frame's slot in c.bgByFrame.
    //    First-frame writes also mirror to c.bgColor so legacy code
    //    paths reading c.bgColor see the right colour.
    //  • Per-canvas OFF: the above applies to every canvas in state.
    //  • Per-canvas ON: only the active canvas is touched.
    const writeBg = (val) => {
      const perFrame = state.bgPerFrame === true;
      const perCanvas = state.bgPerCanvas === true;
      const targets = perCanvas ? [c] : state.canvases;
      const fid = state.activeFrameId;
      const firstId = state.frames && state.frames[0] ? state.frames[0].id : null;
      targets.forEach(cv => {
        if (perFrame) {
          if (!cv.bgByFrame) cv.bgByFrame = {};
          cv.bgByFrame[fid] = val;
          if (fid === firstId) cv.bgColor = val;
        } else {
          cv.bgColor = val;
          cv.bgByFrame = {};
        }
      });
    };

    if (bgColor) {
      bgColor.addEventListener('click', () => openColorPicker(bgColor, 'canvas-bg', getCanvasBg(c, state.activeFrameId)));
    }

    bgHex.addEventListener('input', e => {
      let val = e.target.value;
      if (!val.startsWith('#') && val.length > 0 && !val.includes('gradient')) val = '#' + val;
      writeBg(val);
      if (bgColor) bgColor.style.background = val;
      render(true);
    });
    bgHex.addEventListener('change', () => pushHistory());

    if (bgPerFrame) {
      bgPerFrame.addEventListener('change', e => {
        state.bgPerFrame = e.target.checked;
        if (!e.target.checked) {
          // Toggle OFF: unify every frame on this canvas to the
          // currently visible colour. Clears any per-frame overrides
          // so all frames read c.bgColor uniformly.
          const val = getCanvasBg(c, state.activeFrameId);
          c.bgColor = val;
          c.bgByFrame = {};
          render(true);
        }
        pushHistory();
      });
    }
    if (bgPerCanvas) {
      bgPerCanvas.addEventListener('change', e => {
        state.bgPerCanvas = e.target.checked;
        if (!e.target.checked) {
          // Toggle OFF: unify every canvas to the currently visible
          // colour. Clears per-frame overrides on every canvas so the
          // entire project reads a single bg.
          const val = getCanvasBg(c, state.activeFrameId);
          state.canvases.forEach(cv => {
            cv.bgColor = val;
            cv.bgByFrame = {};
          });
          render(true);
        }
        pushHistory();
      });
    }

    fullClick.addEventListener('change', e => {
      c.fullClickArea = e.target.checked;
      pushHistory();
      render(true);
    });

    const showSafezonesChk = document.getElementById('c-show-safezones');
    if (showSafezonesChk) {
      showSafezonesChk.addEventListener('change', e => {
        state.showSafezones = e.target.checked;
        render(true);
      });
    }

    // ── Preview button ──
    const btnPreview = document.getElementById('c-btn-preview');
    if (btnPreview) {
      const isSinglePreview = state.singlePreviewId === c.id;
      if (isSinglePreview) {
        btnPreview.style.background = 'var(--bg-input)';
        btnPreview.style.color = 'var(--text-muted)';
        btnPreview.style.border = '1px solid var(--border-light)';
        btnPreview.style.boxShadow = 'none';
        btnPreview.querySelector('polygon').setAttribute('fill', 'currentColor');
        btnPreview.innerHTML = btnPreview.innerHTML.replace('Preview', 'Exit Preview');
      }
      btnPreview.addEventListener('mouseenter', () => { btnPreview.style.filter = 'brightness(1.15)'; });
      btnPreview.addEventListener('mouseleave', () => { btnPreview.style.filter = ''; });
      btnPreview.addEventListener('click', () => {
        state.singlePreviewId = (state.singlePreviewId === c.id) ? null : c.id;
        render();
      });
    }

    // ── Auto-resize buttons ──
    const btnAiResize = document.getElementById('btn-ai-resize');
    if (btnAiResize && typeof handleAutoResizeClick === 'function') {
      btnAiResize.addEventListener('mouseenter', () => { btnAiResize.style.borderColor = 'var(--accent-base)'; });
      btnAiResize.addEventListener('mouseleave', () => { btnAiResize.style.borderColor = 'var(--border-light)'; });
      btnAiResize.addEventListener('click', handleAutoResizeClick);
    }
    const btnAiResizeSettings = document.getElementById('btn-ai-resize-settings');
    if (btnAiResizeSettings && typeof openAutoResizeSettingsModal === 'function') {
      btnAiResizeSettings.addEventListener('mouseenter', () => { btnAiResizeSettings.style.borderColor = 'var(--accent-base)'; });
      btnAiResizeSettings.addEventListener('mouseleave', () => { btnAiResizeSettings.style.borderColor = 'var(--border-light)'; });
      btnAiResizeSettings.addEventListener('click', openAutoResizeSettingsModal);
    }

    // ── Download ZIP button ──
    const btnDlZip = document.getElementById('c-btn-dl-zip');
    if (btnDlZip) {
      btnDlZip.addEventListener('mouseenter', () => { btnDlZip.style.borderColor = 'var(--accent-base)'; });
      btnDlZip.addEventListener('mouseleave', () => { btnDlZip.style.borderColor = 'var(--border-light)'; });
      btnDlZip.addEventListener('click', () => exportCanvasAsZip(c));
    }

    // ── Download PNG button ──
    const btnDlImg = document.getElementById('c-btn-dl-img');
    if (btnDlImg) {
      btnDlImg.addEventListener('mouseenter', () => { btnDlImg.style.borderColor = 'var(--accent-base)'; });
      btnDlImg.addEventListener('mouseleave', () => { btnDlImg.style.borderColor = 'var(--border-light)'; });
      btnDlImg.addEventListener('click', async () => {
        btnDlImg.textContent = 'Rendering…';
        btnDlImg.disabled = true;
        await exportCanvasAsPng(c);
        btnDlImg.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L11 18"/></svg> Download PNG';
        btnDlImg.disabled = false;
      });
    }


    const dmOpenBtn = propsEl.querySelector('#dm-open-from-props');
    if (dmOpenBtn) dmOpenBtn.addEventListener('click', () => openDataPanel());

    // Wire the three Clear-all buttons in the canvas Properties panel.
    const btnClearCurr   = document.getElementById('c-btn-clear-current');
    const btnClearOthers = document.getElementById('c-btn-clear-others');
    const btnClearAll    = document.getElementById('c-btn-clear-all');
    if (btnClearCurr)   btnClearCurr.addEventListener('click',   clearCurrentCanvasContents);
    if (btnClearOthers) btnClearOthers.addEventListener('click', clearOtherCanvasesContents);
    if (btnClearAll)    btnClearAll.addEventListener('click',    clearAllCanvasesContents);

    if (typeof syncColorPickerWithSelection === 'function') {
      syncColorPickerWithSelection(null, c);
    }
    const canvasActiveIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
    if (state.loopAd || (state.frames.length > 1 && canvasActiveIdx > 0)) {
      wireFrameTransitionEvents();
    }
    initCollapsiblePanels();
    wireCustomSelects(null, null);
    return;
  }

  const f = [];
  const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
  const dText = _dm.text !== undefined ? _dm.text : el.text;
  const dColor = _dm.color !== undefined ? _dm.color : el.color;
  const dBg = _dm.bg !== undefined ? _dm.bg : el.bg;
  const dAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;

  const isFieldDisabled = (field) => {
    return !!(state.dataMerge && state.dataMerge.locked && typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, field));
  };

  const propTooltips = {
    // Canvas dimensions
    'c-w': 'Canvas Width (px)',
    'c-h': 'Canvas Height (px)',
    // Standard properties
    'x': 'X position in pixels',
    'y': 'Y position in pixels',
    'width': 'Width in pixels',
    'height': 'Height in pixels',
    'rotation': 'Rotation in degrees',
    'radius': 'Corner radius in pixels',
    // Text properties
    'fontSize': 'Font size in pixels',
    'maxFontSize': 'Maximum font size when using Auto-size',
    'lineHeight': 'Line height multiplier',
    'letterSpacing': 'Letter spacing in pixels',
    'bgPadL': 'Left and Right padding in pixels',
    'bgPadV': 'Top and Bottom padding in pixels',
    'bgCoverage': 'Width percentage of text background coverage',
    'bgOpacity': 'Text background opacity percentage',
    // Shape properties
    'strokeOpacity': 'Stroke opacity percentage',
    'strokeWidth': 'Stroke thickness in pixels',
    'strokeDash': 'Stroke dash length in pixels',
    'strokeGap': 'Stroke gap length in pixels',
    // Button properties
    'paddingLR': 'Button horizontal padding in pixels',
    // Image properties
    'opacity': 'Opacity percentage',
    // Animation properties
    'animDuration': 'Animation duration in seconds',
    'animDelay': 'Animation start delay in seconds',
    'zoomFrom': 'Animation zoom starting scale percentage',
    'zoomAnchor': 'Animation zoom anchor point (transform-origin)',
    'bgOffset': 'Delay offset for background block animation in seconds',
    // Effect properties
    'effDuration': 'Effect cycle duration in seconds',
    'effDelay': 'Effect start delay in seconds',
    'panDist': 'Pan translation distance in pixels',
    'zoomTarget': 'Zoom peak scale percentage',
    'effSpeed': 'Effect speed percentage',
    'effOnce': 'Run the effect cycle only once',
    'effEase': 'Apply smooth ease in/out curve',
    'spinTarget': 'Target rotation angle in degrees',
    'spinRepeat': 'Repeat count (minimum 1)',
    'pulseScale': 'Pulse peak scale percentage',
    'heartbeatScale': 'Heartbeat peak scale percentage',
    'floatRange': 'Float translation distance in pixels',
    'floatDirection': 'Float movement direction'
  };

  const num = (key, label, def = '') => `<div class="prop-row"><label>${label}</label><input type="number" data-k="${key}" value="${el[key] !== undefined ? el[key] : def}" title="${propTooltips[key] || label}" /></div>`;
  const txt = (key, label) => {
    const val = (key === 'text' && dText !== undefined) ? dText : el[key];
    const isDisabled = isFieldDisabled(key);
    return `<div class="prop-row" ${isDisabled ? 'data-locked-field="true"' : ''}><label>${label}</label><input type="text" data-k="${key}" value="${(val || '').replace(/"/g, '&quot;')}" title="${propTooltips[key] || label}" ${isDisabled ? 'disabled style="pointer-events:none;"' : ''} /></div>`;
  };
  const numIcon = (key, svgIcon, tooltip, def = '') => `
    <div class="prop-row-compact" title="${tooltip}">
      ${svgIcon}
      <input type="number" data-k="${key}" value="${el[key] !== undefined ? el[key] : def}" title="${tooltip}" />
    </div>`;

  const xIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m18 8 4 4-4 4M6 8l-4 4 4 4M2 12h20"/></svg>`;
  const yIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m8 18 4 4 4-4M8 6l4-4 4 4M12 2v20"/></svg>`;
  const wIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M2 5v14M22 5v14M6 12h12M10 8l-4 4 4 4M14 8l4 4-4 4"/></svg>`;
  const hIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 2h14M5 22h14M12 6v12M8 10l4-4 4 4M8 14l4 4 4-4"/></svg>`;
  const rIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 18H6L16 8"/><path d="M13 18a7 7 0 0 0-2-5"/></svg>`;

  const col = (key, label) => {
    const val = (key === 'color' && dColor !== undefined) ? dColor : ((key === 'bg' && dBg !== undefined) ? dBg : el[key]);
    const isDisabled = isFieldDisabled(key);
    const triggerTitle = `Choose ${label.toLowerCase()} color`;
    return `
    <div class="prop-row" ${isDisabled ? 'data-locked-field="true"' : ''}>
      <label>${label}</label>
      <div style="display:flex; gap:6px; align-items:center; ${isDisabled ? 'pointer-events:none;' : ''}">
        <button class="cp-trigger" data-k="${key}" ${isDisabled ? 'disabled' : ''} title="${triggerTitle}" style="width:24px; height:24px; border-radius:4px; border:1px solid var(--border-light); cursor:pointer; background:${getBgStyle(val) || '#000'}"></button>
        ${hexInputBox(key, val, '', isDisabled)}
      </div>
    </div>`;
  };

  const colOpac = (key, label) => {
    const val = (key === 'color' && dColor !== undefined) ? dColor : ((key === 'bg' && dBg !== undefined) ? dBg : el[key]);
    const isDisabled = isFieldDisabled(key);
    const triggerTitle = `Choose ${label.toLowerCase()} color`;
    const opacityTitle = `${label} opacity percentage`;
    return `
    <div class="prop-row" ${isDisabled ? 'data-locked-field="true"' : ''}>
      <div style="display:flex; align-items:end; gap:8px; width:100%;">
        <div class="prop-row" style="margin:0; flex:1; min-width:0;">
          <label>${label}</label>
          <div style="display:flex; gap:6px; align-items:center; ${isDisabled ? 'pointer-events:none;' : ''}">
            <button class="cp-trigger" data-k="${key}" ${isDisabled ? 'disabled' : ''} title="${triggerTitle}" style="width:24px; height:24px; border-radius:4px; border:1px solid var(--border-light); cursor:pointer; background:${getBgStyle(val) || '#000'}"></button>
            ${hexInputBox(key, val, '', isDisabled)}
          </div>
        </div>
        <div class="prop-row" style="margin:0; width:78px; flex-shrink:0;">
          <label>Opacity %</label>
          <input type="number" data-k="opacity" value="${el.opacity !== undefined ? el.opacity : 100}" min="0" max="100" title="${opacityTitle}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" />
        </div>
      </div>
    </div>`;
  };

  const alignElOptions = [
    { id: 'left', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="2" x2="4" y2="22"/><rect x="8" y="10" width="12" height="4" rx="1"/></svg>' },
    { id: 'center', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="2" x2="12" y2="22"/><rect x="6" y="10" width="12" height="4" rx="1"/></svg>' },
    { id: 'right', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="20" y1="2" x2="20" y2="22"/><rect x="4" y="10" width="12" height="4" rx="1"/></svg>' },
    { id: 'top', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="2" y1="4" x2="22" y2="4"/><rect x="10" y="8" width="4" height="12" rx="1"/></svg>' },
    { id: 'middle', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="2" y1="12" x2="22" y2="12"/><rect x="10" y="6" width="4" height="12" rx="1"/></svg>' },
    { id: 'bottom', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="2" y1="20" x2="22" y2="20"/><rect x="10" y="4" width="4" height="12" rx="1"/></svg>' }
  ];
  const elAlignTitles = { left: 'Align Left', center: 'Align Horizontal Center', right: 'Align Right', top: 'Align Top', middle: 'Align Vertical Center', bottom: 'Align Bottom' };
  const alignElHtml = alignElOptions.map(a => `<button class="align-btn action-el-align" data-align="${a.id}" title="${elAlignTitles[a.id]}">${a.icon}</button>`).join('');

  f.push(`<div class="prop-row"><div class="align-group" style="justify-content:space-between; width:100%;">${alignElHtml}</div></div>`);
  f.push(`<div class="prop-row" style="margin-bottom:6px;"><div class="prop-grid-2">${numIcon('x', xIcon, 'X Position')}${numIcon('y', yIcon, 'Y Position')}</div></div>`);
  f.push(`<div class="prop-row" style="margin-bottom:6px;"><div class="prop-grid-2">${numIcon('width', wIcon, el.type === 'line' ? 'Length' : 'Width')}${numIcon('height', hIcon, el.type === 'line' ? 'Thickness' : 'Height')}</div></div>`);
  f.push(`<div class="prop-row" style="margin-bottom:6px;">
    <div class="prop-grid-2">
      ${numIcon('rotation', rIcon, 'Rotation', 0)}
      <div class="checkbox-row" style="height:24px; align-items:center;">
        <input type="checkbox" data-k="lockRatio" id="prop-lock-ratio" title="Maintain aspect ratio when resizing" ${el.lockRatio ? 'checked' : ''} />
        <label for="prop-lock-ratio" title="Maintain aspect ratio when resizing">Lock Ratio</label>
      </div>
    </div>
  </div>`);

  const FONT_OPTIONS = ['Arial', 'Helvetica Neue LT Pro', 'Museo', 'Times New Roman', 'Verdana', 'Tahoma'];
  const fontWeights = {
    'Museo': ['300', '500', '700'],
    'Helvetica Neue LT Pro': ['300', '400', '500']
  };
  const getWeightsForFont = (fnt) => fontWeights[fnt] || ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
  // When a font is switched to one that lacks the element's current weight, the
  // stored weight stays out-of-range: the dropdown can't select it (so it shows
  // the first option) while the browser renders the nearest available face — the
  // UI and the canvas disagree. Snap the stored weight to the nearest available
  // one so the value, the dropdown, and the rendered glyphs all agree.
  const reconcileWeightForFont = (targetEl) => {
    if (!targetEl || (targetEl.type !== 'text' && targetEl.type !== 'button')) return;
    const avail = getWeightsForFont(targetEl.fontFamily || 'Arial');
    const cur = String(targetEl.weight ?? '');
    if (avail.includes(cur)) return;
    const curNum = parseInt(cur, 10);
    let nearest = avail[0];
    if (!Number.isNaN(curNum)) {
      nearest = avail.reduce((best, w) =>
        Math.abs(parseInt(w, 10) - curNum) < Math.abs(parseInt(best, 10) - curNum) ? w : best, avail[0]);
    }
    targetEl.weight = nearest;
  };

  if (el.type === 'text') {
    const textDisabled = isFieldDisabled('text');
    f.push(`<div class="prop-row" ${textDisabled ? 'data-locked-field="true"' : ''}><label>Text</label><textarea data-k="text" rows="2" ${textDisabled ? 'disabled style="pointer-events:none;"' : ''}>${esc(dText)}</textarea></div>`);

    // Resolve computed size for display
    const computedFontSize = el.autoSize ? calculateAutoSize(el, dText) : (el.fontSize || 14);

    // Line 1: Font and Weight
    f.push(`<div class="prop-row">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
        <div class="prop-row" style="margin:0"><label>Font</label>
          <select data-k="fontFamily" title="Font Family">
            ${FONT_OPTIONS.map(fnt => `<option ${fnt === (el.fontFamily || 'Arial') ? 'selected' : ''} value="${fnt}">${fnt}</option>`).join('')}
          </select>
        </div>
        <div class="prop-row" style="margin:0"><label>Weight</label>
          <select data-k="weight" title="Font Weight">
            ${getWeightsForFont(el.fontFamily || 'Arial').map(w => `<option ${String(w) === String(el.weight) ? 'selected' : ''} value="${w}">${w}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`);

    // Line 2: Size & Auto & Max size
    f.push(`<div class="prop-row">
      <div style="display:flex; align-items:end; gap:8px; width:100%;">
        <div class="prop-row" style="margin:0; flex:1;">
          <label for="prop-font-size">Size</label>
          <input type="number" data-k="fontSize" id="prop-font-size" value="${computedFontSize}" ${el.autoSize ? 'disabled' : ''} style="width:100%;" title="Font Size (px)" />
        </div>
        <div class="checkbox-row" style="margin:0 12px 5px 0; font-size:11px; color:var(--text-main); gap:4px; height:22px; flex-shrink:0; white-space:nowrap;">
          <input type="checkbox" data-k="autoSize" id="prop-auto-size" title="Auto-scale text size to fit boundary" ${el.autoSize ? 'checked' : ''} style="width:12px; height:12px; margin:0;" />
          <label for="prop-auto-size" title="Auto-scale text size to fit boundary" style="cursor:pointer; margin:0;">Auto</label>
        </div>
        <div class="prop-row" style="margin:0; flex:1;">
          <label for="prop-max-font-size">Max size</label>
          <input type="number" data-k="maxFontSize" id="prop-max-font-size" value="${el.maxFontSize !== undefined ? el.maxFontSize : (el.fontSize || 72)}" ${!el.autoSize ? 'disabled' : ''} style="width:100%;" title="Maximum font size when using Auto-size" />
        </div>
      </div>
    </div>`);

    f.push(colOpac('color', 'Color'));

    const autoChecked = isLineHeightAuto(el);
    f.push(`<div class="prop-row" id="prop-spacing-row">
          <div style="display:flex; align-items:end; gap:8px; width:100%;">
            <div class="prop-row" style="margin:0; flex:1;">
              <label for="prop-line-height">Leading</label>
              <input type="number" step="0.1" min="0.1" data-k="lineHeight" id="prop-line-height" value="${el.lineHeight !== undefined ? el.lineHeight : '1.2'}" ${autoChecked ? 'disabled' : ''} style="width:100%;" title="Line height multiplier" />
            </div>
            <div class="checkbox-row" style="margin:0 12px 5px 0; font-size:11px; color:var(--text-main); gap:4px; height:22px; flex-shrink:0; white-space:nowrap;">
              <input type="checkbox" data-k="lineHeightAuto" id="prop-line-height-auto" title="Auto-calculate line height based on size" ${autoChecked ? 'checked' : ''} style="width:12px; height:12px; margin:0;" />
              <label for="prop-line-height-auto" title="Auto-calculate line height based on size" style="cursor:pointer; margin:0;">Auto</label>
            </div>
            <div class="prop-row" style="margin:0; flex:1;">
              <label for="prop-letter-spacing">Tracking</label>
              <input type="number" data-k="letterSpacing" id="prop-letter-spacing" value="${el.letterSpacing !== undefined ? el.letterSpacing : 0}" style="width:100%;" title="Letter spacing in pixels" />
            </div>
          </div>
        </div>`);

    // Text background — color, toggle (BG), and opacity on one line.
    f.push(`<div class="prop-row">
      <div style="display:flex; align-items:end; gap:8px; width:100%;">
        <div class="prop-row" style="margin:0; flex:1; min-width:0;">
          <label>BG Color</label>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="cp-trigger" data-k="bg" ${!el.hasBg ? 'disabled' : ''} title="Choose text background color" style="width:24px; height:24px; border-radius:4px; border:1px solid var(--border-light); cursor:pointer; background:${getBgStyle(el.bg || '#000000') || '#000'}"></button>
            ${hexInputBox('bg', el.bg || '#000000', '', !el.hasBg)}
          </div>
        </div>
        <div class="checkbox-row" style="margin:0 12px 5px 0; font-size:11px; color:var(--text-main); gap:4px; height:22px; flex-shrink:0; white-space:nowrap;">
          <input type="checkbox" data-k="hasBg" id="prop-has-bg" title="Enable text background" ${el.hasBg ? 'checked' : ''} style="width:12px; height:12px; margin:0;" />
          <label for="prop-has-bg" title="Enable text background" style="cursor:pointer; margin:0;">BG</label>
        </div>
        <div class="prop-row" style="margin:0; width:78px; flex-shrink:0;">
          <label for="prop-bg-opacity">Opacity %</label>
          <input type="number" data-k="bgOpacity" id="prop-bg-opacity" value="${el.bgOpacity !== undefined ? el.bgOpacity : 100}" min="0" max="100" ${!el.hasBg ? 'disabled' : ''} style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Text background opacity percentage" />
        </div>
      </div>
    </div>`);

    // L/R pad, T/B pad, Coverage — three compact columns on a single row.
    f.push(`<div class="prop-row" style="display:flex; gap:6px;">
      <div style="flex:1; min-width:0;"><label for="prop-bg-pad-l">L/R Pad</label><input type="number" data-k="bgPadL" id="prop-bg-pad-l" value="${el.bgPadL !== undefined ? el.bgPadL : 8}" min="0" ${!el.hasBg ? 'disabled' : ''} style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Left and Right padding in pixels" /></div>
      <div style="flex:1; min-width:0;"><label for="prop-bg-pad-v">T/B Pad</label><input type="number" data-k="bgPadV" id="prop-bg-pad-v" value="${el.bgPadV !== undefined ? el.bgPadV : 4}" min="0" ${!el.hasBg ? 'disabled' : ''} style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Top and Bottom padding in pixels" /></div>
      <div style="flex:1; min-width:0;"><label for="prop-bg-coverage">Cover %</label><input type="number" data-k="bgCoverage" id="prop-bg-coverage" value="${el.bgCoverage !== undefined ? el.bgCoverage : 100}" min="0" max="100" ${!el.hasBg ? 'disabled' : ''} style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Width percentage of text background coverage" /></div>
    </div>`);
  }

  if (el.type === 'text' || el.type === 'button') {
    const alignOptions = [
      { id: 'left', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
      { id: 'center', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
      { id: 'right', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' }
    ];
    const alignTitles = { left: 'Align text left', center: 'Align text center', right: 'Align text right' };
    const alignHtml = alignOptions.map(a => `<button class="align-btn ${el.textAlign === a.id ? 'active' : ''}" data-align="${a.id}" title="${alignTitles[a.id]}" style="padding:4px 0;">${a.icon}</button>`).join('');
    const vAlignOptions = [
      { id: 'top', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="4" x2="20" y2="4"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="14" x2="16" y2="14"/></svg>' },
      { id: 'middle', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="12" x2="20" y2="12"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="17" x2="16" y2="17"/></svg>' },
      { id: 'bottom', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="20" x2="20" y2="20"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="10" x2="16" y2="10"/></svg>' }
    ];
    const vAlignTitles = { top: 'Vertical align top', middle: 'Vertical align middle', bottom: 'Vertical align bottom' };
    const vAlignHtml = vAlignOptions.map(a => `<button class="valign-btn align-btn ${el.verticalAlign === a.id ? 'active' : ''}" data-valign="${a.id}" title="${vAlignTitles[a.id]}" style="padding:4px 0;">${a.icon}</button>`).join('');

    f.push(`<div class="prop-row"><label>Alignment</label>
      <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
        <div class="align-group">${alignHtml}</div>
        <div class="align-group">${vAlignHtml}</div>
      </div>
    </div>`);
  }
  // Stroke section — applies to shapes (rect/circle) and the button frame, NOT to
  // text elements or the text inside a button. Always rendered (no toggle); thickness
  // = 0 simply means no stroke is drawn. The other fields stay editable since their
  // values don't visually change anything until thickness is non-zero anyway.
  const strokeSection = () => {
    const sw = el.strokeWidth !== undefined ? el.strokeWidth : 0;
    let h = '';
    h += `<div class="prop-row" style="display:flex; gap:10px;">
          <div style="flex:1; min-width:0;">
            <label>Stroke Color</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="cp-trigger" data-k="strokeColor" title="Choose stroke color" style="width:24px; height:24px; border-radius:4px; border:1px solid var(--border-light); cursor:pointer; background:transparent; box-shadow:inset 0 0 0 4px ${getBgStyle(el.strokeColor || '#ffffff') || '#fff'};"></button>
              ${hexInputBox('strokeColor', el.strokeColor || '#ffffff')}
            </div>
          </div>
          <div style="width:78px; flex-shrink:0;">
            <label for="prop-stroke-opacity">Opacity %</label>
            <input type="number" data-k="strokeOpacity" id="prop-stroke-opacity" value="${el.strokeOpacity !== undefined ? el.strokeOpacity : 100}" min="0" max="100" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Stroke opacity percentage" />
          </div>
        </div>`;
    h += `<div class="prop-row" style="display:flex; gap:6px;">
          <div style="flex:1; min-width:0;"><label for="prop-stroke-width">Thickness</label><input type="number" data-k="strokeWidth" id="prop-stroke-width" value="${sw}" min="0" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Stroke thickness in pixels" /></div>
          <div style="flex:1; min-width:0;"><label for="prop-stroke-dash">Dash</label><input type="number" data-k="strokeDash" id="prop-stroke-dash" value="${el.strokeDash !== undefined ? el.strokeDash : 0}" min="0" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Stroke dash length in pixels" /></div>
          <div style="flex:1; min-width:0;"><label for="prop-stroke-gap">Gap</label><input type="number" data-k="strokeGap" id="prop-stroke-gap" value="${el.strokeGap !== undefined ? el.strokeGap : 0}" min="0" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Stroke gap length in pixels" /></div>
        </div>`;
    return h;
  };

  if (el.type === 'rect') { f.push(colOpac('color', 'Fill')); f.push(num('radius', 'Radius')); f.push(strokeSection()); }
  if (el.type === 'circle') { f.push(colOpac('color', 'Fill')); f.push(strokeSection()); }
  if (el.type === 'pixel') { f.push(colOpac('color', 'Fill')); f.push(strokeSection()); }
  if (el.type === 'line') { f.push(colOpac('color', 'Line color')); }
  if (el.type === 'button') {
    f.push(txt('text', 'Label'));
    // Row 1: Font and Weight
    f.push(`<div class="prop-row">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
        <div class="prop-row" style="margin:0"><label>Font</label>
          <select data-k="fontFamily" title="Button Font Family">
            ${FONT_OPTIONS.map(fnt => `<option ${fnt === (el.fontFamily || 'Arial') ? 'selected' : ''} value="${fnt}">${fnt}</option>`).join('')}
          </select>
        </div>
        <div class="prop-row" style="margin:0"><label>Weight</label>
          <select data-k="weight" title="Button Font Weight">
            ${getWeightsForFont(el.fontFamily || 'Arial').map(w => `<option ${String(w) === String(el.weight) ? 'selected' : ''} value="${w}">${w}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`);

    // Sizing controls: the two toggles share a row, then the numeric limits
    // (Size / Max / Wrap-threshold) sit together on the row below. "Wrap <"
    // only appears when it's actually in play (Auto-size + Wrap both on).
    const computedFontSize = el.autoSize ? calculateAutoSize(el, dText) : (el.fontSize || 14);
    const showWrapMin = el.autoSize && el.wrapText;
    f.push(`<div class="prop-row" style="margin-bottom:6px;">
      <div style="display:flex; align-items:center; gap:18px; width:100%;">
        <div class="checkbox-row" style="margin:0; font-size:11px; color:var(--text-main); gap:5px;">
          <input type="checkbox" data-k="autoSize" id="prop-auto-size" title="Auto-scale the text to fit the button" ${el.autoSize ? 'checked' : ''} style="width:13px; height:13px; margin:0;" />
          <label for="prop-auto-size" title="Auto-scale the text to fit the button" style="cursor:pointer; margin:0;">Auto-size</label>
        </div>
        <div class="checkbox-row" style="margin:0; font-size:11px; color:var(--text-main); gap:5px;">
          <input type="checkbox" data-k="wrapText" id="prop-wrap-text" title="Allow the label to break onto multiple lines" ${el.wrapText ? 'checked' : ''} style="width:13px; height:13px; margin:0;" />
          <label for="prop-wrap-text" title="Allow the label to break onto multiple lines" style="cursor:pointer; margin:0;">Wrap lines</label>
        </div>
      </div>
    </div>`);
    f.push(`<div class="prop-row">
      <div style="display:flex; align-items:flex-end; gap:8px; width:100%;">
        <div class="prop-row" style="margin:0; flex:1; min-width:0;">
          <label for="prop-font-size">${el.autoSize ? 'Size (auto)' : 'Size'}</label>
          <input type="number" data-k="fontSize" id="prop-font-size" value="${computedFontSize}" ${el.autoSize ? 'disabled' : ''} style="width:100%;" title="${el.autoSize ? 'Auto-size is on — turn it off to set a fixed font size' : 'Fixed font size'}" />
        </div>
        <div class="prop-row" style="margin:0; flex:1; min-width:0;">
          <label for="prop-max-font-size">Max</label>
          <input type="number" data-k="maxFontSize" id="prop-max-font-size" value="${el.maxFontSize !== undefined ? el.maxFontSize : (el.fontSize || 72)}" ${!el.autoSize ? 'disabled' : ''} style="width:100%;" title="Largest font size auto-size may use" />
        </div>
        ${showWrapMin ? `<div class="prop-row" style="margin:0; flex:1; min-width:0;">
          <label for="prop-wrap-min" title="When auto-size would shrink the label below this size, it wraps onto multiple lines instead of shrinking further.">Wrap &lt;</label>
          <input type="number" data-k="wrapMinSize" id="prop-wrap-min" min="4" value="${el.wrapMinSize !== undefined ? el.wrapMinSize : DEFAULT_WRAP_MIN}" style="width:100%;" title="When auto-size would shrink the label below this size, it wraps onto multiple lines instead of shrinking further." />
        </div>` : ''}
      </div>
    </div>`);

    f.push(colOpac('bg', 'BG'));
    f.push(col('color', 'Text color'));
    // Radius + Padding L/R + Padding T/B share a row.
    f.push(`<div class="prop-row" style="display:flex; gap:6px;">
          <div style="flex:1; min-width:0;"><label for="prop-radius">Radius</label><input type="number" data-k="radius" id="prop-radius" value="${el.radius !== undefined ? el.radius : 0}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Button corner radius in pixels" /></div>
          <div style="flex:1; min-width:0;"><label for="prop-padding-lr">Padding L/R</label><input type="number" data-k="paddingLR" id="prop-padding-lr" value="${el.paddingLR !== undefined ? el.paddingLR : 16}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Button horizontal padding in pixels" /></div>
          <div style="flex:1; min-width:0;"><label for="prop-padding-tb">Padding T/B</label><input type="number" data-k="paddingTB" id="prop-padding-tb" value="${el.paddingTB !== undefined ? el.paddingTB : 0}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Button vertical padding in pixels" /></div>
        </div>`);
    f.push(strokeSection());
  }
  if (el.type === 'image') {
    const imgDisabled = isFieldDisabled('image');
    const src = dAssetId ? ((state.assets && state.assets[dAssetId]) || dAssetId) : '';
    const isRmitLogo = el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit') && el.customName.toLowerCase().includes('logo'));
    const isVector = (el.name && el.name.toLowerCase().endsWith('.svg')) || 
                     (dAssetId && typeof dAssetId === 'string' && dAssetId.toLowerCase().includes('.svg')) ||
                     (dAssetId && state.assets && state.assets[dAssetId] && (
                       state.assets[dAssetId].startsWith('data:image/svg+xml') || 
                       state.assets[dAssetId].toLowerCase().includes('.svg')
                     )) ||
                     isRmitLogo || 
                     (el.customName && (
                       el.customName.toLowerCase().includes('logo') || 
                       el.customName.toLowerCase().includes('pixel')
                     ));

    if (isRmitLogo) {
      const variantOptions = [
        { val: 'data/Elements/RMIT_full.svg', label: 'Full Color', img: 'data/Elements/RMIT_full.svg' },
        { val: 'data/Elements/RMIT_RedPixel.svg', label: 'Red Pixel', img: 'data/Elements/RMIT_RedPixel.svg' },
        { val: 'data/Elements/RMIT_White.svg', label: 'White', img: 'data/Elements/RMIT_White.svg' }
      ];
      const currentVariantVal = el.assetId || 'data/Elements/RMIT_White.svg';
      f.push(`<div class="prop-row">
        <label>Variant</label>
        ${customSelect('logoVariant', variantOptions, currentVariantVal, 'RMIT Logo Variant')}
      </div>`);
    }

    // Output file input element (hidden if image already uploaded, so we can trigger it via custom UI)
    const fileInputHtml = `<input type="file" accept="image/*" id="img-upload" title="Upload an image file" style="${src ? 'display:none;' : ''}" ${imgDisabled ? 'disabled style="pointer-events:none;"' : ''} />`;

    if (!src) {
      // Standard upload row when no image is set yet
      f.push(`<div class="prop-row" ${imgDisabled ? 'data-locked-field="true"' : ''}>
        <label for="img-upload">Upload image</label>
        ${fileInputHtml}
      </div>`);
    } else {
      // Image uploaded / used: hide top button and filename, display preview container with overlay
      f.push(fileInputHtml);
      const overlayHtml = isRmitLogo ? '' : `<div class="img-preview-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.65); display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s ease; gap:8px;">
            <button id="overlay-browse-btn" class="btn" style="background:var(--accent-base); color:var(--text-on-accent, var(--text-bright)); border:none; border-radius:4px; padding:6px 16px; font-size:11px; font-weight:600; cursor:pointer;">Browse...</button>
            <span class="overlay-filename" style="color:var(--text-muted); font-size:10px; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(el.name || '')}">${esc(el.name || '')}</span>
          </div>`;
      f.push(`<div class="prop-row">
        <label>Preview</label>
        <div class="img-preview-container" style="position:relative; width:100%; border-radius:4px; overflow:hidden; border:1px solid var(--border-light); background:#12131a; cursor:${isRmitLogo ? 'default' : 'pointer'};">
          <img src="${src}" style="display:block; width:100%; max-height:160px; object-fit:contain; pointer-events:none;" />
          ${overlayHtml}
        </div>
      </div>`);

      if (!isVector) {
        const compressBtnStyle = 'background:var(--accent-base); color:var(--text-on-accent, var(--text-bright)); border:none; cursor:pointer;';
        const gearBtnStyle = 'background:var(--accent-base); color:var(--text-on-accent, var(--text-bright)); border:none; cursor:pointer; width:28px; display:flex; align-items:center; justify-content:center; padding:0;';
        const isCropped = !!el.cropOriginalAssetId;
        const cropBtnStyle = isCropped
          ? 'background:var(--accent-dark); color:var(--text-main); border:1px solid var(--accent-base); cursor:pointer;'
          : 'background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-light); cursor:pointer;';
        const cropTitle = isCropped
          ? 'Re-crop / re-rotate. Reopens the crop dialogue with the original (uncropped) image and the current crop region preselected.'
          : 'Crop & level — rotate the image and pull the corners to crop. Result is baked into the image (element rotation stays 0).';
        const GEAR_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

        f.push(`<div class="prop-row" style="margin-top:4px; margin-bottom:6px; display:flex; gap:6px; width:100%;">
          <div style="display:flex; gap:4px; flex:1;">
            <button id="btn-webp-compress" class="btn" title="Auto-compress image to reduce file size at suggested level" style="flex:1; padding:6px 8px; font-size:11px; border-radius:4px; transition:opacity 0.2s; font-weight:600; ${compressBtnStyle}" ${imgDisabled ? 'disabled' : ''}>
              ${el.isCompressed ? '✓ Auto-compress' : 'Auto-compress'}
            </button>
            <button id="btn-webp-settings" class="btn" title="Open compression settings dialog" style="border-radius:4px; transition:opacity 0.2s; ${gearBtnStyle}" ${imgDisabled ? 'disabled' : ''}>
              ${GEAR_ICON}
            </button>
          </div>
        </div>`);

        f.push(`<div class="prop-row" style="margin-top:0; margin-bottom:8px; display:flex; gap:6px; width:100%;">
          <button id="btn-image-crop" class="btn" title="${cropTitle}" style="flex:1; padding:6px 8px; font-size:11px; border-radius:4px; font-weight:600; ${cropBtnStyle}" ${imgDisabled ? 'disabled style="pointer-events:none; opacity:0.5;"' : ''}>
            ${isCropped ? '✓ Crop & Level' : 'Crop & Level'}
          </button>
          ${!isRmitLogo ? `
          <button id="btn-image-remove" class="btn" title="Remove image and keep placeholder" style="flex:1; padding:6px 8px; font-size:11px; border-radius:4px; font-weight:600; background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); cursor:pointer; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.borderColor='rgba(239, 68, 68, 0.5)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.borderColor='rgba(239, 68, 68, 0.3)';" ${imgDisabled ? 'disabled style="pointer-events:none; opacity:0.5;"' : ''}>
            Remove Image
          </button>
          ` : ''}
        </div>`);
      } else {
        if (!isRmitLogo) {
          f.push(`<div class="prop-row" style="margin-top:0; margin-bottom:8px;">
            <button id="btn-image-remove" class="btn" title="Remove image and keep placeholder" style="width:100%; padding:6px 8px; font-size:11px; border-radius:4px; font-weight:600; background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); cursor:pointer; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.borderColor='rgba(239, 68, 68, 0.5)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.borderColor='rgba(239, 68, 68, 0.3)';" ${imgDisabled ? 'disabled style="pointer-events:none; opacity:0.5;"' : ''}>
              Remove Image
            </button>
          </div>`);
        }
      }
    }

    // Sizing (Fit), Radius, and Opacity inline side-by-side
    f.push(`<div class="prop-row" style="display:flex; gap:6px;">
      <div style="flex:1; min-width:0;">
        <label for="prop-object-fit">Fit</label>
        <select data-k="objectFit" id="prop-object-fit" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="How the image fits within its bounding box">
          <option value="cover" ${el.objectFit === 'cover' ? 'selected' : ''}>Fill</option>
          <option value="contain" ${el.objectFit === 'contain' || !el.objectFit ? 'selected' : ''}>Fit</option>
          <option value="fill" ${el.objectFit === 'fill' ? 'selected' : ''}>Stretch</option>
        </select>
      </div>
      <div style="flex:1; min-width:0;">
        <label for="prop-radius">Radius</label>
        <input type="number" data-k="radius" id="prop-radius" value="${el.radius !== undefined ? el.radius : 0}" min="0" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Corner radius in pixels" />
      </div>
      <div style="flex:1; min-width:0;">
        <label for="prop-opacity">Opacity %</label>
        <input type="number" data-k="opacity" id="prop-opacity" value="${el.opacity !== undefined ? el.opacity : 100}" min="0" max="100" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none;" title="Opacity percentage" />
      </div>
    </div>`);

    // Alt Text for screen readers
    const altTextDisabled = isFieldDisabled('altText');
    f.push(`<div class="prop-row" ${altTextDisabled ? 'data-locked-field="true"' : ''}>
      <label for="prop-alt-text">Alt Text</label>
      <input type="text" data-k="altText" id="prop-alt-text" value="${(el.altText || '').replace(/"/g, '&quot;')}" placeholder="Alt text for screen readers..." title="Alt text for screen readers" ${altTextDisabled ? 'disabled style="pointer-events:none;"' : ''} />
    </div>`);
  }

  // Animation section
  f.push(`</div></div>`); // end of properties section
  if (state.layerSelection && state.layerSelection.length > 1) {
    f.push(`<div class="panel-section" id="panel-section-animation">
      <h3 class="panel-header-collapsible" id="header-animation" style="cursor: pointer; user-select: none; color: var(--text-label);">
        <span>Animation</span>
        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </h3>
      <div class="panel-section-content" style="font-size:11px; color:var(--text-muted); line-height:1.45; padding:10px 12px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:5px; margin-top: 10px;">
        <b style="color:var(--text-label);">Disabled for groups / multi-selection.</b><br>
        Isolate the group (double-click) to configure animations on individual elements.
      </div>
    </div>`);
  } else {
    const starIcon = state.filterFavorites ? `
      <svg class="fav-filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="var(--accent-base)" stroke="var(--accent-base)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    ` : `
      <svg class="fav-filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="var(--text-muted)" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    `;

    // Each animation category is its own independent toggle (no preset modes).
    // IN/OUT/FX are per-element (driven by inEnabled/exitEnabled/fxEnabled, with the
    // preset preserved when off); TRANS is the current frame's transition. OUT
    // depends on IN. State comes from the shared helpers so toggles, sub-panels,
    // and the runtime always agree.
    const inOn = animInEnabled(el);
    const showIn = inOn;
    const showOut = animOutEnabled(el);
    const showFx = animFxEnabled(el);
    const _amActiveIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
    const _amFrame = state.frames[_amActiveIdx];
    const transPossible = state.loopAd || (state.frames.length > 1 && _amActiveIdx > 0);
    const showTrans = transPossible && frameTransEnabled(_amFrame);

    // Icons are the exact glyphs used by each sub-panel heading.
    const AM_ICON_IN = `<svg width="12" height="12" viewBox="0 0 100 100" fill="currentColor"><path d="m21.5527992 16.0015984h-16.6498918c-2.1364791 0-3.2064319 2.5830956-1.695713 4.0938129l29.9045877 29.9045887-29.9045878 29.9045868c-1.5107189 1.5107193-.4407661 4.093811 1.695713 4.093811h16.6498909c.6360168 0 1.2459831-.252655 1.695713-.7023849l31.6003047-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003036-31.6003017c-.44973-.4497299-1.0596962-.7023868-1.6957131-.7023868z"></path><path d="m63.5015984 16.0015984h-16.6498948c-2.1364784 0-3.2064323 2.5830956-1.695713 4.0938129l29.9045868 29.9045887-29.9045868 29.9045868c-1.5107193 1.5107193-.4407654 4.093811 1.695713 4.093811h16.6498947c.636013 0 1.2459831-.252655 1.695713-.7023849l31.6003038-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003037-31.6003017c-.4497299-.4497299-1.0597-.7023868-1.695713-.7023868z"></path></svg>`;
    const AM_ICON_OUT = `<svg width="12" height="12" viewBox="0 0 100 100" fill="currentColor" style="transform:scaleX(-1);"><path d="m21.5527992 16.0015984h-16.6498918c-2.1364791 0-3.2064319 2.5830956-1.695713 4.0938129l29.9045877 29.9045887-29.9045878 29.9045868c-1.5107189 1.5107193-.4407661 4.093811 1.695713 4.093811h16.6498909c.6360168 0 1.2459831-.252655 1.695713-.7023849l31.6003047-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003036-31.6003017c-.44973-.4497299-1.0596962-.7023868-1.6957131-.7023868z"></path><path d="m63.5015984 16.0015984h-16.6498948c-2.1364784 0-3.2064323 2.5830956-1.695713 4.0938129l29.9045868 29.9045887-29.9045868 29.9045868c-1.5107193 1.5107193-.4407654 4.093811 1.695713 4.093811h16.6498947c.636013 0 1.2459831-.252655 1.695713-.7023849l31.6003038-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003037-31.6003017c-.4497299-.4497299-1.0597-.7023868-1.695713-.7023868z"></path></svg>`;
    const AM_ICON_FX = `<svg width="12" height="12" viewBox="0 0 100 100"><g fill="currentColor"><path d="m62.9545441 6.8181796v17.2727323h-60.4545455v17.2727203h95.0000014z"></path><path d="m37.0454559 75.9090881h60.4545441v-17.2727203h-95.0000014l34.5454573 34.5454559z"></path></g></svg>`;
    const modeToggle = (id, active, title, icon, disabled) => `<button type="button" class="anim-mode-toggle${active ? ' active' : ''}" data-anim-toggle="${id}" title="${title}" ${disabled ? 'disabled' : ''} style="background:${active ? 'var(--accent-base)' : 'var(--bg-input)'}; border:1px solid ${active ? 'var(--accent-base)' : 'var(--border-light)'}; color:${active ? '#fff' : 'var(--text-muted)'}; border-radius:4px; width:24px; height:20px; display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:${disabled ? 'not-allowed' : 'pointer'}; opacity:${disabled ? '0.4' : '1'}; outline:none; transition:background .12s,color .12s,border-color .12s;">${icon}</button>`;

    f.push(`<div class="panel-section" id="panel-section-animation">
      <h3 class="panel-header-collapsible" id="header-animation" style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px;">
        <span>Animation</span>
        <div class="anim-mode-toggles" style="display:inline-flex; gap:4px; margin-left:4px;">
          ${modeToggle('in', showIn, `IN — entrance animation (${showIn ? 'on' : 'off'})`, AM_ICON_IN, false)}
          ${modeToggle('out', showOut, inOn ? `OUT — exit animation (${showOut ? 'on' : 'off'})` : 'OUT — turn IN on first', AM_ICON_OUT, !inOn)}
          ${modeToggle('fx', showFx, `FX — Animation FX (${showFx ? 'on' : 'off'})`, AM_ICON_FX, false)}
        </div>
        <button class="fav-filter-btn" style="background:none; border:none; padding:4px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; outline:none; margin-left:auto;" title="${state.filterFavorites ? 'Show All Transitions' : 'Filter Favorites'}">
          ${starIcon}
        </button>
        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </h3>
      <div class="panel-section-content">`);

    f.push(`<div id="in-transition-preview-area" class="animation-sub-panel" style="${showIn ? '' : 'display:none;'}">`);
    f.push(`<div class="prop-row" style="margin-bottom:6px;"><label class="anim-sub-head"><svg id="fi_18562238" width="12" height="12" viewBox="0 0 100 100" style="color: var(--accent-base); flex-shrink: 0;" fill="currentColor"><path d="m21.5527992 16.0015984h-16.6498918c-2.1364791 0-3.2064319 2.5830956-1.695713 4.0938129l29.9045877 29.9045887-29.9045878 29.9045868c-1.5107189 1.5107193-.4407661 4.093811 1.695713 4.093811h16.6498909c.6360168 0 1.2459831-.252655 1.695713-.7023849l31.6003047-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003036-31.6003017c-.44973-.4497299-1.0596962-.7023868-1.6957131-.7023868z"></path><path d="m63.5015984 16.0015984h-16.6498948c-2.1364784 0-3.2064323 2.5830956-1.695713 4.0938129l29.9045868 29.9045887-29.9045868 29.9045868c-1.5107193 1.5107193-.4407654 4.093811 1.695713 4.093811h16.6498947c.636013 0 1.2459831-.252655 1.695713-.7023849l31.6003038-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003037-31.6003017c-.4497299-.4497299-1.0597-.7023868-1.695713-.7023868z"></path></svg>IN</label></div>`);

    const animOptions = [
      { val: 'none', label: 'None' },
      { val: 'fade-in', label: 'Fade In' },
      { val: 'slide', label: 'Slide' },
      { val: 'swipe', label: 'Swipe' },
      { val: 'zoom', label: 'Zoom' },
      { val: 'split', label: 'Split' },
      { val: 'blur', label: 'Blur' }
    ];
    if (el.type === 'text' || el.type === 'button') {
      animOptions.push({ val: 'typing', label: 'Typing', badge: 'text' });
      animOptions.push({ val: 'rise', label: 'Rise', badge: 'text' });
    }

    let filteredOptions = animOptions;
    let favMessageHtml = '';
    if (state.filterFavorites) {
      filteredOptions = animOptions.filter(o => o.val === 'none' || state.favoriteAnimations?.includes('in-' + o.val));
      if (filteredOptions.length <= 1) {
        favMessageHtml = `<div style="grid-column: span 3; font-size: 10px; color: var(--text-muted); line-height: 1.4; padding: 4px 0; text-align: center;">
          No favorite animations for this element type yet. Click the star icon next to presets in the dropdown to add to favorites.
        </div>`;
      }
    }

    const isSwipeActive = (el.animType || 'none').startsWith('swipe-');
    const isSlideActive = el.animType === 'slide' || el.animType === 'slide-up' || el.animType === 'slide-down' || el.animType === 'slide-left' || el.animType === 'slide-right';

    let currentAnimVal = el.animType || 'none';
    if (isSwipeActive) currentAnimVal = 'swipe';
    else if (isSlideActive) currentAnimVal = 'slide';
    else if (currentAnimVal === 'zoom-in' || currentAnimVal === 'pop-in') currentAnimVal = 'zoom';

    f.push(`<div style="margin-bottom:12px;">
      ${customSelect('animType', filteredOptions, currentAnimVal, 'Select In Animation', false, '', 'in-')}
      ${favMessageHtml}
    </div>`);

    // Seconds inputs use step=0.1 so wheel-scroll and arrow keys nudge by 0.1.
    const secNum = (key, label, def = '') => `<div class="prop-row" style="margin:0;"><label>${label}</label><input type="number" step="0.1" data-k="${key}" value="${el[key] !== undefined ? el[key] : def}" /></div>`;

    const isZoomLike = el.animType === 'zoom' || el.animType === 'zoom-in' || el.animType === 'pop-in';
    const isBlur = el.animType === 'blur';
    const isSlideLike = el.animType === 'slide' || el.animType === 'slide-up' || el.animType === 'slide-down' || el.animType === 'slide-left' || el.animType === 'slide-right';
    const isSwipeLike = (el.animType || 'none').startsWith('swipe-');
    const isSplit = el.animType === 'split';

    if (isZoomLike) {
      const defaultZoomFrom = el.animType === 'pop-in' ? 80 : (el.animType === 'zoom-in' ? 110 : 80);
      f.push(`<div class="prop-row" style="margin-bottom:8px;"><div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px;">
        ${secNum('animDuration', 'Duration (s)', 1)}
        ${secNum('animDelay', 'Delay (s)', 0)}
        ${secNum('zoomFrom', 'From (%)', defaultZoomFrom)}
      </div></div>`);
    } else {
      f.push(`<div class="prop-row" style="margin-bottom:8px;"><div class="prop-grid-2">
        ${secNum('animDuration', 'Duration (s)', 1)}
        ${secNum('animDelay', 'Delay (s)', 0)}
      </div></div>`);
    }

    if (isZoomLike) {
      const renderAnchorDot = (anchorName, title) => {
        const isSelected = el.zoomAnchor === anchorName || (!el.zoomAnchor && anchorName === 'center');
        return `<button class="anchor-dot-btn ${isSelected ? 'active' : ''}" data-anchor="${anchorName}" title="${title}"><div></div></button>`;
      };
      f.push(`
        <div class="prop-row" style="margin-bottom:8px; display:flex; align-items:center; gap:16px;">
          <!-- Left: 9-dot box -->
          <div class="anchor-grid" style="flex-shrink:0;">
            ${renderAnchorDot('top-left', 'Top Left')}
            ${renderAnchorDot('top-center', 'Top Center')}
            ${renderAnchorDot('top-right', 'Top Right')}
            ${renderAnchorDot('middle-left', 'Middle Left')}
            ${renderAnchorDot('center', 'Center')}
            ${renderAnchorDot('middle-right', 'Middle Right')}
            ${renderAnchorDot('bottom-left', 'Bottom Left')}
            ${renderAnchorDot('bottom-center', 'Bottom Center')}
            ${renderAnchorDot('bottom-right', 'Bottom Right')}
          </div>
          
          <!-- Right: Checkboxes -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="checkbox-row" style="margin:0;">
              <input type="checkbox" data-k="animFade" id="prop-anim-fade" title="Fade in element during transition" ${el.animFade !== false ? 'checked' : ''}/>
              <label for="prop-anim-fade" title="Fade in element during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
            </div>
            <div class="checkbox-row" style="margin:0;">
              <input type="checkbox" data-k="animBounce" id="prop-anim-bounce" title="Elastic bounce at the end of zoom transition" ${el.animBounce ? 'checked' : ''}/>
              <label for="prop-anim-bounce" title="Elastic bounce at the end of zoom transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Bounce</label>
            </div>
            ${el.type === 'button' ? `
            <div class="checkbox-row" style="margin:0;">
              <input type="checkbox" data-k="animStaggerText" id="prop-anim-stagger-text" title="Stagger animation between button and text" ${el.animStaggerText ? 'checked' : ''}/>
              <label for="prop-anim-stagger-text" title="Stagger animation between button and text" style="cursor:pointer; font-size:11px; white-space:nowrap;">Stagger</label>
            </div>
            ` : ''}
          </div>
        </div>
      `);
    } else if (isBlur) {
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Blur (px)</label>
              <input type="number" min="1" max="100" data-k="animBlurAmount" value="${el.animBlurAmount !== undefined ? el.animBlurAmount : 20}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" title="Animation blur amount in pixels" />
            </div>
            <div style="display:flex; align-items:center; margin-top:14px;">
              <div class="checkbox-row" style="margin:0;">
                <input type="checkbox" data-k="animFade" id="prop-anim-fade" title="Fade in element during transition" ${el.animFade !== false ? 'checked' : ''}/>
                <label for="prop-anim-fade" title="Fade in element during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
              </div>
            </div>
          </div>
        </div>
      `);
    } else if (isSlideLike) {
      const currentDirection = el.animDirection || (el.animType.startsWith('slide-') ? el.animType.replace('slide-', '') : 'up');
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div class="prop-grid-2">
            <div style="display:flex; flex-direction:column; gap:6px; justify-content:center;">
              <div class="checkbox-row" style="margin:0;">
                <input type="checkbox" data-k="animFade" id="prop-anim-fade" title="Fade in element during transition" ${el.animFade !== false ? 'checked' : ''}/>
                <label for="prop-anim-fade" title="Fade in element during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
              </div>
              <div class="checkbox-row" style="margin:0;">
                <input type="checkbox" data-k="animBounce" id="prop-anim-bounce" title="Elastic bounce at the end of slide transition" ${el.animBounce ? 'checked' : ''}/>
                <label for="prop-anim-bounce" title="Elastic bounce at the end of slide transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Bounce</label>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Direction</label>
              ${customSelect('animDirection', [
                { val: 'up', label: 'Up' },
                { val: 'down', label: 'Down' },
                { val: 'left', label: 'Left' },
                { val: 'right', label: 'Right' },
                { val: 'closest', label: 'Closest edge' }
              ], currentDirection, 'Animation direction', false, 'prop-anim-direction')}
            </div>
          </div>
        </div>
        <div class="prop-row" style="margin-bottom:8px;">
          <div style="display: grid; grid-template-columns: 3.5fr 6.5fr; gap: 6px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Dist. (px)</label>
              <input type="number" min="1" max="500" data-k="animDistance" value="${el.animDistance !== undefined ? el.animDistance : (el.animType.startsWith('slide-') ? 20 : 100)}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" title="Animation slide distance in pixels" />
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Rot. Offset (°)</label>
              <input type="number" data-k="animRotateOffset" value="${el.animRotateOffset !== undefined ? el.animRotateOffset : 0}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" title="Entrance animation rotation offset in degrees" />
            </div>
          </div>
        </div>
      `);
    } else if (isSwipeLike) {
      const currentDirection = el.animType.replace('swipe-', '');
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div class="prop-grid-2">
            <div style="display:flex; align-items:center; margin-top:14px;">
              <div class="checkbox-row" style="margin:0;">
                <input type="checkbox" data-k="animFade" id="prop-anim-fade" title="Fade in element during transition" ${el.animFade !== false ? 'checked' : ''}/>
                <label for="prop-anim-fade" title="Fade in element during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Direction</label>
              ${customSelect('animDirection', [
                { val: 'up', label: 'Up' },
                { val: 'down', label: 'Down' },
                { val: 'left', label: 'Left' },
                { val: 'right', label: 'Right' }
              ], currentDirection, 'Animation direction', false, 'prop-anim-direction')}
            </div>
          </div>
        </div>
      `);
    } else if (isSplit) {
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div class="prop-grid-2">
            <div style="display:flex; align-items:center; margin-top:14px;">
              <div class="checkbox-row" style="margin:0;">
                <input type="checkbox" data-k="animFade" id="prop-anim-fade" title="Fade in element during transition" ${el.animFade !== false ? 'checked' : ''}/>
                <label for="prop-anim-fade" title="Fade in element during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label>Angle (°)</label>
              <input type="number" data-k="animAngle" value="${el.animAngle !== undefined ? el.animAngle : 0}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none; text-align:right;" title="Split reveal angle in degrees" />
            </div>
          </div>
        </div>
      `);
    } else if (el.animType === 'rise') {
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label>Rise by</label>
            ${customSelect('riseSplit', [
              { val: 'letter', label: 'Letters' },
              { val: 'word', label: 'Words' },
              { val: 'line', label: 'Lines' }
            ], el.riseSplit || 'word', 'What emerges as one unit — letters, words, or lines (lines split on your line breaks)')}
          </div>
        </div>
      `);
    } else if (el.animType === 'typing' || el.animType === 'fade-typing' || el.animType === 'word-fade') {
      const fadeBg = el.animFadeBg !== undefined ? el.animFadeBg : (el.type === 'button' ? true : !!el.animateBg);
      f.push(`
        <div class="prop-row" style="margin-bottom:8px;">
          <div style="display:flex; flex-direction:row; gap:16px; align-items:center; height:24px;">
            <div class="checkbox-row" style="margin:0;">
              <input type="checkbox" data-k="animFadeLetters" id="prop-anim-fade-letters" title="Fade in characters one by one" ${el.animFadeLetters !== false ? 'checked' : ''}/>
              <label for="prop-anim-fade-letters" title="Fade in characters one by one" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade letters</label>
            </div>
            <div class="checkbox-row" style="margin:0; ${el.type === 'text' && !el.hasBg ? 'opacity:0.5; pointer-events:none;' : ''}">
              <input type="checkbox" data-k="animFadeBg" id="prop-anim-fade-bg" title="Fade/Animate background block/container during transition" ${fadeBg ? 'checked' : ''} ${el.type === 'text' && !el.hasBg ? 'disabled' : ''}/>
              <label for="prop-anim-fade-bg" title="Fade/Animate background block/container during transition" style="cursor:pointer; font-size:11px; white-space:nowrap;">${el.type === 'text' ? 'Animate BG' : 'Fade BG'}</label>
            </div>
          </div>
        </div>
        ${el.type === 'text' && el.hasBg && fadeBg ? `
        <div class="prop-row" style="margin-bottom:8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            ${secNum('bgOffset', 'BG Offset', 0)}
            <div></div>
          </div>
        </div>
        ` : ''}
      `);
    }

    f.push(`</div>`); // Close in-transition-preview-area

    // ---- OUT ANIMATIONS (exit) ----
    // Opt-in via a toggle (off by default). When off, only the heading + toggle
    // show. The exit plays on its own timer: it begins "In → Out" seconds after the
    // element appears, independent of the frame's own duration.
    f.push(`<div id="out-transition-preview-area" class="animation-sub-panel" style="${showOut ? '' : 'display:none;'}">`);
    const inDelay = animInEnabled(el) ? (el.animDelay || 0) : 0;
    const exitValAfter = el.exitStart !== undefined ? el.exitStart : 1.5;
    const totalExitStart = inDelay + exitValAfter;
    const startTooltip = inDelay > 0
      ? `Starts at ${totalExitStart}s total (${inDelay}s IN delay + ${exitValAfter}s after)`
      : `Starts at ${exitValAfter}s`;

    f.push(`<div class="prop-row" style="margin:0 0 10px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <label class="anim-sub-head" style="margin:0;"><svg id="fi_18562238" width="12" height="12" viewBox="0 0 100 100" style="color: var(--accent-base); flex-shrink: 0; transform: scaleX(-1);" fill="currentColor"><path d="m21.5527992 16.0015984h-16.6498918c-2.1364791 0-3.2064319 2.5830956-1.695713 4.0938129l29.9045877 29.9045887-29.9045878 29.9045868c-1.5107189 1.5107193-.4407661 4.093811 1.695713 4.093811h16.6498909c.6360168 0 1.2459831-.252655 1.695713-.7023849l31.6003047-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003036-31.6003017c-.44973-.4497299-1.0596962-.7023868-1.6957131-.7023868z"></path><path d="m63.5015984 16.0015984h-16.6498948c-2.1364784 0-3.2064323 2.5830956-1.695713 4.0938129l29.9045868 29.9045887-29.9045868 29.9045868c-1.5107193 1.5107193-.4407654 4.093811 1.695713 4.093811h16.6498947c.636013 0 1.2459831-.252655 1.695713-.7023849l31.6003038-31.6002999c.9365158-.9365158.9365158-2.4549103 0-3.3914261l-31.6003037-31.6003017c-.4497299-.4497299-1.0597-.7023868-1.695713-.7023868z"></path></svg>OUT</label>
      <div style="display:flex; align-items:center; gap:4px;" title="${startTooltip}">
        <label for="prop-exit-start" style="font-size:9px; color:var(--text-muted); margin:0;">after</label>
        <input type="number" step="0.1" min="0" data-k="exitStart" id="prop-exit-start" value="${exitValAfter}" style="width:45px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:2px 4px; font-size:11px; height:20px; outline:none;" />
        <span style="font-size:11px; color:var(--text-muted);">s</span>
      </div>
    </div>`);

    const exitOptions = [
      { val: 'fade-out', label: 'Fade Out' },
      { val: 'slide', label: 'Slide' },
      { val: 'swipe', label: 'Swipe' },
      { val: 'zoom', label: 'Zoom' },
      { val: 'blur', label: 'Blur' }
    ];
    const exitVal = el.exitType || 'fade-out';
    let filteredExit = exitOptions;
    let exitFavMessageHtml = '';
    if (state.filterFavorites) {
      // Keep the current selection too, so the dropdown is never empty (OUT has no 'none').
      filteredExit = exitOptions.filter(o => o.val === exitVal || state.favoriteAnimations?.includes('out-' + o.val));
      if (filteredExit.length <= 1) {
        exitFavMessageHtml = `<div style="font-size: 10px; color: var(--text-muted); line-height: 1.4; padding: 4px 0; text-align: center;">
          No favorite exit animations yet. Click the star icon next to presets in the dropdown to add to favorites.
        </div>`;
      }
    }
    f.push(`<div style="margin-bottom:8px;">
      ${customSelect('exitType', filteredExit, exitVal, 'Select Out Animation', false, '', 'out-')}
      ${exitFavMessageHtml}
    </div>`);

    const showFade = exitVal !== 'fade-out'; // Fade Out is inherently a fade
    const showDir = exitVal === 'slide' || exitVal === 'swipe';
    const showDist = exitVal === 'slide';

    if (showFade) {
      f.push(`<div class="prop-row" style="margin-bottom:8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          ${secNum('exitDuration', 'Duration (s)', 0.6)}
          <div style="display:flex; align-items:center; margin-top:14px;">
            <div class="checkbox-row" style="margin:0;">
              <input type="checkbox" data-k="exitFade" id="prop-exit-fade" title="Fade out while leaving" ${el.exitFade !== false ? 'checked' : ''}/>
              <label for="prop-exit-fade" title="Fade out while leaving" style="cursor:pointer; font-size:11px; white-space:nowrap;">Fade</label>
            </div>
          </div>
        </div>
      </div>`);
    } else {
      f.push(`<div class="prop-row" style="margin-bottom:8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          ${secNum('exitDuration', 'Duration (s)', 0.6)}
          <div></div>
        </div>
      </div>`);
    }

    if (showDir) {
      const exitDir = el.exitDirection || (exitVal === 'swipe' ? 'left' : 'down');
      f.push(`<div class="prop-row" style="margin-bottom:8px;"><div class="prop-grid-2">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label>Direction</label>
          ${customSelect('exitDirection', [
            { val: 'up', label: 'Up' },
            { val: 'down', label: 'Down' },
            { val: 'left', label: 'Left' },
            { val: 'right', label: 'Right' }
          ], exitDir, 'Exit direction', false, 'prop-exit-direction')}
        </div>
        ${showDist ? `<div style="display:flex; flex-direction:column; gap:4px;">
          <label>Dist. (px)</label>
          <input type="number" min="1" max="500" data-k="exitDistance" value="${el.exitDistance !== undefined ? el.exitDistance : 20}" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none;" title="Exit slide distance in pixels" />
        </div>` : '<div></div>'}
      </div></div>`);
    }

    const isPersistentEl = el.persistent === 'top' || el.persistent === 'bottom';
    if (isPersistentEl) {
      f.push(`<div style="font-size:10px; color:var(--text-muted); line-height:1.4; margin:-2px 0 8px;">Exit applies to frame elements, not persistent layers.</div>`);
    }

    f.push(`</div>`); // Close out-transition-preview-area

    f.push(`<div id="effects-preview-area" class="animation-sub-panel" style="${showFx ? '' : 'display:none;'}">`);
    f.push(`<div class="prop-row" style="margin-bottom:6px;"><label class="anim-sub-head"><svg id="fi_18489086" width="12" height="12" viewBox="0 0 100 100" style="color: var(--accent-base); flex-shrink: 0;"><g fill="currentColor"><path d="m62.9545441 6.8181796v17.2727323h-60.4545455v17.2727203h95.0000014z"></path><path d="m37.0454559 75.9090881h60.4545441v-17.2727203h-95.0000014l34.5454573 34.5454559z"></path></g></svg>Animation FX</label></div>`);
    const effectOptions = [
      { val: 'none', label: 'None' },
      { val: 'pulse', label: 'Pulse' },
      { val: 'float', label: 'Float' },
      { val: 'flash', label: 'Flash' },
      { val: 'wiggle', label: 'Wiggle' },
      { val: 'spin', label: 'Spin' },
      { val: 'heartbeat', label: 'Heartbeat' },
      { val: 'pan', label: 'Move' },
      { val: 'zoom', label: 'Zoom' }
    ];

    let filteredEffects = effectOptions;
    let effFavMessageHtml = '';
    if (state.filterFavorites) {
      filteredEffects = effectOptions.filter(o => o.val === 'none' || state.favoriteAnimations?.includes('eff-' + o.val));
      if (filteredEffects.length <= 1) {
        effFavMessageHtml = `<div style="grid-column: span 3; font-size: 10px; color: var(--text-muted); line-height: 1.4; padding: 4px 0; text-align: center;">
          No favorite Animation FX yet. Click the star icon next to presets in the dropdown to add to favorites.
        </div>`;
      }
    }

    f.push(`<div style="margin-bottom:16px;">
      ${customSelect('effectType', filteredEffects, el.effectType || 'none', 'Select Animation FX', false, '', 'eff-')}
      ${effFavMessageHtml}
    </div>`);

    if (el.effectType && el.effectType !== 'none') {
      if (el.effectType === 'pan') {
        if (el.panFromX === undefined && el.panFromY === undefined) {
          const dist = el.panDist !== undefined ? el.panDist : 50;
          if (el.panDir === 'L') { el.panFromX = dist; el.panFromY = 0; }
          else if (el.panDir === 'R') { el.panFromX = -dist; el.panFromY = 0; }
          else if (el.panDir === 'U') { el.panFromX = 0; el.panFromY = dist; }
          else if (el.panDir === 'D') { el.panFromX = 0; el.panFromY = -dist; }
          else { el.panFromX = 0; el.panFromY = -50; }
        }
        const px_val = el.panFromX !== undefined ? el.panFromX : 0;
        const py_val = el.panFromY !== undefined ? el.panFromY : -50;
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effDuration', 'Duration (s)', 5)}
        ${num('effDelay', 'Delay (s)', 0)}
        <div class="prop-row"><label>From X (px)</label><input type="number" data-k="panFromX" id="prop-pan-from-x" value="${px_val}" title="X offset for starting position of Move effect" /></div>
        <div class="prop-row"><label>From Y (px)</label><input type="number" data-k="panFromY" id="prop-pan-from-y" value="${py_val}" title="Y offset for starting position of Move effect" /></div>
        <div class="prop-row"><label>Rot. Offset (°)</label><input type="number" data-k="panRotate" id="prop-pan-rotate" value="${el.panRotate !== undefined ? el.panRotate : 0}" title="Rotational offset angle in degrees" /></div>
      </div>
      <div style="display:flex; gap:16px; margin-top:8px; flex-wrap:wrap;">
        <div class="checkbox-row"><input type="checkbox" data-k="effEase" id="prop-eff-ease" title="Apply smooth ease in/out curve" ${el.effEase !== false ? 'checked' : ''}/><label for="prop-eff-ease" title="Apply smooth ease in/out curve" style="cursor:pointer;">Ease</label></div>
        <div class="checkbox-row"><input type="checkbox" data-k="effOnce" id="prop-eff-once" title="Run the effect cycle only once" ${el.effOnce !== false ? 'checked' : ''}/><label for="prop-eff-once" title="Run the effect cycle only once" style="cursor:pointer;">Perform once</label></div>
        <div class="checkbox-row"><input type="checkbox" data-k="panFade" id="prop-pan-fade" title="Fade opacity from 0 to 1 during movement" ${el.panFade ? 'checked' : ''}/><label for="prop-pan-fade" title="Fade opacity from 0 to 1 during movement" style="cursor:pointer;">Fade</label></div>
        <div class="checkbox-row"><input type="checkbox" data-k="panTowards" id="prop-pan-towards" title="Move towards target layout position instead of away from layout position" ${el.panTowards ? 'checked' : ''}/><label for="prop-pan-towards" title="Move towards target layout position instead of away from layout position" style="cursor:pointer;">Towards target</label></div>
      </div>
      </div>`);
      } else if (el.effectType === 'zoom') {
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effDuration', 'Duration (s)', 5)}
        ${num('effDelay', 'Delay (s)', 0)}
        ${num('zoomTarget', 'Target (%)', 150)}
      </div>
      <div style="display:flex; gap:16px; margin-top:8px;">
        <div class="checkbox-row"><input type="checkbox" data-k="effEase" id="prop-eff-ease-zoom" title="Apply smooth ease in/out curve" ${el.effEase !== false ? 'checked' : ''}/><label for="prop-eff-ease-zoom" title="Apply smooth ease in/out curve" style="cursor:pointer;">Ease</label></div>
        <div class="checkbox-row"><input type="checkbox" data-k="effOnce" id="prop-eff-once-zoom" title="Run the effect cycle only once" ${el.effOnce ? 'checked' : ''}/><label for="prop-eff-once-zoom" title="Run the effect cycle only once" style="cursor:pointer;">Perform once</label></div>
      </div>
      </div>`);
      } else if (el.effectType === 'spin') {
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effDuration', 'Duration (s)', 2)}
        ${num('effDelay', 'Delay (s)', 0)}
        ${num('spinTarget', 'Target (deg)', 360)}
        <div class="prop-row"><label>Repeat</label><input type="number" data-k="spinRepeat" min="1" value="${el.spinRepeat !== undefined ? el.spinRepeat : 1}" title="${propTooltips.spinRepeat || 'Repeat count'}" /></div>
      </div>
      <div style="display:flex; gap:16px; margin-top:8px;">
        <div class="checkbox-row"><input type="checkbox" data-k="effEase" id="prop-eff-ease-spin" title="Apply smooth ease in/out curve" ${el.effEase !== false ? 'checked' : ''}/><label for="prop-eff-ease-spin" title="Apply smooth ease in/out curve" style="cursor:pointer;">Ease</label></div>
      </div>
      </div>`);
      } else if (el.effectType === 'pulse') {
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effSpeed', 'Speed (%)', 100)}
        ${num('effDelay', 'Delay (s)', 0)}
        ${num('pulseScale', 'Scale (%)', 105)}
      </div></div>`);
      } else if (el.effectType === 'heartbeat') {
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effSpeed', 'Speed (%)', 100)}
        ${num('effDelay', 'Delay (s)', 0)}
        ${num('heartbeatScale', 'Scale (%)', 130)}
      </div></div>`);
      } else if (el.effectType === 'float') {
        const currentDir = el.floatDirection || 'up';
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effSpeed', 'Speed (%)', 100)}
        ${num('effDelay', 'Delay (s)', 0)}
        ${num('floatRange', 'Range (px)', 10)}
        <div class="prop-row"><label>Direction</label>
          <select data-k="floatDirection" title="Float direction" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; height:24px; outline:none; cursor:pointer;">
            <option value="up" ${currentDir === 'up' ? 'selected' : ''}>Up</option>
            <option value="down" ${currentDir === 'down' ? 'selected' : ''}>Down</option>
            <option value="left" ${currentDir === 'left' ? 'selected' : ''}>Left</option>
            <option value="right" ${currentDir === 'right' ? 'selected' : ''}>Right</option>
          </select>
        </div>
      </div></div>`);
      } else {
        f.push(`<div class="prop-row" style="margin-bottom:16px; margin-top:-8px;"><div class="prop-grid-2">
        ${num('effSpeed', 'Speed (%)', 100)}
        ${num('effDelay', 'Delay (s)', 0)}
      </div></div>`);
      }
    }

    f.push(`</div>`); // Close effects-preview-area

    const activeIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
    if (transPossible) {
      f.push(getFrameTransitionHtml(state.frames[activeIdx]));
    }

    f.push(`</div></div>`);
  }

  propsEl.innerHTML = `
    ${dynamicHtml}
    <div class="panel-section" id="panel-section-properties">
      <h3 class="panel-header-collapsible" id="header-properties" style="cursor: pointer; user-select: none;">
        <span>Properties</span>
        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="transition: transform 0.2s ease;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </h3>
      <div class="panel-section-content">
        ${f.join('')}`;

function checkButtonFontSizeWarning(el) {
  if (el && el.type === 'button' && el.autoSize) {
    const dText = (typeof dmDisplay === 'function' ? dmDisplay(el).text : null) || el.text;
    const computedFontSize = calculateAutoSize(el, dText);
    if (computedFontSize < 6) {
      showCanvasNotification('Text size will be unreadable', { type: 'warning' });
    }
  }
}

  const updateProp = (k, val) => {
    if (!k) return;
    if (k === 'logoVariant') {
      let customName = 'RMIT Logo (white)';
      if (val === 'data/Elements/RMIT_full.svg') {
        customName = 'RMIT Logo (Full color)';
      } else if (val === 'data/Elements/RMIT_RedPixel.svg') {
        customName = 'RMIT Logo (Red Pixel)';
      }

      const updateLogo = (targetEl) => {
        targetEl.assetId = val;
        targetEl.customName = customName;
        targetEl.name = customName;
      };

      const c = getActiveCanvas();
      if (state.layerSelection && state.layerSelection.length > 1 && c) {
        c.elements.filter(e => state.layerSelection.includes(e.id)).forEach(updateLogo);
      } else {
        updateLogo(el);
      }

      pushHistory();
      renderProps();
      render(true);
      return;
    }
    // (A) Edit-in-place for panel-edited dynamic fields (color/bg/text): route to the active
    // version's cell rather than the template, when a single dynamic element is selected.
    const dmField = (k === 'color' || k === 'bg' || k === 'text') ? k : null;
    if (dmField && (!state.layerSelection || state.layerSelection.length <= 1) &&
        typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, dmField)) {
      if (!state.dataMerge.locked) { dmWriteCell(el, dmField, val); render(true); }
      return;
    }
    const c = getActiveCanvas();
    if (state.layerSelection && state.layerSelection.length > 1 && c) {
      c.elements.filter(e => state.layerSelection.includes(e.id)).forEach(selEl => {
        if (['x', 'y', 'width', 'height', 'lockRatio', 'fontSize', 'autoSize', 'textAlign'].includes(k)) {
          if (selEl.autoArranged) delete selEl.autoArranged;
        }
        if (k === 'text' && selEl.id !== el.id) return; // Don't copy specific text content across elements
        if (['fontFamily', 'fontSize', 'weight', 'color', 'lineHeight', 'letterSpacing', 'textAlign', 'verticalAlign', 'autoSize', 'maxFontSize', 'paddingLR', 'paddingTB'].includes(k) && selEl.type !== 'text' && selEl.type !== 'button') return;
        
        if ((k === 'width' || k === 'height') && selEl.type === 'button') {
          selEl.autoHug = false;
        }

        if (k === 'lockRatio') {
          if (val) {
            selEl.aspectRatio = (selEl.width && selEl.height) ? (selEl.width / selEl.height) : 1;
          } else {
            delete selEl.aspectRatio;
          }
        }

        if (k === 'width' && selEl.lockRatio) {
          if (val === undefined || val === '') {
            delete selEl.width;
            delete selEl.height;
          } else {
            if (!selEl.aspectRatio) {
              selEl.aspectRatio = (selEl.width && selEl.height) ? (selEl.width / selEl.height) : 1;
            }
            selEl.width = val;
            selEl.height = Math.max(1, Math.round(val / selEl.aspectRatio));
          }
        } else if (k === 'height' && selEl.lockRatio) {
          if (val === undefined || val === '') {
            delete selEl.width;
            delete selEl.height;
          } else {
            if (!selEl.aspectRatio) {
              selEl.aspectRatio = (selEl.width && selEl.height) ? (selEl.width / selEl.height) : 1;
            }
            selEl.height = val;
            selEl.width = Math.max(1, Math.round(val * selEl.aspectRatio));
          }
        } else {
          if (val === undefined) {
            delete selEl[k];
          } else {
            selEl[k] = val;
            if (k === 'animFadeBg') {
              selEl.animateBg = val;
            }
            if (k === 'autoSize' && val === true) {
              selEl.autoHug = false;
            }
            if (k === 'autoHug' && val === true) {
              selEl.autoSize = false;
            }
          }
        }
        
        if (selEl.type === 'button' && selEl.autoHug) {
          selEl.width = measureButtonWidth(selEl);
        }
      });
    } else {
      if (['x', 'y', 'width', 'height', 'lockRatio', 'fontSize', 'autoSize', 'textAlign'].includes(k)) {
        if (el.autoArranged) delete el.autoArranged;
      }
      if ((k === 'width' || k === 'height') && el.type === 'button') {
        el.autoHug = false;
      }

      if (k === 'lockRatio') {
        if (val) {
          el.aspectRatio = (el.width && el.height) ? (el.width / el.height) : 1;
        } else {
          delete el.aspectRatio;
        }
      }

      if (k === 'width' && el.lockRatio) {
        if (val === undefined || val === '') {
          delete el.width;
          delete el.height;
        } else {
          if (!el.aspectRatio) {
            el.aspectRatio = (el.width && el.height) ? (el.width / el.height) : 1;
          }
          el.width = val;
          el.height = Math.max(1, Math.round(val / el.aspectRatio));
        }
      } else if (k === 'height' && el.lockRatio) {
        if (val === undefined || val === '') {
          delete el.width;
          delete el.height;
        } else {
          if (!el.aspectRatio) {
            el.aspectRatio = (el.width && el.height) ? (el.width / el.height) : 1;
          }
          el.height = val;
          el.width = Math.max(1, Math.round(val * el.aspectRatio));
        }
      } else {
        if (val === undefined) {
          delete el[k];
        } else {
          el[k] = val;
          if (k === 'animFadeBg') {
            el.animateBg = val;
          }
          if (k === 'autoSize' && val === true) {
            el.autoHug = false;
          }
          if (k === 'autoHug' && val === true) {
            el.autoSize = false;
          }
        }
      }
      if (el.type === 'button' && el.autoHug) {
        el.width = measureButtonWidth(el);
      }
    }
    if (k === 'fontFamily') {
      const affected = (state.layerSelection && state.layerSelection.length > 1 && c)
        ? c.elements.filter(e => state.layerSelection.includes(e.id))
        : [el];
      affected.forEach(reconcileWeightForFont);
    }
    if ((k === 'width' || k === 'height') && (el.type === 'button' || (state.layerSelection && state.layerSelection.length > 1 && c && c.elements.filter(e => state.layerSelection.includes(e.id)).some(selEl => selEl.type === 'button')))) {
      const autoHugInp = propsEl.querySelector('input[data-k="autoHug"]');
      if (autoHugInp) autoHugInp.checked = false;
    }
    checkButtonFontSizeWarning(el);
    render(true);
  };
  // Expose to the sequencer (see declaration at top of file).
  activeUpdatePropFn = updateProp;

  const clampNum = (inp, n) => {
    if (Number.isNaN(n)) return n;
    const min = inp.min !== '' ? Number(inp.min) : -Infinity;
    const max = inp.max !== '' ? Number(inp.max) : Infinity;
    return Math.min(max, Math.max(min, n));
  };

  const syncLockRatio = (changedKey) => {
    if (!el.lockRatio) return;
    const sibKey = changedKey === 'width' ? 'height' : changedKey === 'height' ? 'width' : null;
    if (!sibKey) return;
    const sibInp = propsEl.querySelector(`[data-k="${sibKey}"]`);
    if (sibInp && document.activeElement !== sibInp) {
      sibInp.value = el[sibKey] !== undefined ? el[sibKey] : '';
    }
  };

  propsEl.querySelectorAll('input, select, textarea').forEach((inp) => {
    if (inp.classList.contains('dm-control') || (inp.id && inp.id.startsWith('frame-trans'))) return; // dynamic-data and frame transitions controls wired separately
    inp.addEventListener('input', () => {
      let val = inp.type === 'number' ? (inp.value === '' ? undefined : Number(inp.value)) : (inp.type === 'checkbox' ? inp.checked : inp.value);
      if (inp.type === 'number' && inp.value !== '' && val !== undefined) {
        const clamped = clampNum(inp, val);
        if (clamped !== val) {
          val = clamped;
          inp.value = clamped;
        }
      }
      if (inp.type === 'text' && (inp.dataset.k === 'color' || inp.dataset.k === 'bg' || inp.dataset.k === 'strokeColor') && val !== undefined) {
        if (!val.startsWith('#') && val.length > 0 && !val.includes('gradient')) val = '#' + val;
      }
      updateProp(inp.dataset.k, val);
      syncLockRatio(inp.dataset.k);
      propsEl.querySelectorAll(`[data-k="${inp.dataset.k}"]`).forEach(otherInp => {
        if (otherInp !== inp) {
          if (otherInp.classList.contains('cp-trigger')) {
            if (inp.dataset.k === 'strokeColor') {
              otherInp.style.background = 'transparent';
              otherInp.style.boxShadow = `inset 0 0 0 4px ${val}`;
            } else {
              otherInp.style.background = val;
              otherInp.style.boxShadow = 'none';
            }
          }
          else otherInp.value = (inp.dataset.k === 'color' || inp.dataset.k === 'bg' || inp.dataset.k === 'canvas-bg' || inp.dataset.k === 'strokeColor') ? (val !== undefined ? val.replace(/^#/, '') : '') : (val !== undefined ? val : '');
        }
      });
    });
    inp.addEventListener('change', () => {
      pushHistory();
      if (inp.dataset.k === 'fontFamily' || inp.dataset.k === 'hasBg' || inp.dataset.k === 'animateBg' || inp.dataset.k === 'animFadeBg' || inp.dataset.k === 'animFadeLetters' || inp.dataset.k === 'lineHeightAuto' || inp.dataset.k === 'autoSize' || inp.dataset.k === 'maxFontSize' || inp.dataset.k === 'lockRatio' || inp.dataset.k === 'wrapText' || inp.dataset.k === 'wrapMinSize' || inp.dataset.k === 'animStaggerText' || inp.dataset.k === 'exitEnabled' || inp.dataset.k === 'exitType' || inp.dataset.k === 'exitStart') renderProps();
    });
    if (inp.type === 'number') {
      inp.addEventListener('wheel', (e) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        // Use the input's step attribute as the base nudge (1 if unset). Shift+Alt = 10×.
        // Result is rounded to the step's decimal precision to avoid 0.30000000000004.
        const stepAttr = parseFloat(inp.step);
        const baseStep = (stepAttr && stepAttr > 0) ? stepAttr : 1;
        const step = e.altKey ? baseStep * 10 : baseStep;
        const delta = e.deltaY < 0 ? step : -step;
        const decimals = (String(inp.step).split('.')[1] || '').length;
        const next = Number(inp.value) + delta;
        const rounded = decimals ? parseFloat(next.toFixed(decimals)) : next;
        inp.value = clampNum(inp, rounded);
        updateProp(inp.dataset.k, Number(inp.value));
        syncLockRatio(inp.dataset.k);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        clearTimeout(inp.wheelHistTimer);
        inp.wheelHistTimer = setTimeout(() => pushHistory(), 400);
      });
    }
  });

  // Dynamic-data controls (data-merge). Toggling a field flag propagates across the
  // element's link group so a logical slot stays consistent across all sizes.
  propsEl.querySelectorAll('.dm-field-chk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const targetId = chk.dataset.elId;
      const targetEl = (targetId && c) ? c.elements.find(e => e.id === targetId) : el;
      if (!targetEl) return;
      dmToggleField(targetEl, chk.dataset.dmField, chk.checked);
      pushHistory();
      renderProps();
      render(true);
    });
  });

  propsEl.querySelectorAll('.dm-field-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const targetId = sel.dataset.elId;
      const targetEl = (targetId && c) ? c.elements.find(e => e.id === targetId) : el;
      if (!targetEl) return;
      const field = sel.dataset.dmField;
      const k = dmSlotKey(targetEl) + '::' + field;
      if (sel.value) {
        state.dataMerge.mappings[k] = sel.value;
      } else {
        delete state.dataMerge.mappings[k];
      }
      pushHistory();
      render(true);
      renderProps();
    });
  });

  // Highlight active canvas layer on mouseenter / mouseleave of the layer groups in dynamic data multiple-selection view
  propsEl.querySelectorAll('.dd-layer-group').forEach((groupEl) => {
    const targetId = groupEl.dataset.elId;
    const targetEl = (targetId && c) ? c.elements.find(e => e.id === targetId) : null;
    if (!targetEl) return;

    groupEl.onmouseenter = () => {
      const activeCanvasNode = document.querySelector(`.canvas-frame[data-canvas-id="${state.activeCanvasId}"] .canvas`);
      if (activeCanvasNode) {
        activeCanvasNode.querySelectorAll('.layer-hover-outline').forEach(n => n.remove());
        const hoverOutline = document.createElement('div');
        hoverOutline.className = 'layer-hover-outline';
        hoverOutline.style.left = (targetEl.x - 1.5) + 'px';
        hoverOutline.style.top = (targetEl.y - 1.5) + 'px';
        hoverOutline.style.width = (targetEl.width + 3) + 'px';
        hoverOutline.style.height = (targetEl.height + 3) + 'px';
        hoverOutline.style.transform = `rotate(${targetEl.rotation || 0}deg)`;
        hoverOutline.style.transformOrigin = 'center';
        activeCanvasNode.appendChild(hoverOutline);
      }
    };

    groupEl.onmouseleave = () => {
      const activeCanvasNode = document.querySelector(`.canvas-frame[data-canvas-id="${state.activeCanvasId}"] .canvas`);
      if (activeCanvasNode) {
        activeCanvasNode.querySelectorAll('.layer-hover-outline').forEach(n => n.remove());
      }
    };
  });

  const dmOpenBtn = propsEl.querySelector('#dm-open-from-props');
  if (dmOpenBtn) dmOpenBtn.addEventListener('click', () => openDataPanel());

  // Dynamic Data header carries the element name — marquee-scroll it on hover
  // when the combined title is too long to fit.
  const ddHeader = propsEl.querySelector('#header-dynamic-data');
  const ddMarquee = ddHeader && ddHeader.querySelector('.dd-marquee');
  if (ddMarquee) {
    ddHeader.addEventListener('mouseenter', () => {
      if (ddMarquee.scrollWidth > ddMarquee.clientWidth) {
        let pos = 0;
        ddMarquee.dataset.scrollInterval = setInterval(() => {
          pos += 1;
          if (pos > ddMarquee.scrollWidth - ddMarquee.clientWidth + 20) {
            pos = 0;
            ddMarquee.scrollLeft = 0;
          } else {
            ddMarquee.scrollLeft = pos;
          }
        }, 30);
      }
    });
    ddHeader.addEventListener('mouseleave', () => {
      if (ddMarquee.dataset.scrollInterval) {
        clearInterval(ddMarquee.dataset.scrollInterval);
        ddMarquee.dataset.scrollInterval = '';
        ddMarquee.scrollLeft = 0;
      }
    });
  }

  propsEl.querySelectorAll('.cp-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = btn.dataset.k;
      let val = el[key];
      openColorPicker(btn, key, val);
    });
  });

  propsEl.querySelectorAll('.hex-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const k = btn.dataset.targetK;
      const inp = btn.parentElement.querySelector(`input[data-k="${k}"]`);
      if (!inp) return;
      const raw = String(inp.value || '').trim();
      const hex = (raw.startsWith('#') ? raw : '#' + raw).toUpperCase();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hex);
      }
      const original = btn.innerHTML;
      btn.innerHTML = '<span style="font-size:11px; font-weight:700; color:var(--accent-base);">✓</span>';
      setTimeout(() => { btn.innerHTML = original; }, 900);
    });
  });

  let activePreviewVal = null;
  const startPreviewLoop = (val) => {
    if (state.previewTimeoutId) {
      clearTimeout(state.previewTimeoutId);
      state.previewTimeoutId = null;
    }
    activePreviewVal = val;
    if (val === 'none') {
      resetPreviewNodes();
      return;
    }
    document.body.classList.add('previewing-animation-hover');

    const runLoop = () => {
      if (activePreviewVal !== val) return;
      
      const domNodes = getPreviewDomNodes(el, 'inAnim');
      
      domNodes.forEach(node => {
        if (!node) return;
        node.style.animation = '';
        node.style.transformOrigin = '';
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        const targetCanvas = state.canvases.find(c => c.elements.some(e => e.id === nodeEl.id)) || getActiveCanvas();
        const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);
        if (isMaskedImg) {
          const innerImg = node.querySelector('img');
          if (innerImg) {
            innerImg.style.animation = '';
            innerImg.style.transformOrigin = '';
          }
        }
        if (nodeEl.isMask && targetCanvas) {
          const imgEl = targetCanvas.elements.find(x => findMaskAbove(targetCanvas, x) === nodeEl);
          if (imgEl) {
            const imgDom = document.querySelector(`.el[data-id="${imgEl.id}"]`);
            if (imgDom) {
              imgDom.style.animation = '';
              imgDom.style.transformOrigin = '';
            }
          }
        }
        const target = node.querySelector('.editable') || node.querySelector('span');
        if (target && target.dataset.origHtml !== undefined) {
          target.innerHTML = target.dataset.origHtml;
          if (target.dataset.origStyle !== undefined) {
            target.setAttribute('style', target.dataset.origStyle);
          }
          ['origHtml', 'origStyle', 'bgInited', 'bgColor', 'bgPadL', 'bgPadV', 'bgCov', 'bgDelay', 'bgDuration', 'bgAnim'].forEach(k => delete target.dataset[k]);
        }
        if (nodeEl.type === 'button') {
          const fillBg = node.querySelector('div[style*="position: absolute"], div[style*="position:absolute"]');
          if (fillBg) {
            fillBg.style.animation = '';
            fillBg.style.transformOrigin = '';
          }
          const strokeSvg = node.querySelector('svg[style*="position: absolute"], svg[style*="position:absolute"]');
          if (strokeSvg) {
            strokeSvg.style.animation = '';
            strokeSvg.style.transformOrigin = '';
          }
        }
      });

      domNodes.forEach(node => { if (node) void node.offsetHeight; });

      let maxDur = 1;
      // Mask keyframes are collected across ALL nodes and written to the style
      // tag once after the loop. Writing the tag per-node clobbered every
      // previous mask's keyframes, so with linked masks only the last canvas
      // in state.canvases ever previewed.
      const maskPreviewKeyframes = [];
      domNodes.forEach(node => {
        if (node) {
          const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
          const mergedEl = {
            ...nodeEl,
            animType: el.animType,
            animDuration: el.animDuration,
            animDelay: el.animDelay,
            animFadeLetters: el.animFadeLetters,
            animFadeBg: el.animFadeBg,
            animateBg: el.animateBg,
            bgOffset: el.bgOffset,
            animStaggerText: el.animStaggerText,
            zoomAnchor: el.zoomAnchor,
            animAngle: el.animAngle,
            zoomFrom: el.zoomFrom,
            animFade: el.animFade,
            animBounce: el.animBounce,
            animDirection: el.animDirection,
            animDistance: el.animDistance,
            riseSplit: el.riseSplit
          };
          let previewVal = val;
          if (previewVal === 'swipe') {
            const currentSwipeDir = (mergedEl.animType || 'none').startsWith('swipe-') ? mergedEl.animType.replace('swipe-', '') : 'right';
            previewVal = `swipe-${currentSwipeDir}`;
          }
          if (previewVal === 'none') return;

          const dur = Number(mergedEl.animDuration || 1);
          const del = Number(mergedEl.animDelay || 0);
          maxDur = Math.max(maxDur, dur + del);

          if ((mergedEl.type === 'text' || mergedEl.type === 'button') && (previewVal === 'typing' || previewVal === 'fade-typing' || previewVal === 'word-fade' || previewVal === 'rise')) {
            const target = node.querySelector('.editable') || node.querySelector('span');
            if (target) {
              target.dataset.origHtml = target.innerHTML;
              target.dataset.origStyle = target.getAttribute('style') || '';
              const totalDur = mergedEl.animDuration || 1;
              const baseDelay = mergedEl.animDelay || 0;

              const overrides = typeof dmDisplay === 'function' ? dmDisplay(mergedEl) : {};
              const displayText = overrides.text !== undefined ? overrides.text : (mergedEl.text || '');

              if (previewVal === 'rise' && typeof buildRiseContentHTML === 'function') {
                // Same builder the export uses — identical markup, timing, ease.
                const escP = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                target.innerHTML = buildRiseContentHTML({ ...mergedEl, text: displayText }, escP, false);
                // Line mode: group by the VISUAL lines the words landed on.
                const riseMarker = target.querySelector('[data-rise-lines]');
                if (riseMarker && typeof setupRiseLines === 'function') setupRiseLines(riseMarker);
              } else if (previewVal === 'typing' || previewVal === 'fade-typing') {
                const chars = [...displayText];
                const fadeLetters = mergedEl.animFadeLetters !== false;
                const charDur = fadeLetters ? 0.3 : 0.01;
                const nonNewlines = chars.filter(c => c !== '\n').length;
                const charDelay = totalDur / Math.max(1, nonNewlines);
                let spanIdx = 0;
                target.innerHTML = chars.map((c) => {
                   if (c === '\n') return '<br/>';
                   const del = (Number(baseDelay) + spanIdx * charDelay).toFixed(3);
                   spanIdx++;
                   const escC = c === ' ' ? ' ' : c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                   return `<span style="opacity:0; animation: anim-fade-in ${charDur}s linear ${del}s both;">${escC}</span>`;
                }).join('');
              } else if (previewVal === 'word-fade') {
                const words = displayText.split(/(\s+)/);
                const nonSpas = words.filter(w => /\S/.test(w));
                const wordDur = 0.3;
                const wordDelay = totalDur / Math.max(1, nonSpas.length);
                let wordIdx = 0;
                target.innerHTML = words.map(w => {
                  if (w === '\n') return '<br/>';
                  if (/\s+/.test(w)) return w.replace(/\n/g, '<br/>');
                  const del = (Number(baseDelay) + wordIdx * wordDelay).toFixed(3);
                  wordIdx++;
                  const escW = w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                  return `<span style="opacity:0; display:inline-block; animation: anim-fade-in ${wordDur}s linear ${del}s both;">${escW}</span>`;
                }).join('');
              }

              const fadeBg = mergedEl.animFadeBg !== undefined ? mergedEl.animFadeBg : (mergedEl.type === 'button' ? true : !!mergedEl.animateBg);
              if (mergedEl.type === 'text' && mergedEl.hasBg && fadeBg && (previewVal === 'typing' || previewVal === 'fade-typing' || previewVal === 'word-fade')) {
                const lr = mergedEl.bgPadL !== undefined ? mergedEl.bgPadL : 8;
                const tb = mergedEl.bgPadV !== undefined ? mergedEl.bgPadV : 4;
                const cov = mergedEl.bgCoverage !== undefined ? mergedEl.bgCoverage : 100;
                const opa = (mergedEl.bgOpacity !== undefined ? mergedEl.bgOpacity : 100) / 100;
                const bgRgba = hexToRgba(mergedEl.bg || '#000000', opa);
                let offset = Number(mergedEl.bgOffset) || 0;
                if (offset === 0 && (previewVal === 'typing' || previewVal === 'fade-typing' || previewVal === 'word-fade')) {
                  offset = -0.1;
                }
                const bgDelay = Number(baseDelay) + offset;
                target.style.backgroundImage = '';
                target.style.boxDecorationBreak = '';
                target.style.removeProperty('-webkit-box-decoration-break');
                target.style.display = 'inline-block';
                target.style.position = 'relative';
                target.style.isolation = 'isolate';
                target.style.maxWidth = '100%';
                target.dataset.bgColor = bgRgba;
                target.dataset.bgPadL = lr;
                target.dataset.bgPadV = tb;
                target.dataset.bgCov = cov;
                target.dataset.bgDelay = bgDelay;
                target.dataset.bgDuration = totalDur;
                requestAnimationFrame(() => setupTextLineBgs(target));
              }

              if (mergedEl.type === 'button' && fadeBg) {
                const fillBg = node.querySelector('div[style*="position: absolute"], div[style*="position:absolute"]');
                if (fillBg) {
                  fillBg.style.animation = `anim-fade-in ${dur}s ease-out ${del}s both`;
                }
                const strokeSvg = node.querySelector('svg[style*="position: absolute"], svg[style*="position:absolute"]');
                if (strokeSvg) {
                  strokeSvg.style.animation = `anim-fade-in ${dur}s ease-out ${del}s both`;
                }
              }
            }
          } else {
            const targetCanvas = state.canvases.find(c => c.elements.some(x => x.id === nodeEl.id)) || getActiveCanvas();
            const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);
            const targetNode = isMaskedImg ? node.querySelector('img') : node;

            if (previewVal === 'split') {
              const angle = mergedEl.animAngle !== undefined ? mergedEl.animAngle : 0;
              const fromPoly = getSplitClipPath(angle);
              const fadeFrom = mergedEl.animFade !== false ? 'opacity: 0;' : '';
              const fadeTo = mergedEl.animFade !== false ? 'opacity: 1;' : '';
              let styleTag = document.getElementById('dynamic-anim-styles');
              if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-anim-styles';
                document.head.appendChild(styleTag);
              }
              const keyframesRule = `
@keyframes anim-split-${mergedEl.id} {
  from { clip-path: ${fromPoly}; ${fadeFrom} }
  to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); ${fadeTo} }
}`;
              const regex = new RegExp(`@keyframes\\s+anim-split-${mergedEl.id}\\s*\\{[\\s\\S]*?\\n\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
              targetNode.style.animation = `anim-split-${mergedEl.id} ${mergedEl.animDuration || 1}s ease-out 0s both`;
            } else if (previewVal === 'zoom' || previewVal === 'zoom-in' || previewVal === 'pop-in') {
              const tempEl = { ...mergedEl };
              if (previewVal === 'pop-in') {
                tempEl.zoomFrom = 80;
                tempEl.animFade = true;
              } else if (previewVal === 'zoom-in') {
                tempEl.zoomFrom = 110;
                tempEl.animFade = true;
              } else {
                if (tempEl.zoomFrom === undefined) {
                  tempEl.zoomFrom = 80;
                }
              }
              let styleTag = document.getElementById('dynamic-anim-styles');
              if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-anim-styles';
                document.head.appendChild(styleTag);
              }
              const keyframesRule = getZoomKeyframes(tempEl);
              const regex = new RegExp(`@keyframes\\s+anim-zoom-${mergedEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
              const timing = tempEl.animBounce ? 'linear' : 'ease-out';
              if (mergedEl.type === 'button' && mergedEl.animStaggerText) {
                // Background fill
                const fillBg = node.querySelector('div[style*="position: absolute"], div[style*="position:absolute"]');
                if (fillBg) {
                  fillBg.style.animation = `anim-zoom-${mergedEl.id} ${mergedEl.animDuration || 1}s ${timing} 0s both`;
                  fillBg.style.transformOrigin = getTransformOriginValue(mergedEl.zoomAnchor || 'center');
                }
                // Stroke SVG
                const strokeSvg = node.querySelector('svg[style*="position: absolute"], svg[style*="position:absolute"]');
                if (strokeSvg) {
                  strokeSvg.style.animation = `anim-zoom-${mergedEl.id} ${mergedEl.animDuration || 1}s ${timing} 0s both`;
                  strokeSvg.style.transformOrigin = getTransformOriginValue(mergedEl.zoomAnchor || 'center');
                }
                // Text child
                const target = node.querySelector('.editable') || node.querySelector('span');
                if (target) {
                  target.dataset.origStyle = target.getAttribute('style') || '';
                  target.dataset.origHtml = target.innerHTML;
                  target.style.display = 'inline-block';
                  target.style.transformOrigin = 'center';
                  target.style.animation = `anim-zoom-${mergedEl.id} ${mergedEl.animDuration || 1}s ${timing} 0.15s both`;
                }
              } else {
                targetNode.style.animation = `anim-zoom-${mergedEl.id} ${mergedEl.animDuration || 1}s ${timing} 0s both`;
                targetNode.style.transformOrigin = getTransformOriginValue(mergedEl.zoomAnchor || 'center');
              }
            } else if (previewVal === 'blur') {
              let styleTag = document.getElementById('dynamic-anim-styles');
              if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-anim-styles';
                document.head.appendChild(styleTag);
              }
              const keyframesRule = getBlurKeyframes(mergedEl);
              const regex = new RegExp(`@keyframes\\s+anim-blur-${mergedEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
              targetNode.style.animation = `anim-blur-${mergedEl.id} ${mergedEl.animDuration || 1}s ease-out 0s both`;
              targetNode.style.transformOrigin = getTransformOriginValue(mergedEl.zoomAnchor || 'center');
            } else if (previewVal === 'slide' || previewVal === 'slide-up' || previewVal === 'slide-down' || previewVal === 'slide-left' || previewVal === 'slide-right') {
              const tempEl = { ...mergedEl };
              if (previewVal === 'slide-up') { tempEl.animDirection = 'up'; tempEl.animDistance = 20; }
              else if (previewVal === 'slide-down') { tempEl.animDirection = 'down'; tempEl.animDistance = 20; }
              else if (previewVal === 'slide-left') { tempEl.animDirection = 'left'; tempEl.animDistance = 20; }
              else if (previewVal === 'slide-right') { tempEl.animDirection = 'right'; tempEl.animDistance = 20; }
              else {
                if (tempEl.animDirection === undefined) tempEl.animDirection = 'up';
                if (tempEl.animDistance === undefined) tempEl.animDistance = 100;
              }
              let styleTag = document.getElementById('dynamic-anim-styles');
              if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-anim-styles';
                document.head.appendChild(styleTag);
              }
              const keyframesRule = getSlideKeyframes(tempEl);
              const regex = new RegExp(`@keyframes\\s+anim-slide-${mergedEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
              const timing = tempEl.animBounce ? 'linear' : 'ease-out';
              targetNode.style.animation = `anim-slide-${mergedEl.id} ${mergedEl.animDuration || 1}s ${timing} 0s both`;
            } else {
              const isSwipe = ['swipe-up', 'swipe-down', 'swipe-left', 'swipe-right'].includes(previewVal);
              const isSlideLike = ['slide-up', 'slide-down', 'slide-left', 'slide-right'].includes(previewVal);
              const fadeOn = mergedEl.animFade !== false;
              const suffix = isSwipe ? (fadeOn ? '-fade' : '') : (isSlideLike && !fadeOn ? '-nofade' : '');
              targetNode.style.animation = `anim-${previewVal}${suffix} ${mergedEl.animDuration || 1}s ease-out 0s both`;
            }

            if (mergedEl.isMask) {
              if (targetCanvas) {
                const imgEl = targetCanvas.elements.find(x => findMaskAbove(targetCanvas, x) === nodeEl);
                if (imgEl) {
                  const imgDom = document.querySelector(`.el[data-id="${imgEl.id}"]`);
                  if (imgDom && typeof generateMaskClipPathKeyframes === 'function') {
                    const maskAnim = generateMaskClipPathKeyframes(mergedEl, imgEl, previewVal);
                    if (maskAnim) {
                      maskPreviewKeyframes.push(maskAnim.keyframes);
                      imgDom.style.animation = maskAnim.animationCss;
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (maskPreviewKeyframes.length) {
        let styleTag = document.getElementById('dynamic-mask-styles');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'dynamic-mask-styles';
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = maskPreviewKeyframes.join('\n');
      }

      state.previewTimeoutId = setTimeout(runLoop, maxDur * 1000 + 400);
    };

    runLoop();
  };

  const resetPreviewNodes = () => {
    document.body.classList.remove('previewing-animation-hover');
    const domNodes = getPreviewDomNodes(el, 'inAnim');
    domNodes.forEach(node => {
      if (node) {
        node.style.animation = '';
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        const targetCanvas = state.canvases.find(c => c.elements.some(e => e.id === nodeEl.id)) || getActiveCanvas();
        const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);

        if (isMaskedImg) {
          const innerImg = node.querySelector('img');
          if (innerImg) {
            innerImg.style.animation = '';
            innerImg.style.removeProperty('--zoom-from');
          }
        }

        if (nodeEl.isMask) {
          if (targetCanvas) {
            const imgEl = targetCanvas.elements.find(x => findMaskAbove(targetCanvas, x) === nodeEl);
            if (imgEl) {
              const imgDom = document.querySelector(`.el[data-id="${imgEl.id}"]`);
              if (imgDom) imgDom.style.animation = '';
              const styleTag = document.getElementById('dynamic-mask-styles');
              if (styleTag) styleTag.textContent = '';
            }
          }
        }
        if (nodeEl.type === 'button') {
          const fillBg = node.querySelector('div[style*="position: absolute"], div[style*="position:absolute"]');
          if (fillBg) {
            fillBg.style.animation = '';
            fillBg.style.transformOrigin = '';
          }
          const strokeSvg = node.querySelector('svg[style*="position: absolute"], svg[style*="position:absolute"]');
          if (strokeSvg) {
            strokeSvg.style.animation = '';
            strokeSvg.style.transformOrigin = '';
          }
        }
        const target = node.querySelector('.editable') || node.querySelector('span');
        if (target && target.dataset.origHtml !== undefined) {
          target.innerHTML = target.dataset.origHtml;
          if (target.dataset.origStyle !== undefined) {
            target.setAttribute('style', target.dataset.origStyle);
          }
          ['origHtml', 'origStyle', 'bgInited', 'bgColor', 'bgPadL', 'bgPadV', 'bgCov', 'bgDelay', 'bgDuration', 'bgAnim'].forEach(k => delete target.dataset[k]);
        }
      }
    });
  };


  propsEl.querySelectorAll('.anchor-dot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const anchorVal = btn.dataset.anchor;
      updateProp('zoomAnchor', anchorVal);
      pushHistory();
      renderProps();
      startPreviewLoop(el.animType || 'none');
    });
    btn.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      const domNodes = getPreviewDomNodes(el, 'inAnim');
      const oldAnchors = new Map();

      domNodes.forEach(node => {
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        oldAnchors.set(nodeEl.id, nodeEl.zoomAnchor);
        nodeEl.zoomAnchor = btn.dataset.anchor;

        let styleTag = document.getElementById('dynamic-anim-styles');
        if (styleTag) {
          const tempEl = { ...nodeEl };
          if (nodeEl.animType === 'blur') {
            const keyframesRule = getBlurKeyframes(tempEl);
            const regex = new RegExp(`@keyframes\\s+anim-blur-${nodeEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
            styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
          } else {
            if (nodeEl.animType === 'pop-in') {
              tempEl.zoomFrom = 80;
              tempEl.animFade = true;
            } else if (nodeEl.animType === 'zoom-in') {
              tempEl.zoomFrom = 110;
              tempEl.animFade = true;
            } else {
              if (tempEl.zoomFrom === undefined) {
                tempEl.zoomFrom = 80;
              }
            }
            const keyframesRule = getZoomKeyframes(tempEl);
            const regex = new RegExp(`@keyframes\\s+anim-zoom-${nodeEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
            styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
          }
        }

        const targetCanvas = state.canvases.find(c => c.elements.some(x => x.id === nodeEl.id)) || getActiveCanvas();
        const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);
        const targetNode = isMaskedImg ? node.querySelector('img') : node;
        if (targetNode) {
          targetNode.style.transformOrigin = getTransformOriginValue(btn.dataset.anchor);
        }
      });

      startPreviewLoop(el.animType || 'none');

      btn.addEventListener('mouseleave', function onLeave() {
        btn.removeEventListener('mouseleave', onLeave);

        domNodes.forEach(node => {
          const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
          const oldAnchor = oldAnchors.get(nodeEl.id);
          nodeEl.zoomAnchor = oldAnchor;

          let styleTag = document.getElementById('dynamic-anim-styles');
          if (styleTag) {
            const tempEl = { ...nodeEl };
            if (nodeEl.animType === 'blur') {
              const keyframesRule = getBlurKeyframes(tempEl);
              const regex = new RegExp(`@keyframes\\s+anim-blur-${nodeEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
            } else {
              if (nodeEl.animType === 'pop-in') {
                tempEl.zoomFrom = 80;
                tempEl.animFade = true;
              } else if (nodeEl.animType === 'zoom-in') {
                tempEl.zoomFrom = 110;
                tempEl.animFade = true;
              } else {
                if (tempEl.zoomFrom === undefined) {
                  tempEl.zoomFrom = 80;
                }
              }
              const keyframesRule = getZoomKeyframes(tempEl);
              const regex = new RegExp(`@keyframes\\s+anim-zoom-${nodeEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
              styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + keyframesRule;
            }
          }

          const targetCanvas = state.canvases.find(c => c.elements.some(x => x.id === nodeEl.id)) || getActiveCanvas();
          const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);
          const targetNode = isMaskedImg ? node.querySelector('img') : node;
          if (targetNode) {
            targetNode.style.transformOrigin = getTransformOriginValue(oldAnchor || 'center');
          }
        });
      });
    });
  });

  const stopAnimPreviewLoop = () => {
    if (activePreviewVal === null && !state.previewTimeoutId) return;
    activePreviewVal = null;
    if (state.previewTimeoutId) {
      clearTimeout(state.previewTimeoutId);
      state.previewTimeoutId = null;
    }
    resetPreviewNodes();
  };
  stopElementAnimPreviewFn = stopAnimPreviewLoop;
  startElementAnimPreviewFn = startPreviewLoop;

  const transitionArea = propsEl.querySelector('#in-transition-preview-area');
  if (transitionArea) {
    transitionArea.addEventListener('mouseleave', stopAnimPreviewLoop);

    transitionArea.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('mouseenter', () => {
        startPreviewLoop(el.animType || 'none');
      });
      input.addEventListener('input', () => {
        startPreviewLoop(el.animType || 'none');
      });
      input.addEventListener('change', () => {
        startPreviewLoop(el.animType || 'none');
      });
    });
  }

  const animDirectionSelect = propsEl.querySelector('#prop-anim-direction');
  if (animDirectionSelect) {
    animDirectionSelect.addEventListener('change', () => {
      const dir = animDirectionSelect.value;
      if ((el.animType || '').startsWith('swipe-')) {
        updateProp('animType', `swipe-${dir}`);
      } else {
        updateProp('animDirection', dir);
      }
      pushHistory();
      renderProps();
    });
  }

  const favFilterBtn = propsEl.querySelector('.fav-filter-btn');
  if (favFilterBtn) {
    favFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.filterFavorites = !state.filterFavorites;
      renderProps();
    });
  }

  let activeEffectVal = null;
  const applyEffectPreview = (val) => {
    activeEffectVal = val;
    if (val === 'none') {
      resetEffectPreviewNodes();
      return;
    }
    document.body.classList.add('previewing-animation-hover');
    
    const domNodes = getPreviewDomNodes(el, 'effect');
    
    domNodes.forEach(node => {
      if (node && val !== 'none') {
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        startEffectPreview(nodeEl, val);
      }
    });
  };

  const resetEffectPreviewNodes = () => {
    document.body.classList.remove('previewing-animation-hover');
    const domNodes = getPreviewDomNodes(el, 'effect');
    domNodes.forEach(node => {
      if (node) {
        node.style.animation = '';
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        const targetCanvas = state.canvases.find(c => c.elements.some(e => e.id === nodeEl.id)) || getActiveCanvas();
        const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, nodeEl);

        if (isMaskedImg) {
          const innerImg = node.querySelector('img');
          if (innerImg) {
            innerImg.style.animation = '';
            innerImg.style.transformOrigin = '';
            innerImg.style.removeProperty('--pan-x');
            innerImg.style.removeProperty('--pan-y');
            innerImg.style.removeProperty('--zoom-target-inverse');
            innerImg.style.removeProperty('--spin-target-inverse');
          }
        }

        if (nodeEl.isMask) {
          if (targetCanvas) {
            const imgEl = targetCanvas.elements.find(x => findMaskAbove(targetCanvas, x) === nodeEl);
            if (imgEl) {
              const imgDom = document.querySelector(`.el[data-id="${imgEl.id}"]`);
              if (imgDom) {
                imgDom.style.animation = '';
                imgDom.style.transformOrigin = '';
                const innerImg = imgDom.querySelector('img');
                if (innerImg) {
                  innerImg.style.animation = '';
                  innerImg.style.transformOrigin = '';
                  innerImg.style.removeProperty('--pan-x');
                  innerImg.style.removeProperty('--pan-y');
                  innerImg.style.removeProperty('--zoom-target-inverse');
                  innerImg.style.removeProperty('--spin-target-inverse');
                }
              }
            }
          }
        }
      }
    });
  };


  const stopEffectPreviewLoop = () => {
    if (activeEffectVal === null && !hoverEffectPreviewActive) return;
    activeEffectVal = null;
    hoverEffectPreviewActive = false;
    resetEffectPreviewNodes();
  };
  stopElementEffectPreviewFn = stopEffectPreviewLoop;
  applyElementEffectPreviewFn = applyEffectPreview;

  const effectsArea = propsEl.querySelector('#effects-preview-area');
  if (effectsArea) {
    effectsArea.addEventListener('mouseleave', stopEffectPreviewLoop);

    effectsArea.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('mouseenter', () => {
        applyEffectPreview(el.effectType || 'none');
      });
      input.addEventListener('input', () => {
        applyEffectPreview(el.effectType || 'none');
      });
      input.addEventListener('change', () => {
        applyEffectPreview(el.effectType || 'none');
      });
    });
  }

  // ---- OUT (exit) animation hover preview ----
  // Loops the chosen exit on the selected element(s) in the canvas, mirroring the
  // IN-animation hover preview. Static presets (fade/swipe/blur) use styles.css
  // keyframes; slide/zoom inject per-id keyframes into the shared dynamic style tag.
  let activeExitVal = null;
  // A mask's own node is invisible (its geometry only drives the image's
  // clip-path), so its exit preview plays on the masked image instead —
  // clearing must reach that node too.
  const clearMaskExitMirror = (node) => {
    if (!node) return;
    const nodeEl = state.canvases.flatMap(c => c.elements).find(x => x.id === node.dataset.id);
    if (!nodeEl || !nodeEl.isMask) return;
    const nodeCanvas = state.canvases.find(c => c.elements.some(x => x.id === nodeEl.id));
    if (!nodeCanvas) return;
    const imgEl = nodeCanvas.elements.find(x => findMaskAbove(nodeCanvas, x) === nodeEl);
    const imgDom = imgEl && document.querySelector(`.el[data-id="${imgEl.id}"]`);
    if (!imgDom) return;
    imgDom.style.animation = '';
    imgDom.style.transformOrigin = '';
    const innerImg = imgDom.querySelector('img');
    if (innerImg) innerImg.style.animation = '';
  };
  const resetExitPreviewNodes = () => {
    document.body.classList.remove('previewing-animation-hover');
    getPreviewDomNodes(el, 'outAnim').forEach(node => {
      if (!node) return;
      node.style.animation = '';
      node.style.transformOrigin = '';
      clearMaskExitMirror(node);
    });
  };
  const startExitPreviewLoop = (exitVal) => {
    if (state.exitPreviewTimeoutId) { clearTimeout(state.exitPreviewTimeoutId); state.exitPreviewTimeoutId = null; }
    activeExitVal = exitVal;
    if (!exitVal) { resetExitPreviewNodes(); return; }
    document.body.classList.add('previewing-animation-hover');
    const MOTION = el.exitDuration !== undefined ? el.exitDuration : 0.6;
    const ensureStyleTag = () => {
      let s = document.getElementById('dynamic-anim-styles');
      if (!s) { s = document.createElement('style'); s.id = 'dynamic-anim-styles'; document.head.appendChild(s); }
      return s;
    };
    const runLoop = () => {
      if (activeExitVal !== exitVal) return;
      const domNodes = getPreviewDomNodes(el, 'outAnim');
      domNodes.forEach(node => { if (node) { node.style.animation = ''; node.style.transformOrigin = ''; clearMaskExitMirror(node); void node.offsetHeight; } });
      domNodes.forEach(node => {
        if (!node) return;
        const nodeEl = state.canvases.flatMap(c => c.elements).find(e => e.id === node.dataset.id) || el;
        const merged = { ...nodeEl, exitType: el.exitType, exitFade: el.exitFade, exitDirection: el.exitDirection, exitDistance: el.exitDistance, exitDuration: el.exitDuration };
        const fadeOn = merged.exitFade !== false;
        const dir = merged.exitDirection || (exitVal === 'swipe' ? 'left' : 'down');
        let name = '';
        if (exitVal === 'fade-out') name = 'anim-fade-out';
        else if (exitVal === 'blur') name = 'anim-blur-out' + (fadeOn ? '' : '-nofade');
        else if (exitVal === 'swipe') name = `anim-swipe-out-${dir}` + (fadeOn ? '-fade' : '');
        else if (exitVal === 'slide') {
          const tag = ensureStyleTag();
          const re = new RegExp(`@keyframes\\s+anim-slide-out-${merged.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
          tag.textContent = tag.textContent.replace(re, '') + '\n' + getSlideOutKeyframes(merged);
          name = `anim-slide-out-${merged.id}`;
        } else if (exitVal === 'zoom') {
          const tag = ensureStyleTag();
          const re = new RegExp(`@keyframes\\s+anim-zoom-out-${merged.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
          tag.textContent = tag.textContent.replace(re, '') + '\n' + getZoomOutKeyframes(merged);
          name = `anim-zoom-out-${merged.id}`;
          node.style.transformOrigin = 'center';
        }
        if (name) node.style.animation = `${name} ${MOTION}s ease-in 0.35s forwards`;
        if (name && nodeEl.isMask) {
          // The mask node is invisible — play the exit on the masked image.
          const nodeCanvas = state.canvases.find(cv => cv.elements.some(x => x.id === nodeEl.id)) || getActiveCanvas();
          const imgEl = nodeCanvas && nodeCanvas.elements.find(x => findMaskAbove(nodeCanvas, x) === nodeEl);
          const imgDom = imgEl && document.querySelector(`.el[data-id="${imgEl.id}"]`);
          if (imgDom) {
            if (exitVal === 'swipe') {
              // swipe-out animates clip-path, which would clobber the mask's own
              // clip-path on the wrapper — run it on the inner <img> instead.
              const innerImg = imgDom.querySelector('img');
              if (innerImg) innerImg.style.animation = `${name} ${MOTION}s ease-in 0.35s forwards`;
            } else {
              if (exitVal === 'zoom') {
                imgDom.style.transformOrigin = `${nodeEl.x + nodeEl.width / 2 - imgEl.x}px ${nodeEl.y + nodeEl.height / 2 - imgEl.y}px`;
              }
              imgDom.style.animation = `${name} ${MOTION}s ease-in 0.35s forwards`;
            }
          }
        }
      });
      // pause after the leave, then replay
      state.exitPreviewTimeoutId = setTimeout(runLoop, MOTION * 1000 + 1100);
    };
    runLoop();
  };
  const stopExitPreviewLoop = () => {
    if (activeExitVal === null && !state.exitPreviewTimeoutId) return;
    activeExitVal = null;
    if (state.exitPreviewTimeoutId) { clearTimeout(state.exitPreviewTimeoutId); state.exitPreviewTimeoutId = null; }
    resetExitPreviewNodes();
  };
  stopElementExitPreviewFn = stopExitPreviewLoop;
  startElementExitPreviewFn = startExitPreviewLoop;

  const outArea = propsEl.querySelector('#out-transition-preview-area');
  if (outArea) {
    outArea.addEventListener('mouseleave', stopExitPreviewLoop);
    outArea.querySelectorAll('input, select').forEach(input => {
      const fire = () => { if (el.exitEnabled) startExitPreviewLoop(el.exitType || 'fade-out'); };
      input.addEventListener('mouseenter', fire);
      input.addEventListener('input', fire);
      input.addEventListener('change', fire);
    });
  }

  propsEl.querySelectorAll('.align-btn[data-align]').forEach(btn => {
    if (btn.classList.contains('action-el-align')) {
      btn.addEventListener('click', () => {
        const align = btn.dataset.align;
        const c = getActiveCanvas();
        if (!c) return;
        const els = state.layerSelection?.length > 1 ? c.elements.filter(e => state.layerSelection.includes(e.id)) : [el];

        els.forEach(targetEl => {
          if (align === 'left') targetEl.x = 0;
          if (align === 'center') targetEl.x = Math.round((c.width - targetEl.width) / 2);
          if (align === 'right') targetEl.x = c.width - targetEl.width;
          if (align === 'top') targetEl.y = 0;
          if (align === 'middle') targetEl.y = Math.round((c.height - targetEl.height) / 2);
          if (align === 'bottom') targetEl.y = c.height - targetEl.height;
          if (targetEl.autoArranged) delete targetEl.autoArranged;
        });

        pushHistory();
        render();
      });
    } else {
      btn.addEventListener('click', () => {
        updateProp('textAlign', btn.dataset.align);
        pushHistory();
        renderProps();
      });
    }
  });

  propsEl.querySelectorAll('.valign-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateProp('verticalAlign', btn.dataset.valign);
      pushHistory();
      renderProps();
    });
  });

  const upload = propsEl.querySelector('#img-upload');
  if (upload) {
    const overlayBrowseBtn = propsEl.querySelector('#overlay-browse-btn');
    if (overlayBrowseBtn) {
      overlayBrowseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        upload.click();
      });
    }
    const previewContainer = propsEl.querySelector('.img-preview-container');
    if (previewContainer) {
      previewContainer.addEventListener('click', () => {
        upload.click();
      });
    }
  }
  if (upload) upload.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const id = 'img_' + uid();
      if (!state.assets) state.assets = {};
      state.assets[id] = fr.result;
      if (!state.assetNames) state.assetNames = {};
      state.assetNames[id] = f.name;
      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
      if (_imgDyn) {
        // Dynamic image slot: write to the active version's cell, or do nothing when
        // locked (read-only) — never overwrite the template default.
        if (!state.dataMerge.locked) dmWriteCell(el, 'image', id);
        else { showAdflowAlert('Data lock is on — unlock to change this version’s image.'); }
      } else {
        el.assetId = id;
      }
      if (!el.name || el.name.startsWith('Image')) el.name = f.name;
      el.isCompressed = false;
      delete el.webpQuality;
      pushHistory();
      render();
    };
    fr.readAsDataURL(f);
  });

  const btnCompress = propsEl.querySelector('#btn-webp-compress');
  if (btnCompress) {
    btnCompress.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const origText = btnCompress.textContent;
      btnCompress.textContent = 'Compressing...';
      btnCompress.disabled = true;
      try {
        await autoCompressImage(el);
      } catch (err) {
        console.error(err);
        showAdflowAlert('Failed to auto-compress image: ' + err.message);
      } finally {
        btnCompress.textContent = origText;
        btnCompress.disabled = false;
      }
    };
  }
  const btnSettings = propsEl.querySelector('#btn-webp-settings');
  if (btnSettings) {
    btnSettings.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await openWebpCompressionModal(el);
    };
  }
  const btnCrop = propsEl.querySelector('#btn-image-crop');
  if (btnCrop) {
    btnCrop.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
      if (_imgDyn && state.dataMerge && state.dataMerge.locked) {
        showAdflowAlert('Data lock is on — unlock to crop this version’s image.');
        return;
      }
      openImageCropModal(el);
    };
  }

  const btnRemove = propsEl.querySelector('#btn-image-remove');
  if (btnRemove) {
    btnRemove.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
      if (_imgDyn && state.dataMerge && state.dataMerge.locked) {
        showAdflowAlert('Data lock is on — unlock to remove this version’s image.');
        return;
      }
      delete el.assetId;
      delete el.name;
      delete el.isCompressed;
      delete el.webpQuality;
      delete el.cropOriginalAssetId;
      delete el.cropRegion;
      delete el.cropRotation;
      delete el.cropMirror;

      if (_imgDyn && state.dataMerge && state.dataMerge.mappings) {
        const sk = dmSlotKey(el) + '::image';
        delete state.dataMerge.mappings[sk];
      }

      pushHistory();
      render();
    };
  }

  if (typeof syncColorPickerWithSelection === 'function') {
    syncColorPickerWithSelection(el, null);
  }
  const canvasActiveIdx = state.frames.findIndex(fr => fr.id === state.activeFrameId);
  if (state.loopAd || (state.frames.length > 1 && canvasActiveIdx > 0)) {
    wireFrameTransitionEvents();
  }
  initCollapsiblePanels();

  // Animation-category toggles (IN / OUT / FX / TRANS). Each independently turns its
  // category on/off by driving the underlying field; the legacy animationMode field
  // is cleared on any toggle so it can't override the runtime.
  propsEl.querySelectorAll('.anim-mode-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const which = btn.dataset.animToggle;
      delete el.animationMode;
      // Each toggle flips an enable flag and leaves the chosen preset untouched, so
      // turning a category off and back on restores exactly what was selected
      // (including "none" if nothing was ever picked).
      if (which === 'in') {
        updateProp('inEnabled', !animInEnabled(el));
      } else if (which === 'out') {
        if (!animInEnabled(el)) return; // OUT requires IN
        updateProp('exitEnabled', !el.exitEnabled);
        if (el.exitEnabled && !el.exitType) updateProp('exitType', 'fade-out');
      } else if (which === 'fx') {
        updateProp('fxEnabled', !animFxEnabled(el));
      }
      
      if (el.linkGroupId && state.linkGroups) {
        const lg = state.linkGroups[el.linkGroupId];
        if (lg) {
          if (!lg.syncProperties) lg.syncProperties = {};
          if (which === 'in') {
            const nextVal = animInEnabled(el);
            lg.syncProperties.inAnim = nextVal;
            if (!nextVal) {
              lg.syncProperties.outAnim = false;
            }
          } else if (which === 'out') {
            lg.syncProperties.outAnim = animOutEnabled(el);
          } else if (which === 'fx') {
            lg.syncProperties.effect = animFxEnabled(el);
          }
        }
      }
      pushHistory();
      renderProps();
      render(true);
    });
  });

  wireCustomSelects(el, updateProp);
}

