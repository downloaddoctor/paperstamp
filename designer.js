'use strict';

/* PaperStamp designer — lazy-loaded editing UI on top of core.js. */

(function () {
  const core = window.PaperStampCore;
  if (!core) {
    console.error('[paperstamp] designer.js requires core.js');
    return;
  }

  const {
    state,
    el,
    on,
    round1,
    findItem,
    getItemNode,
    computeNextId,
    render,
    applyPageSize,
    fitPageToStage,
    computeFitScale,
    getAllLayouts,
    setAllLayouts,
    listLayouts,
    registerLayoutDef,
    GEO_CLAMP,
    GEO_STYLE,
    itemHooks,
    deepClone
  } = core;

  const ZOOM_STEP = 0.1;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;

  let toastTimer = null;
  function notify(message) {
    let bar = document.getElementById('psToast');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'psToast';
      bar.className = 'ps-toast';
      bar.setAttribute('data-paperstamp-designer', '1');
      document.body.appendChild(bar);
    }
    bar.textContent = message;
    bar.classList.add('open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => bar.classList.remove('open'), 2400);
  }
  function confirmAction(message, onConfirm) {
    let box = document.getElementById('psConfirm');
    if (!box) {
      box = document.createElement('div');
      box.id = 'psConfirm';
      box.className = 'ps-confirm-overlay';
      box.setAttribute('data-paperstamp-designer', '1');
      box.innerHTML =
        '<div class="ps-confirm-card"><p class="ps-confirm-msg"></p>' +
        '<div class="ps-confirm-actions"><button type="button" class="ps-confirm-cancel">Cancel</button>' +
        '<button type="button" class="ps-confirm-ok">Confirm</button></div></div>';
      document.body.appendChild(box);
    }
    box.querySelector('.ps-confirm-msg').textContent = message;
    box.classList.add('open');
    const okBtn = box.querySelector('.ps-confirm-ok');
    const cancelBtn = box.querySelector('.ps-confirm-cancel');
    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    cancelBtn.replaceWith(newCancel);
    let onKey = null;
    const cleanup = () => {
      box.classList.remove('open');
      if (onKey) {
        document.removeEventListener('keydown', onKey);
        onKey = null;
      }
    };
    newOk.addEventListener('click', () => {
      cleanup();
      onConfirm();
    });
    newCancel.addEventListener('click', cleanup);
    onKey = (ev) => {
      if (ev.key === 'Escape') cleanup();
    };
    document.addEventListener('keydown', onKey);
    if (box._backdropHandler)
      box.removeEventListener('click', box._backdropHandler);
    box._backdropHandler = (ev) => {
      if (ev.target === box) cleanup();
    };
    box.addEventListener('click', box._backdropHandler);
  }

  /* ---------- Designer markup (fetched from designer.html) ---------- */

  async function buildDom() {
    const res = await fetch('designer.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load designer.html');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tpl = doc.getElementById('ps-designer-root');
    if (!tpl) throw new Error('designer.html missing #ps-designer-root');
    const frag = document.importNode(tpl.content, true);
    frag
      .querySelectorAll(
        '#psSprite, #layoutBar, #rightStack, #bottomCenterBar, #bottomRightBar, #toolRail, .item-toolbar'
      )
      .forEach((n) => n.setAttribute('data-paperstamp-designer', '1'));
    const wrap = document.createElement('div');
    wrap.id = 'psDesignerChrome';
    wrap.setAttribute('data-paperstamp-designer', '1');
    wrap.appendChild(frag);
    el.stage.appendChild(wrap);
    el.chrome = wrap;
    cacheEls();
    buildBadges();
  }

  function cacheEls() {
    [
      'layoutBar',
      'rightStack',
      'layoutName',
      'layoutComboBtn',
      'layoutComboList',
      'layoutSelect',
      'saveLayout',
      'deleteLayout',
      'exportLayout',
      'importLayoutBtn',
      'importLayoutFile',
      'zoomOutBtn',
      'zoomInBtn',
      'zoom100Btn',
      'zoomFitBtn',
      'zoomPctLabel',
      'railPage',
      'railGuide',
      'geomBar',
      'itemX',
      'itemY',
      'itemW',
      'itemH',
      'pagePanel',
      'pageSize',
      'customSizeFields',
      'customWidth',
      'customHeight',
      'orientation',
      'guidePanel',
      'guideUpload',
      'clearGuide',
      'fileDropText',
      'guideOpacity',
      'opacityVal',
      'modeDesignBtn',
      'modeFillBtn',
      'printBtn',
      'railAddText',
      'railClearAll',
      'itemToolbar',
      'itemName',
      'fontSize',
      'textAlignGroup',
      'vertAlignGroup',
      'deleteItem',
      'fillPanel',
      'fillFormList'
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function buildBadges() {
    el.wBadge = document.createElement('div');
    el.wBadge.id = 'wBadge';
    el.wBadge.className = 'item-badge item-badge-w';
    el.wBadge.hidden = true;
    el.wBadge.setAttribute('data-paperstamp-designer', '1');
    el.hBadge = document.createElement('div');
    el.hBadge.id = 'hBadge';
    el.hBadge.className = 'item-badge item-badge-h';
    el.hBadge.hidden = true;
    el.hBadge.setAttribute('data-paperstamp-designer', '1');
    el.pageViewport.appendChild(el.wBadge);
    el.pageViewport.appendChild(el.hBadge);
  }

  /* ---------- State <-> DOM sync ---------- */

  function syncGuideDom() {
    if (!el.guideImg) return;
    if (state.guideSrc) {
      el.guideImg.src = state.guideSrc;
      el.guideImg.style.display = 'block';
    } else {
      el.guideImg.removeAttribute('src');
      el.guideImg.style.display = 'none';
    }
    el.guideImg.style.opacity = state.guideOpacity / 100;
    if (el.guideOpacity) el.guideOpacity.value = state.guideOpacity;
    if (el.opacityVal) el.opacityVal.textContent = state.guideOpacity;
  }
  function syncPageSetupInputs() {
    if (!el.pageSize) return;
    const w = round1(state.pageWmm);
    const h = round1(state.pageHmm);
    // Match against known presets (compare as numbers to tolerate 210 vs 210.0).
    const match = Array.from(el.pageSize.options).find((o) => {
      if (o.value === 'custom') return false;
      const [ow, oh] = o.value.split('x').map(Number);
      return (
        (round1(ow) === w && round1(oh) === h) ||
        (round1(ow) === h && round1(oh) === w)
      );
    });
    if (match) {
      el.pageSize.value = match.value;
      if (el.customSizeFields) el.customSizeFields.style.display = 'none';
      if (el.customWidth) el.customWidth.value = state.pageWmm;
      if (el.customHeight) el.customHeight.value = state.pageHmm;
    } else {
      el.pageSize.value = 'custom';
      if (el.customSizeFields) el.customSizeFields.style.display = 'block';
      if (el.customWidth) el.customWidth.value = state.pageWmm;
      if (el.customHeight) el.customHeight.value = state.pageHmm;
    }
    if (el.orientation) el.orientation.value = state.orientation;
  }

  /* ---------- Popovers ---------- */

  function closeAllPopovers() {
    document
      .querySelectorAll('.tool-popover.open')
      .forEach((p) => p.classList.remove('open'));
    document
      .querySelectorAll('.rail-btn.active')
      .forEach((b) => b.classList.remove('active'));
    if (el.rightStack) el.rightStack.classList.remove('popover-open');
  }
  function openPopover(panelId, railBtn) {
    const panel = document.getElementById(panelId);
    const wasOpen = panel && panel.classList.contains('open');
    closeAllPopovers();
    if (!panel || wasOpen) return;
    panel.classList.add('open');
    if (railBtn) railBtn.classList.add('active');
    if (panel.dataset.dock === 'stack') {
      if (el.rightStack) el.rightStack.classList.add('popover-open');
      return;
    }
    if (!railBtn) return;
    const r = railBtn.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const gap = 8;
    let top = r.bottom + gap;
    if (top + p.height > window.innerHeight - 8)
      top = Math.max(8, r.top - p.height - gap);
    let left = r.right - p.width;
    left = Math.max(8, Math.min(window.innerWidth - p.width - 8, left));
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.right = 'auto';
  }
  /* ---------- Selection ---------- */

  function renderSelection() {
    document.querySelectorAll('.item').forEach((n) => {
      n.classList.toggle('selected', Number(n.dataset.id) === state.selectedId);
    });
  }
  const hideItemToolbar = () => {
    if (el.itemToolbar) el.itemToolbar.classList.remove('open');
    if (el.geomBar) el.geomBar.classList.remove('open');
    hideItemBadge();
  };
  function positionItemToolbar(node) {
    if (!el.itemToolbar.classList.contains('open'))
      el.itemToolbar.classList.add('open');
    const r = node.getBoundingClientRect();
    const t = el.itemToolbar.getBoundingClientRect();
    let top = r.top - t.height - 10;
    if (top < 8) top = r.bottom + 10;
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - t.width - 8,
        r.left + r.width / 2 - t.width / 2
      )
    );
    el.itemToolbar.style.top = top + 'px';
    el.itemToolbar.style.left = left + 'px';
  }
  function positionGeomBar(node) {
    if (!el.geomBar) return;
    const r = node.getBoundingClientRect();
    const t = el.geomBar.getBoundingClientRect();
    let top = r.top - t.height - 10;
    if (top < 8) top = r.bottom + 10;
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - t.width - 8,
        r.left + r.width / 2 - t.width / 2
      )
    );
    el.geomBar.style.top = top + 'px';
    el.geomBar.style.left = left + 'px';
  }
  function showItemToolbar(id) {
    const node = getItemNode(id);
    if (!node) {
      hideItemToolbar();
      return;
    }
    positionItemToolbar(node);
    el.itemToolbar.classList.add('open');
  }
  function hideItemBadge() {
    if (el.wBadge) el.wBadge.hidden = true;
    if (el.hBadge) el.hBadge.hidden = true;
  }
  function positionItemBadge(item, node) {
    if (!node) {
      hideItemBadge();
      return;
    }
    const nodeRect = node.getBoundingClientRect();
    const viewRect = el.pageViewport.getBoundingClientRect();
    el.wBadge.hidden = false;
    el.wBadge.textContent = round1(item.w);
    const dpr = window.devicePixelRatio || 1;
    const snap = (v) => Math.round(v * dpr) / dpr;
    el.wBadge.style.top = snap(nodeRect.bottom - viewRect.top + 6) + 'px';
    el.wBadge.style.left =
      snap(nodeRect.left - viewRect.left + nodeRect.width / 2) + 'px';
    el.hBadge.hidden = false;
    el.hBadge.textContent = round1(item.h);
    el.hBadge.style.top =
      snap(nodeRect.top - viewRect.top + nodeRect.height / 2) + 'px';
    el.hBadge.style.left = snap(nodeRect.right - viewRect.left + 6) + 'px';
  }
  function selectItem(id) {
    state.selectedId = id;
    renderSelection();
    const item = findItem(id);
    if (!item) {
      hideItemToolbar();
      hideItemBadge();
      return;
    }
    el.itemName.value = item.name || '';
    el.fontSize.value = item.fontSize;
    syncGeoInputs(item);
    setActiveAlign(item.align);
    setActiveVAlign(item.valign || 'top');
    el.geomBar.classList.add('open');
    positionGeomBar(getItemNode(id));
    showItemToolbar(id);
    positionItemBadge(item, getItemNode(id));
  }

  /* ---------- Geometry inputs ---------- */

  function syncGeoInputs(item) {
    el.itemX.value = round1(item.x);
    el.itemY.value = round1(item.y);
    el.itemW.value = round1(item.w);
    el.itemH.value = round1(item.h);
  }
  function wireGeometryInput(input, key) {
    input.addEventListener('input', () => {
      const item = findItem(state.selectedId);
      if (!item) return;
      const v = Number(input.value);
      if (Number.isNaN(v)) return;
      item[key] = GEO_CLAMP[key](v, item);
      const node = getItemNode(item.id);
      if (node) {
        node.style[GEO_STYLE[key]] = item[key] + '%';
        positionItemToolbar(node);
        positionItemBadge(item, node);
      }
    });
  }

  /* ---------- Drag / resize ---------- */

  function beginGeometryDrag(e, item, node, applyDelta) {
    e.preventDefault();
    e.stopPropagation();
    selectItem(item.id);
    const sx = e.clientX;
    const sy = e.clientY;
    function onMove(ev) {
      // Recompute rect each move: a mid-drag zoom changes page dims.
      const rect = el.page.getBoundingClientRect();
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      applyDelta(dx, dy);
      positionItemToolbar(node);
      if (state.selectedId === item.id) {
        syncGeoInputs(item);
        positionItemBadge(item, node);
      }
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  function onItemPointerDown(e, item, node) {
    if (state.mode === 'fill') return;
    if (node.getAttribute('contenteditable') === 'true') return;
    if (e.target.classList.contains('resize-handle')) return;
    const sx = item.x;
    const sy = item.y;
    beginGeometryDrag(e, item, node, (dx, dy) => {
      let nx = GEO_CLAMP.x(sx + dx, item);
      let ny = GEO_CLAMP.y(sy + dy, item);
      const cx = (100 - item.w) / 2;
      const cy = (100 - item.h) / 2;
      if (Math.abs(nx - cx) < 1) nx = cx;
      if (Math.abs(ny - cy) < 1) ny = cy;
      item.x = nx;
      item.y = ny;
      node.style.left = nx + '%';
      node.style.top = ny + '%';
    });
  }
  function onResizePointerDown(e, item, node) {
    if (state.mode === 'fill') return;
    const sw = item.w;
    const sh = item.h;
    beginGeometryDrag(e, item, node, (dw, dh) => {
      item.w = GEO_CLAMP.w(sw + dw, item);
      item.h = GEO_CLAMP.h(sh + dh, item);
      node.style.width = item.w + '%';
      node.style.height = item.h + '%';
    });
  }
  function startEdit(node, item) {
    node.setAttribute('contenteditable', 'true');
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const onBlur = () => {
      node.removeAttribute('contenteditable');
      item.text = node.textContent;
      node.removeEventListener('blur', onBlur);
    };
    node.addEventListener('blur', onBlur);
  }

  /* ---------- Item ops ---------- */

  function addTextItem() {
    const id = state.nextId++;
    state.items.push({
      id,
      type: 'text',
      x: 10,
      y: 10,
      name: 'Field ' + id,
      w: 30,
      h: 6,
      text: 'Text',
      fontSize: 12,
      align: 'left',
      valign: 'top'
    });
    render();
    selectItem(id);
  }
  function deleteSelected() {
    if (state.selectedId == null) return;
    state.items = state.items.filter((it) => it.id !== state.selectedId);
    state.selectedId = null;
    hideItemToolbar();
    render();
  }
  function duplicateSelected() {
    const item = findItem(state.selectedId);
    if (!item) return;
    const clone = Object.assign(deepClone(item), { id: state.nextId++ });
    clone.x = Math.min(100 - clone.w, clone.x + 2);
    clone.y = Math.min(100 - clone.h, clone.y + 2);
    if (clone.type === 'text') clone.name = (clone.name || 'Field') + ' copy';
    state.items.push(clone);
    render();
    selectItem(clone.id);
  }
  function handleClearAll() {
    confirmAction('Remove all items?', () => {
      state.items = [];
      state.selectedId = null;
      hideItemToolbar();
      render();
    });
  }

  /* ---------- Layout storage UI ---------- */

  function populateLayoutSelect(selectId) {
    if (!el.layoutSelect) return;
    const ids = listLayouts();
    el.layoutSelect.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-- none --';
    el.layoutSelect.appendChild(empty);
    ids.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      el.layoutSelect.appendChild(o);
    });
    if (selectId && ids.includes(selectId)) el.layoutSelect.value = selectId;
    if (!el.layoutComboList) return;
    el.layoutComboList.innerHTML = '';
    if (!ids.length) {
      const e = document.createElement('div');
      e.className = 'layout-combo-empty';
      e.textContent = 'No saved layouts';
      el.layoutComboList.appendChild(e);
      return;
    }
    ids.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = id;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        el.layoutName.value = id;
        el.layoutSelect.value = id;
        el.layoutComboList.classList.remove('open');
        loadLayout();
      });
      el.layoutComboList.appendChild(b);
    });
  }
  function saveLayout() {
    const id = (el.layoutName.value || '').trim();
    if (!id) {
      notify('Enter a layout name first.');
      return;
    }
    const l = getAllLayouts();
    l[id] = {
      pageWmm: state.pageWmm,
      pageHmm: state.pageHmm,
      orientation: state.orientation,
      items: state.items
    };
    if (!setAllLayouts(l)) {
      notify('Could not save: storage is full or unavailable.');
      return;
    }
    populateLayoutSelect(id);
    notify('Layout "' + id + '" saved.');
  }
  function getSelectedLayoutId() {
    const id = el.layoutSelect.value;
    if (!id) {
      notify('Select a saved layout first.');
      return null;
    }
    return id;
  }
  function loadLayout() {
    const id = getSelectedLayoutId();
    if (!id) return;
    const data = getAllLayouts()[id];
    if (!data) {
      notify('Layout not found.');
      return;
    }
    core.applyLayoutToState(data, null, id, { silent: false });
    syncPageSetupInputs();
    setMode('design');
  }
  function clearLayout() {
    state.pageWmm = 210;
    state.pageHmm = 297;
    state.orientation = 'portrait';
    state.items = [];
    state.nextId = 1;
    state.selectedId = null;
    state.guideSrc = '';
    state.guideOpacity = 60;
    if (el.layoutName) el.layoutName.value = '';
    if (el.guideUpload) el.guideUpload.value = '';
    if (el.fileDropText) el.fileDropText.textContent = 'Click to upload image';
    hideItemToolbar();
    applyPageSize();
    syncPageSetupInputs();
    syncGuideDom();
    render();
    setMode('design');
  }
  function deleteLayout() {
    const id = getSelectedLayoutId();
    if (!id) return;
    confirmAction('Delete layout "' + id + '"?', () => {
      const l = getAllLayouts();
      delete l[id];
      if (!setAllLayouts(l)) {
        notify('Could not delete: storage unavailable.');
        return;
      }
      // If the deleted layout is the one on the page, reset to a blank
      // sheet; otherwise leave the currently-displayed layout untouched.
      const displayedName = (el.layoutName.value || '').trim();
      populateLayoutSelect();
      if (displayedName === id) clearLayout();
      notify('Layout "' + id + '" deleted.');
    });
  }

  /* ---------- Fill mode ---------- */

  function renderFillForm() {
    el.fillFormList.innerHTML = '';
    const textItems = state.items.filter((it) => it.type === 'text');
    if (!textItems.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No text fields yet. Switch to Design mode to add some.';
      el.fillFormList.appendChild(p);
      return;
    }
    for (const item of textItems) {
      const wrap = document.createElement('div');
      wrap.className = 'fill-field';
      const label = document.createElement('label');
      label.textContent = item.name || 'Field ' + item.id;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = item.text;
      input.addEventListener('input', () => {
        item.text = input.value;
        const node = getItemNode(item.id);
        if (node) node.textContent = item.text;
        else render();
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      el.fillFormList.appendChild(wrap);
    }
  }
  function setMode(mode) {
    state.mode = mode;
    const isFill = mode === 'fill';
    el.modeDesignBtn.classList.toggle('active', !isFill);
    el.modeFillBtn.classList.toggle('active', isFill);
    el.modeDesignBtn.setAttribute('aria-selected', String(!isFill));
    el.modeFillBtn.setAttribute('aria-selected', String(isFill));
    closeAllPopovers();
    if (isFill) {
      state.selectedId = null;
      hideItemToolbar();
      if (el.rightStack) el.rightStack.classList.add('popover-open');
      const fp = document.getElementById('fillPanel');
      if (fp) fp.classList.add('open');
    } else {
      const fp = document.getElementById('fillPanel');
      if (fp) fp.classList.remove('open');
    }
    render();
    // Bind fill inputs to live item objects *after* render() so the
    // freshly-built nodes are the ones the inputs write into.
    if (isFill) renderFillForm();
  }

  /* ---------- Alignment ---------- */

  function setActiveAlign(a) {
    el.textAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.align === a);
    });
  }
  function setActiveVAlign(v) {
    if (!el.vertAlignGroup) return;
    el.vertAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.valign === v);
    });
  }

  /* ---------- Zoom UI sync ---------- */

  core.onEvent('fit', ({ mode, scale }) => {
    if (!el.zoomPctLabel) return;
    el.zoomPctLabel.textContent =
      mode === 'fit' ? 'Fit' : Math.round(scale * 100) + '%';
    if (state.selectedId == null) return;
    const item = findItem(state.selectedId);
    const node = getItemNode(state.selectedId);
    if (!item || !node) return;
    if (el.itemToolbar && el.itemToolbar.classList.contains('open'))
      positionItemToolbar(node);
    if (el.geomBar && el.geomBar.classList.contains('open'))
      positionGeomBar(node);
    positionItemBadge(item, node);
  });

  /* ---------- Wire designer item hooks into core ---------- */

  function installItemHooks() {
    itemHooks.interactive = true;
    itemHooks.onPointerDown = onItemPointerDown;
    itemHooks.onResizePointerDown = onResizePointerDown;
    itemHooks.onDblClick = (e, item, node) => {
      if (state.mode !== 'fill') startEdit(node, item);
    };
    /* Keep floating chrome glued to the selected item while the stage scrolls. */
    if (el.stage) {
      if (el._scrollHandler)
        el.stage.removeEventListener('scroll', el._scrollHandler);
      el._scrollHandler = () => {
        if (state.selectedId == null) return;
        const item = findItem(state.selectedId);
        const node = getItemNode(state.selectedId);
        if (!item || !node) return;
        if (el.itemToolbar.classList.contains('open'))
          positionItemToolbar(node);
        positionItemBadge(item, node);
      };
      el.stage.addEventListener('scroll', el._scrollHandler);
    }
  }

  /* ---------- Event wiring ---------- */

  function wireEvents() {
    on(el.zoomInBtn, 'click', () => core.zoomBy(ZOOM_STEP));
    on(el.zoomOutBtn, 'click', () => core.zoomBy(-ZOOM_STEP));
    on(el.zoom100Btn, 'click', () => core.setZoomScale(1));
    on(el.zoomFitBtn, 'click', () => core.setZoomMode('fit'));

    const chrome = el.chrome || document;
    chrome.querySelectorAll('.rail-btn[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPopover(btn.dataset.panel, btn);
      });
    });
    chrome.querySelectorAll('.tool-popover').forEach((p) => {
      p.addEventListener('click', (e) => e.stopPropagation());
    });
    document.addEventListener('click', () => {
      closeAllPopovers();
      if (el.layoutComboList) el.layoutComboList.classList.remove('open');
    });
    on(el.layoutComboBtn, 'click', (e) => {
      e.stopPropagation();
      el.layoutComboList.classList.toggle('open');
    });
    on(el.layoutComboList, 'click', (e) => e.stopPropagation());

    on(el.pageSize, 'change', () => {
      const v = el.pageSize.value;
      if (v === 'custom') {
        el.customSizeFields.style.display = 'block';
        state.pageWmm = Number(el.customWidth.value) || 210;
        state.pageHmm = Number(el.customHeight.value) || 297;
      } else {
        el.customSizeFields.style.display = 'none';
        const parts = v.split('x').map(Number);
        state.pageWmm = parts[0];
        state.pageHmm = parts[1];
      }
      applyPageSize();
    });
    on(el.customWidth, 'input', () => {
      state.pageWmm = Number(el.customWidth.value) || 210;
      applyPageSize();
    });
    on(el.customHeight, 'input', () => {
      state.pageHmm = Number(el.customHeight.value) || 297;
      applyPageSize();
    });
    on(el.orientation, 'change', () => {
      state.orientation = el.orientation.value;
      applyPageSize();
    });

    on(el.guideUpload, 'change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.guideSrc = reader.result;
        el.guideImg.src = state.guideSrc;
        el.guideImg.style.display = 'block';
      };
      reader.readAsDataURL(file);
      if (el.fileDropText) el.fileDropText.textContent = file.name;
    });
    on(el.clearGuide, 'click', () => {
      state.guideSrc = '';
      el.guideImg.removeAttribute('src');
      el.guideImg.style.display = 'none';
      el.guideUpload.value = '';
      if (el.fileDropText)
        el.fileDropText.textContent = 'Click to upload image';
    });
    on(el.guideOpacity, 'input', () => {
      state.guideOpacity = Number(el.guideOpacity.value);
      el.opacityVal.textContent = state.guideOpacity;
      el.guideImg.style.opacity = state.guideOpacity / 100;
    });

    on(el.itemName, 'input', () => {
      const item = findItem(state.selectedId);
      if (!item) return;
      item.name = el.itemName.value;
      if (state.mode === 'fill') renderFillForm();
    });
    on(el.railAddText, 'click', addTextItem);
    on(el.deleteItem, 'click', deleteSelected);
    wireGeometryInput(el.itemX, 'x');
    wireGeometryInput(el.itemY, 'y');
    wireGeometryInput(el.itemW, 'w');
    wireGeometryInput(el.itemH, 'h');
    on(el.fontSize, 'input', () => {
      const item = findItem(state.selectedId);
      if (!item) return;
      item.fontSize = Number(el.fontSize.value) || 12;
      render();
      selectItem(item.id);
    });
    el.textAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const item = findItem(state.selectedId);
        if (!item) return;
        item.align = b.dataset.align;
        setActiveAlign(item.align);
        render();
        selectItem(item.id);
      });
    });
    if (el.vertAlignGroup) {
      el.vertAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const item = findItem(state.selectedId);
          if (!item) return;
          item.valign = b.dataset.valign;
          setActiveVAlign(item.valign);
          render();
          selectItem(item.id);
        });
      });
    }

    on(el.modeDesignBtn, 'click', (e) => {
      e.stopPropagation();
      setMode('design');
    });
    on(el.modeFillBtn, 'click', (e) => {
      e.stopPropagation();
      setMode('fill');
    });
    on(el.saveLayout, 'click', saveLayout);
    on(el.exportLayout, 'click', () => {
      const def = core.exportLayoutDef(
        (el.layoutName.value || '').trim() || null
      );
      const blob = new Blob([JSON.stringify(def, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (def.name || 'layout') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Layout exported.');
    });
    on(el.importLayoutBtn, 'click', () => el.importLayoutFile.click());
    on(el.importLayoutFile, 'change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let def;
        try {
          def = JSON.parse(reader.result);
        } catch (err) {
          notify('Invalid JSON file.');
          el.importLayoutFile.value = '';
          return;
        }
        const result = core.importLayoutDef(def, { silent: false });
        if (!result.ok) {
          notify('Import failed: ' + result.errors.join('; '));
          el.importLayoutFile.value = '';
          return;
        }
        if (def.name) el.layoutName.value = def.name;
        notify('Layout imported.');
        el.importLayoutFile.value = '';
      };
      reader.readAsText(file);
    });
    on(el.deleteLayout, 'click', deleteLayout);
    on(el.railClearAll, 'click', handleClearAll);
    on(el.printBtn, 'click', () => window.print());
    el.page.addEventListener('pointerdown', (e) => {
      if (e.target === el.page || e.target === el.guideImg) {
        state.selectedId = null;
        hideItemToolbar();
        renderSelection();
      }
    });

    document.addEventListener('keydown', (e) => {
      const isTyping = () => {
        const n = document.activeElement;
        if (!n) return false;
        return (
          n.isContentEditable ||
          n.tagName === 'INPUT' ||
          n.tagName === 'TEXTAREA' ||
          n.tagName === 'SELECT'
        );
      };
      const typing = isTyping();
      if (typing) return;
      if (e.key === 'Escape') {
        closeAllPopovers();
        if (state.selectedId != null) {
          state.selectedId = null;
          hideItemToolbar();
          renderSelection();
        }
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'd' || e.key === 'D') &&
        state.selectedId != null
      ) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      const item = findItem(state.selectedId);
      if (!item) return;
      const step = 0.2;
      let handled = true;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else handled = false;
      if (dx || dy) {
        item.x = GEO_CLAMP.x(item.x + dx, item);
        item.y = GEO_CLAMP.y(item.y + dy, item);
      }
      if (handled) {
        e.preventDefault();
        render();
        selectItem(item.id);
      }
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    await buildDom();
    installItemHooks();
    wireEvents();
    populateLayoutSelect();
    syncPageSetupInputs();
    render();
    fitPageToStage();
    document.body.classList.remove('embed-mode');
    document.body.classList.add('designer-mode');
    core.emit('designer:ready', {});
    core.emit('designer:mounted', {});
  }

  core.onEvent('designer:close', () => {
    document
      .querySelectorAll('[data-paperstamp-designer]')
      .forEach((n) => n.remove());
    if (el.stage && el._scrollHandler) {
      el.stage.removeEventListener('scroll', el._scrollHandler);
      el._scrollHandler = null;
    }
    document.body.classList.remove('designer-mode');
    core.emit('designer:closed', {});
  });

  init();

  window.PaperStampDesigner = { init, setMode };
})();
