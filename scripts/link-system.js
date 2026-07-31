// ============================================================================
// Element Linking System Helpers & Operations
// ============================================================================

function areStylesAndNamesEqual(el1, el2) {
  if (el1.type !== el2.type) return false;
  // A mask and a plain shape are not siblings even when they share a name and
  // type — they play different roles, and pairing them would sync geometry and
  // visibility between a clip silhouette and ordinary artwork. Masks auto-link
  // with masks, shapes with shapes.
  if (!!el1.isMask !== !!el2.isMask) return false;
  return baseLayerLabel(el1) === baseLayerLabel(el2);
}

// Is this image currently clipped by a mask directly above it? Needs the element's
// canvas, since the mask relationship is positional. Guarded because the helpers
// live in later-loading files (available by call time, not load time).
function isMaskedImageEl(el) {
  if (!el || el.type !== 'image') return false;
  if (typeof findElementById !== 'function' || typeof findMaskAbove !== 'function') return false;
  const found = findElementById(el.id);
  return !!(found && findMaskAbove(found.canvas, el));
}

function getDefaultSync(el) {
  const cat = getElementCategory(el);
  const defaultSync = {};
  if (!cat) return defaultSync;

  defaultSync.customName = true;

  const isRoleAssigned = el.role && el.role !== 'misc';

  if (cat === 'text') {
    defaultSync.text = true;
    defaultSync.font = !isRoleAssigned;      // Unchecked by default for role-assigned (syncs justification/textAlign)
    defaultSync.fontSize = !isRoleAssigned;  // Unchecked by default for role-assigned
    defaultSync.color = true;
    defaultSync.background = true;
    defaultSync.opacity = true;
    defaultSync.inAnim = true;
    defaultSync.outAnim = true;
    defaultSync.effect = true;
    defaultSync.visibility = true;
  } else if (cat === 'button') {
    defaultSync.text = true;
    defaultSync.textColor = true;
    defaultSync.font = !isRoleAssigned;      // Unchecked by default for role-assigned (syncs fontSize, textAlign, wrapText)
    defaultSync.fill = true;
    defaultSync.stroke = true;
    defaultSync.radius = true;
    defaultSync.transform = !isRoleAssigned; // Unchecked by default for role-assigned (syncs width, height)
    defaultSync.opacity = true;
    defaultSync.inAnim = true;
    defaultSync.outAnim = true;
    defaultSync.effect = true;
    defaultSync.visibility = true;
  } else if (cat === 'image') {
    defaultSync.image = true;
    const isRmitLogo = el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit') && el.customName.toLowerCase().includes('logo'));
    if (isRmitLogo) {
      defaultSync.variant = true;
    }
    // A MASKED image's size is half of a per-canvas pair: its mask is sized to it
    // on that canvas, and the mask's own Transform sync is off for the same
    // reason. Syncing only one side's width/height across canvases would leave
    // the clip no longer matching the picture, so both start off. Still tickable
    // in the Link Groups panel — but tick it on both halves, not one.
    defaultSync.transform = isMaskedImageEl(el) ? false : !isRoleAssigned;
    defaultSync.opacity = true;
    defaultSync.rotation = true;
    defaultSync.inAnim = true;
    defaultSync.outAnim = true;
    defaultSync.effect = true;
    defaultSync.visibility = true;
  } else if (cat === 'shape') {
    defaultSync.fill = true;
    defaultSync.stroke = true;
    defaultSync.radius = true;
    // Mask geometry is deliberately per-canvas: a mask's size is tied to the
    // image it clips on ITS canvas, and auto-resize's mask post-pass realigns it
    // to that image independently of link sync. Copying one canvas's width and
    // height onto every size would distort the clip and fight that pass — so
    // Transform starts off for masks. Still user-enablable in the panel.
    defaultSync.transform = el.isMask ? false : !isRoleAssigned;
    defaultSync.opacity = true;
    defaultSync.inAnim = true;
    defaultSync.outAnim = true;
    defaultSync.effect = true;
    defaultSync.visibility = true;
  } else if (cat === 'line') {
    defaultSync.color = true;
    defaultSync.thickness = true;
    defaultSync.opacity = true;
    defaultSync.inAnim = true;
    defaultSync.outAnim = true;
    defaultSync.effect = true;
    defaultSync.visibility = true;
  }
  return defaultSync;
}

async function autoLinkElements(forceSelectedOnly = false) {
  const chkSelectedOnly = document.getElementById('lnk-opt-selected-only');
  const selectedOnly = forceSelectedOnly || (chkSelectedOnly ? chkSelectedOnly.checked : false);

  let allowedTargets = null;
  if (selectedOnly) {
    const selectedCanvas = getActiveCanvas();
    if (!selectedCanvas || !state.layerSelection?.length) {
      await showAdflowAlert("No elements are currently selected. Select one or more elements to use 'Selected only' auto-linking.");
      return;
    }
    allowedTargets = state.layerSelection.map(id => {
      const el = selectedCanvas.elements.find(x => x.id === id);
      return el;
    }).filter(Boolean);
  }

  const allElements = [];
  state.canvases.forEach(canvas => {
    canvas.elements.forEach(el => {
      if (allowedTargets) {
        const matchesAllowed = allowedTargets.some(target => areStylesAndNamesEqual(el, target));
        if (matchesAllowed) {
          allElements.push(el);
        }
      } else {
        allElements.push(el);
      }
    });
  });

  const processedElementIds = new Set();
  let countLinked = 0;
  let countGroupsCreated = 0;

  for (let i = 0; i < allElements.length; i++) {
    const el1 = allElements[i];
    if (processedElementIds.has(el1.id)) continue;

    const set = [el1];
    for (let j = i + 1; j < allElements.length; j++) {
      const el2 = allElements[j];
      if (areStylesAndNamesEqual(el1, el2)) {
        set.push(el2);
      }
    }

    if (set.length > 1) {
      set.forEach(el => processedElementIds.add(el.id));

      let existingGid = null;
      for (let el of set) {
        if (el.linkGroupId && state.linkGroups?.[el.linkGroupId]) {
          existingGid = el.linkGroupId;
          break;
        }
      }

      let gid = existingGid;
      if (!gid) {
        const baseName = baseLayerLabel(el1);
        const name = baseName + " Group";
        const cat = getElementCategory(el1);
        gid = 'lg_' + uid();

        const defaultSync = getDefaultSync(el1);

        if (!state.linkGroups) state.linkGroups = {};
        state.linkGroups[gid] = {
          id: gid,
          name: name,
          category: cat,
          syncProperties: defaultSync
        };
        countGroupsCreated++;
      }

      set.forEach(el => {
        if (el.linkGroupId !== gid) {
          if (typeof dmMigrateSlotKey === 'function') {
            dmMigrateSlotKey(el, gid);
          }
          el.linkGroupId = gid;
          countLinked++;
        }
      });
    }
  }

  if (countLinked > 0) {
    pushHistory();
    render();
  } else {
    if (selectedOnly) {
      const selectedCanvas = getActiveCanvas();
      const selectedEls = selectedCanvas && state.layerSelection?.length
        ? state.layerSelection.map(id => selectedCanvas.elements.find(x => x.id === id)).filter(Boolean)
        : [];
      const allSelectedLinked = selectedEls.length > 0 && selectedEls.every(el => el.linkGroupId && state.linkGroups?.[el.linkGroupId]);
      if (allSelectedLinked) {
        await showAdflowAlert("The selected element is already linked, and no other matching elements were found to link.");
        return;
      }
    }

    const anyLinked = allElements.some(el => el.linkGroupId && state.linkGroups?.[el.linkGroupId]);
    if (anyLinked) {
      await showAdflowAlert("Matching elements are already linked, and no new matching elements were found.");
    } else {
      await showAdflowAlert("No matching elements with the same layer name and style were found.");
    }
  }
}

// May this element join this link group?
//
// A link group holds ONE kind of layer: applyLinkSync branches on group.category,
// so an element sitting in a mismatched group gets the wrong sync rules applied to
// it — a rect mask inside an `image` group would have an assetId copied onto it,
// and an image inside a `shape` group would be driven by fill/stroke rules.
//
// This is also what keeps a mask and the image it clips out of the SAME group:
// they are different categories by definition (shape vs image), so the category
// test separates them on its own. The explicit partner test is a backstop, so the
// guarantee doesn't silently depend on that coincidence holding forever.
function canElementJoinGroup(el, gid) {
  const group = state.linkGroups?.[gid];
  if (!el || !group) return false;
  const cat = getElementCategory(el);
  if (!cat || cat !== group.category) return false;
  const partner = maskPartnerOf(el);
  if (partner && partner.linkGroupId === gid) return false;
  return true;
}

// The other half of a mask pair: for a mask, the image beneath it; for a masked
// image, the mask above it. Null when the element isn't part of a pair.
function maskPartnerOf(el) {
  if (!el) return null;
  const found = (typeof findElementById === 'function') ? findElementById(el.id) : null;
  const canvas = found && found.canvas;
  if (!canvas) return null;
  if (el.isMask) {
    return (typeof findImageBeneath === 'function') ? findImageBeneath(canvas, el) : null;
  }
  return (typeof findMaskAbove === 'function') ? findMaskAbove(canvas, el) : null;
}

function getElementCategory(el) {
  if (!el) return null;
  if (el.type === 'text') return 'text';
  if (el.type === 'button') return 'button';
  if (el.type === 'image') return 'image';
  if (['rect', 'circle', 'pixel'].includes(el.type)) return 'shape';
  return el.type;
}

function applyLinkSync(sourceEl, targetEl, group) {
  const cat = group.category;
  const sync = Object.assign({}, group.syncProperties || {});

  if (group.id) {
    const forced = getForcedLinkSyncProps(group.id);
    Object.keys(forced).forEach(k => {
      sync[k] = true;
    });
  }

  if (sync.customName) {
    if (sourceEl.customName !== undefined) {
      const targetCanvas = state.canvases.find(c => c.elements.includes(targetEl));
      const existingNames = targetCanvas
        ? targetCanvas.elements
            .filter(e => e.id !== targetEl.id)
            .map(e => e.customName || baseLayerLabel(e))
        : [];
      targetEl.customName = uniqueName(sourceEl.customName, existingNames);
    } else {
      delete targetEl.customName;
    }
  }

  if (cat === 'text') {
    if (sync.text) targetEl.text = sourceEl.text;
    if (sync.font) {
      // Font family/weight/spacing/alignment — NOT fontSize (handled separately so a
      // group can sync typeface but keep per-canvas sizes, as auto-resize needs).
      const fontProps = ['fontFamily', 'weight', 'lineHeight', 'lineHeightAuto', 'letterSpacing', 'textAlign', 'verticalAlign'];
      const isBrand = (targetEl.role === 'rmit-logo' || targetEl.role === 'rfwn' || targetEl.role === 'cricos');
      fontProps.forEach(p => {
        if (isBrand && (p === 'textAlign' || p === 'verticalAlign')) {
          return;
        }
        if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
        else delete targetEl[p];
      });
    }
    // Backward-compat: groups created before fontSize was split have no fontSize key,
    // so it follows the font toggle (preserving old "font syncs size too" behavior).
    const syncFontSize = sync.fontSize !== undefined ? sync.fontSize : sync.font;
    if (syncFontSize) {
      if (sourceEl.fontSize !== undefined) targetEl.fontSize = sourceEl.fontSize;
      if (sourceEl.autoSize !== undefined) targetEl.autoSize = sourceEl.autoSize;
      else delete targetEl.autoSize;
      if (sourceEl.maxFontSize !== undefined) targetEl.maxFontSize = sourceEl.maxFontSize;
      else delete targetEl.maxFontSize;
    }
    if (sync.color) {
      if (sourceEl.color !== undefined) targetEl.color = sourceEl.color;
      else delete targetEl.color;
    }
    const syncBackground = sync.background !== undefined ? sync.background : sync.color;
    if (syncBackground) {
      const bgProps = ['bg', 'hasBg', 'animateBg', 'bgPadL', 'bgPadV', 'bgCoverage', 'bgOpacity'];
      bgProps.forEach(p => {
        if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
        else delete targetEl[p];
      });
    }
  } else if (cat === 'button') {
    if (sync.text) targetEl.text = sourceEl.text;
    if (sync.textColor) {
      if (sourceEl.color !== undefined) targetEl.color = sourceEl.color;
      else delete targetEl.color;
    }
    if (sync.font) {
      const fontProps = ['fontFamily', 'weight', 'fontSize', 'autoSize', 'maxFontSize', 'letterSpacing', 'paddingLR', 'paddingTB', 'textAlign', 'verticalAlign', 'wrapText', 'wrapMinSize'];
      fontProps.forEach(p => {
        if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
        else delete targetEl[p];
      });
      if (targetEl.autoSize) {
        targetEl.autoHug = false;
      }
    }
    if (sync.fill) {
      if (sourceEl.bg !== undefined) targetEl.bg = sourceEl.bg;
      else delete targetEl.bg;
    }
    if (sync.stroke) {
      const strokeProps = ['strokeColor', 'strokeWidth', 'strokeOpacity', 'strokeDash', 'strokeGap'];
      strokeProps.forEach(p => {
        if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
        else delete targetEl[p];
      });
    }
    if (sync.radius) {
      if (sourceEl.radius !== undefined) targetEl.radius = sourceEl.radius;
      else delete targetEl.radius;
    }
    if (sync.transform) {
      targetEl.width = sourceEl.width;
      targetEl.height = sourceEl.height;
      if (sourceEl.lockRatio !== undefined) targetEl.lockRatio = sourceEl.lockRatio;
      else delete targetEl.lockRatio;
      if (sourceEl.aspectRatio !== undefined) targetEl.aspectRatio = sourceEl.aspectRatio;
      else delete targetEl.aspectRatio;
      if (sourceEl.autoHug !== undefined) targetEl.autoHug = sourceEl.autoHug;
      else delete targetEl.autoHug;
    }
    if (targetEl.type === 'button' && targetEl.autoHug) {
      targetEl.width = measureButtonWidth(targetEl);
    }
  } else if (cat === 'image') {
    if (sync.image) {
      targetEl.assetId = sourceEl.assetId;
      if (sourceEl.objectFit !== undefined) targetEl.objectFit = sourceEl.objectFit;
      else delete targetEl.objectFit;
    }
    if (sync.variant) {
      targetEl.assetId = sourceEl.assetId;
      targetEl.customName = sourceEl.customName;
      if (sourceEl.name !== undefined) targetEl.name = sourceEl.name;
    }
    if (sync.radius) {
      if (sourceEl.radius !== undefined) targetEl.radius = sourceEl.radius;
      else delete targetEl.radius;
    }
    if (sync.transform) {
      targetEl.width = sourceEl.width;
      targetEl.height = sourceEl.height;
      if (sourceEl.lockRatio !== undefined) targetEl.lockRatio = sourceEl.lockRatio;
      else delete targetEl.lockRatio;
      if (sourceEl.aspectRatio !== undefined) targetEl.aspectRatio = sourceEl.aspectRatio;
      else delete targetEl.aspectRatio;
    }
    if (sync.rotation) {
      if (sourceEl.rotation !== undefined) targetEl.rotation = sourceEl.rotation;
      else delete targetEl.rotation;
    }
  } else if (cat === 'shape') {
    if (sync.fill) {
      if (sourceEl.color !== undefined) targetEl.color = sourceEl.color;
      else delete targetEl.color;
    }
    if (sync.stroke) {
      const strokeProps = ['strokeColor', 'strokeWidth', 'strokeOpacity', 'strokeDash', 'strokeGap'];
      strokeProps.forEach(p => {
        if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
        else delete targetEl[p];
      });
    }
    if (sync.radius) {
      if (sourceEl.radius !== undefined) targetEl.radius = sourceEl.radius;
      else delete targetEl.radius;
    }
    if (sync.transform) {
      targetEl.width = sourceEl.width;
      targetEl.height = sourceEl.height;
      if (sourceEl.lockRatio !== undefined) targetEl.lockRatio = sourceEl.lockRatio;
      else delete targetEl.lockRatio;
      if (sourceEl.aspectRatio !== undefined) targetEl.aspectRatio = sourceEl.aspectRatio;
      else delete targetEl.aspectRatio;
    }
  } else if (cat === 'line') {
    if (sync.color) {
      if (sourceEl.color !== undefined) targetEl.color = sourceEl.color;
      else delete targetEl.color;
    }
    if (sync.thickness) {
      if (sourceEl.height !== undefined) targetEl.height = sourceEl.height;
    }
  }

  if (sync.opacity) {
    if (sourceEl.opacity !== undefined) targetEl.opacity = sourceEl.opacity;
    else delete targetEl.opacity;
  }
  if (sync.visibility) {
    if (sourceEl.hidden !== undefined) targetEl.hidden = sourceEl.hidden;
    else delete targetEl.hidden;
  }
  if (sync.inAnim) {
    const inAnimProps = ['inEnabled', 'animType', 'animDuration', 'animDelay', 'animFade', 'animFadeLetters', 'animFadeBg', 'zoomFrom', 'animBounce', 'animDirection', 'animDistance', 'animRotateOffset', 'animAngle', 'animateBg', 'bgOffset', 'zoomAnchor', 'animStaggerText', 'riseSplit', 'riseFade'];
    inAnimProps.forEach(p => {
      if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
      else delete targetEl[p];
    });
  }
  if (sync.effect) {
    const effectProps = ['fxEnabled', 'effectType', 'effDuration', 'effDelay', 'panDist', 'panDir', 'effEase', 'effOnce', 'effSpeed', 'zoomTarget', 'spinTarget', 'spinRepeat', 'panFromX', 'panFromY', 'panRotate', 'panFade', 'panTowards', 'panMidX', 'panMidY', 'pulseScale', 'heartbeatScale', 'floatRange', 'floatDirection'];
    effectProps.forEach(p => {
      if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
      else delete targetEl[p];
    });
  }
  if (sync.outAnim) {
    const outAnimProps = ['exitEnabled', 'exitType', 'exitStart', 'exitDuration', 'exitFade', 'exitDirection', 'exitDistance'];
    outAnimProps.forEach(p => {
      if (sourceEl[p] !== undefined) targetEl[p] = sourceEl[p];
      else delete targetEl[p];
    });
  }
}

function cleanupLinkGroups() {
  if (!state.linkGroups) return;
  const activeIds = new Set();
  state.canvases.forEach(c => {
    c.elements.forEach(el => {
      if (el.linkGroupId) activeIds.add(el.linkGroupId);
    });
  });
  Object.keys(state.linkGroups).forEach(gid => {
    if (!activeIds.has(gid)) {
      delete state.linkGroups[gid];
    }
  });
}

// Canvas bg, optionally scoped per-frame.
//  • If `c.bgByFrame[frameId]` exists, use it (per-frame mode).
//  • Otherwise fall back to `c.bgColor` (the canvas-level value).
// `state.bgPerFrame` / `state.bgPerCanvas` are UI flags that control
// the *write* scope only; reads always honour any override present.
function getCanvasBg(c, frameId) {
  if (!c) return '#000';
  if (frameId != null && c.bgByFrame && c.bgByFrame[frameId] !== undefined) {
    return c.bgByFrame[frameId];
  }
  return c.bgColor;
}

// Create link group(s) for the current selection.
//
// One group PER CATEGORY. A link group carries a single `category` and its
// syncProperties are keyed to it, so a selection spanning categories cannot share
// one group — the clearest case being a mask group (a shape) plus the image it
// clips: dropping a rect mask into an 'image' group would run applyLinkSync's
// image branch against it and try to copy an assetId onto a shape. Splitting by
// category means selecting a mask pair links the images together AND the masks
// together, each with sync settings appropriate to what it is.
function createAndLinkGroup(name) {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection?.length) return;
  const sel = c.elements.filter(el => state.layerSelection.includes(el.id));
  if (!sel.length) return;

  const byCat = new Map();
  sel.forEach(el => {
    const cat = getElementCategory(el);
    if (!cat) return;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(el);
  });
  if (!byCat.size) return;

  if (!state.linkGroups) state.linkGroups = {};
  const needsSuffix = byCat.size > 1;   // disambiguate the sibling groups by name
  byCat.forEach((els, cat) => {
    const gid = 'lg_' + uid();
    const label = els[0].isMask ? 'Mask' : (cat.charAt(0).toUpperCase() + cat.slice(1));
    state.linkGroups[gid] = {
      id: gid,
      name: needsSuffix ? `${name} (${label})` : name,
      category: cat,
      syncProperties: getDefaultSync(els[0])
    };
    els.forEach(el => {
      if (typeof dmMigrateSlotKey === 'function') {
        dmMigrateSlotKey(el, gid);
      }
      el.linkGroupId = gid;
    });
  });

  pushHistory();
  render();
}

// Add the selection to an existing group. Reachable from the context menu AND the
// Link Groups panel's dropdown, and it used to assign the id to every selected
// element unchecked — which could drop a mask and the image it clips into one
// group, or any layer into a group of the wrong kind. Refused members are skipped
// and reported rather than silently corrupting the group.
function linkSelectionToGroup(gid) {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection?.length) return;
  const group = state.linkGroups?.[gid];
  if (!group) return;

  const selected = c.elements.filter(el => state.layerSelection.includes(el.id));
  const allowed = [];
  const refused = [];
  selected.forEach(el => (canElementJoinGroup(el, gid) ? allowed : refused).push(el));

  allowed.forEach(el => {
    if (typeof dmMigrateSlotKey === 'function') {
      dmMigrateSlotKey(el, gid);
    }
    el.linkGroupId = gid;
  });

  if (refused.length) {
    // Distinguish the mask-pair case, which has its own remedy (link the pair via
    // Auto-Link / Create New Group so each half gets its own group).
    const pairRefused = refused.some(el => {
      const partner = maskPartnerOf(el);
      return partner && (selected.includes(partner) || partner.linkGroupId === gid);
    });
    showCanvasNotification(
      pairRefused
        ? `A mask and the image it clips can't share one link group — they need one each. Use Auto-Link or Create New Group on the pair instead. ${refused.length} layer${refused.length === 1 ? '' : 's'} skipped.`
        : `"${group.name}" only links ${group.category} layers — ${refused.length} layer${refused.length === 1 ? '' : 's'} skipped.`,
      { type: 'warning' }
    );
  }
  if (!allowed.length) return;

  pushHistory();
  render();
}

function removeSelectionFromGroup() {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection?.length) return;

  c.elements.forEach(el => {
    if (state.layerSelection.includes(el.id)) {
      delete el.linkGroupId;
    }
  });

  cleanupLinkGroups();
  pushHistory();
  render();
}

function removeGroupEntirely(gid) {
  state.canvases.forEach(c => {
    c.elements.forEach(el => {
      if (el.linkGroupId === gid) {
        delete el.linkGroupId;
      }
    });
  });

  if (state.linkGroups && state.linkGroups[gid]) {
    delete state.linkGroups[gid];
  }

  pushHistory();
  render();
}

function autoAddAndLink(srcEl, skipNotify = false) {
  if (!srcEl) return;
  const name = baseLayerLabel(srcEl);
  const cat = getElementCategory(srcEl);
  if (!cat) return;

  let gid = srcEl.linkGroupId;
  let isNewGroup = false;

  if (!gid) {
    gid = 'lg_' + uid();
    isNewGroup = true;
    
    const defaultSync = getDefaultSync(srcEl);

    if (!state.linkGroups) state.linkGroups = {};
    state.linkGroups[gid] = {
      id: gid,
      name: name + " Group",
      category: cat,
      syncProperties: defaultSync
    };
    
    if (typeof dmMigrateSlotKey === 'function') {
      dmMigrateSlotKey(srcEl, gid);
    }
    srcEl.linkGroupId = gid;
  }

  let countCloned = 0;
  let countLinkedExisting = 0;

  state.canvases.forEach(c => {
    // Find matching element on canvas c. Mask state is part of the match (same
    // rule as areStylesAndNamesEqual): a mask must not adopt an ordinary shape
    // that merely shares its name, and canElementJoinGroup is the final gate so
    // a mask's own image can never be pulled in either.
    const match = c.elements.find(el =>
      el.type === srcEl.type &&
      !!el.isMask === !!srcEl.isMask &&
      baseLayerLabel(el) === name);
    if (match) {
      if (match.linkGroupId !== gid && canElementJoinGroup(match, gid)) {
        match.linkGroupId = gid;
        countLinkedExisting++;
      }
    } else {
      // Clone the element to this canvas
      const clone = JSON.parse(JSON.stringify(srcEl));
      clone.id = uid();
      if (clone.persistent === false) {
        clone.frameId = state.activeFrameId;
      }
      clone.linkGroupId = gid;
      
      // Check Canvas Sync options to decide what settings to maintain on duplication
      const syncVisibility = localStorage.getItem('sync-layers-visibility') !== 'false';
      const syncLock = localStorage.getItem('sync-layers-lock') !== 'false';
      const syncPersistent = localStorage.getItem('sync-layers-persistent') !== 'false';
      
      if (!syncLock) {
        clone.locked = false;
      }
      if (!syncVisibility) {
        clone.hidden = false;
      }
      if (!syncPersistent) {
        delete clone.role;
      }
      
      // Center the element no matter where the original element is
      const cloneW = clone.width || 0;
      const cloneH = clone.height || 0;
      clone.x = Math.round((c.width - cloneW) / 2);
      clone.y = Math.round((c.height - cloneH) / 2);

      insertAtGroupEnd(c.elements, clone);
      countCloned++;
    }
  });

  // Now push changes to propagate the source properties to all members of the group
  pushGroupChangesForId(gid, skipNotify);
}

// Push every group represented in the selection, not just the first element's.
// A mask pair belongs to TWO groups (image + mask); pushing only one of them left
// the other half of the pair stale on the other canvases.
function pushGroupChanges() {
  const c = getActiveCanvas();
  const sel = (c && state.layerSelection?.length)
    ? c.elements.filter(x => state.layerSelection.includes(x.id))
    : [];
  const single = getSelectedElement();
  const source = sel.length ? sel : (single ? [single] : []);
  const gids = [...new Set(source.map(el => el.linkGroupId).filter(gid => gid && state.linkGroups?.[gid]))];
  if (!gids.length) return;

  gids.forEach(gid => pushGroupChangesForId(gid, true));

  pushHistory();
  render();
  const names = gids.map(gid => state.linkGroups[gid].name);
  showCanvasNotification(gids.length === 1
    ? `Changes pushed to group "${names[0]}"`
    : `Changes pushed to ${gids.length} groups: ${names.join(', ')}`);
}


async function deleteGroupAndElements(gid) {
  if (!gid || !state.linkGroups[gid]) return;
  const gName = state.linkGroups[gid].name;
  if (!(await showAdflowConfirm(`Are you sure you want to delete the link group "${gName}" AND delete all elements belonging to it across all canvases?`))) {
    return;
  }
  delete state.linkGroups[gid];
  state.canvases.forEach(cv => {
    cv.elements = cv.elements.filter(el => el.linkGroupId !== gid);
  });
  state.layerSelection = [];
  state.selectedElementId = null;
  pushHistory();
  render();
}


function pushGroupChangesForId(gid, skipNotify = false) {
  const group = state.linkGroups[gid];
  if (!group) return;
  let elementsInGroup = [];
  state.canvases.forEach(c => {
    c.elements.forEach(el => {
      if (el.linkGroupId === gid) {
        elementsInGroup.push(el);
      }
    });
  });
  if (elementsInGroup.length < 2) return;

  // Find a source element in the active canvas if possible, otherwise default to elementsInGroup[0]
  const activeCanvas = getActiveCanvas();
  let sourceEl = null;
  if (activeCanvas) {
    sourceEl = elementsInGroup.find(el => {
      const isSelected = state.layerSelection && state.layerSelection.includes(el.id);
      return isSelected && activeCanvas.elements.includes(el);
    });
    if (!sourceEl) {
      sourceEl = elementsInGroup.find(el => activeCanvas.elements.includes(el));
    }
  }
  if (!sourceEl) {
    sourceEl = elementsInGroup[0];
  }

  state.canvases.forEach(c => {
    c.elements.forEach(targetEl => {
      if (targetEl.linkGroupId === gid && targetEl.id !== sourceEl.id) {
        applyLinkSync(sourceEl, targetEl, group);
      }
    });
  });
  if (!skipNotify) {
    pushHistory();
    render();
    showCanvasNotification(`Changes pushed to group "${group.name}"`);
  }
}

function toggleGroupVisibility(gid) {
  let allHidden = true;
  let hasElements = false;
  state.canvases.forEach(cv => {
    cv.elements.forEach(el => {
      if (el.linkGroupId === gid) {
        hasElements = true;
        if (!el.hidden) allHidden = false;
      }
    });
  });

  if (!hasElements) return;

  const targetHiddenState = !allHidden;
  state.canvases.forEach(cv => {
    cv.elements.forEach(el => {
      if (el.linkGroupId === gid) {
        el.hidden = targetHiddenState;
      }
    });
  });

  pushHistory();
  render();
}

function selectGroupElements(gid) {
  const activeCanvas = getActiveCanvas();
  let members = activeCanvas ? activeCanvas.elements.filter(el => el.linkGroupId === gid) : [];

  if (members.length === 0) {
    for (let c of state.canvases) {
      const cvMembers = c.elements.filter(el => el.linkGroupId === gid);
      if (cvMembers.length > 0) {
        state.activeCanvasId = c.id;
        members = cvMembers;
        break;
      }
    }
  }

  if (members.length > 0) {
    state.layerSelection = members.map(el => el.id);
    state.selectedElementId = members.length === 1 ? members[0].id : null;
    render();
  }
}

// ============================================================================
// Accessors
// ============================================================================
const getActiveCanvas = () => state.canvases.find(c => c.id === state.activeCanvasId);
const getSelectedElement = () => {
  const c = getActiveCanvas();
  return c ? c.elements.find(e => e.id === state.selectedElementId) : null;
};

// The link group whose members should be highlighted (visual only). Active when the
// current selection is entirely within one link group — e.g. a single linked child
// element, or all members on one canvas after clicking a group row. Recomputed once
// per render and cached so elementNode() can read it cheaply.
let _highlightGid = null;
function computeHighlightLinkGroupId() {
  if (!state.linkGroups) return null;
  const c = getActiveCanvas();
  if (!c || !state.layerSelection || !state.layerSelection.length) return null;
  const sel = c.elements.filter(e => state.layerSelection.includes(e.id));
  const gids = new Set(sel.map(e => e.linkGroupId).filter(Boolean));
  if (gids.size !== 1) return null;
  const gid = [...gids][0];
  return state.linkGroups[gid] ? gid : null;
}

