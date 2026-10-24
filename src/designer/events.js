/* DOM event wiring */
import {
  GEO_CLAMP,
  ZOOM_STEP,
  applyPageSize,
  core,
  el,
  findItem,
  on,
  render,
  state
} from './ctx.js';
import { wireGeometryInput } from './drag.js';
import {
  addLineItem,
  addTextItem,
  deleteSelected,
  duplicateSelected,
  handleClearAll
} from './items.js';
import { deleteLayout, saveLayout } from './layouts.js';
import { renderFillForm, setMinimalMode, setMode } from './modes.js';
import {
  closeAllPopovers,
  openPopover,
  positionFillPanel
} from './popovers.js';
import {
  hideItemToolbar,
  renderSelection,
  selectItem,
  setActiveAlign,
  setActiveVAlign
} from './selection.js';
import { notify } from './ui.js';

export function wireEvents() {
  on(el.zoomInBtn, 'click', () => core.zoomBy(ZOOM_STEP));
  on(el.zoomOutBtn, 'click', () => core.zoomBy(-ZOOM_STEP));
  on(el.zoom100Btn, 'click', () => core.setZoomScale(1));
  on(el.zoomFitBtn, 'click', () => core.setZoomMode('fit'));
  on(el.minimalToggleBtn, 'click', () =>
    setMinimalMode(!document.body.classList.contains('designer-minimal'))
  );

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
  window.addEventListener('resize', () => {
    const fp = document.getElementById('fillPanel');
    if (fp && fp.classList.contains('open')) positionFillPanel(fp);
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
    if (el.fileDropText) el.fileDropText.textContent = 'Click to upload image';
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
  on(el.lineStyle, 'change', () => {
    const item = findItem(state.selectedId);
    if (!item || item.type !== 'line') return;
    item.line = el.lineStyle.value;
    render();
    selectItem(item.id);
  });
  on(el.lineThickness, 'input', () => {
    const item = findItem(state.selectedId);
    if (!item || item.type !== 'line') return;
    item.thickness = Math.max(
      0.25,
      Math.min(20, Number(el.lineThickness.value) || 1)
    );
    render();
    selectItem(item.id);
  });
  on(el.lineColor, 'input', () => {
    const item = findItem(state.selectedId);
    if (!item || item.type !== 'line') return;
    item.color = el.lineColor.value;
    render();
    selectItem(item.id);
  });
  on(el.railAddLine, 'click', addLineItem);
  on(el.itemBg, 'input', () => {
    const item = findItem(state.selectedId);
    if (!item) return;
    item.bg = el.itemBg.value;
    render();
    selectItem(item.id);
  });
  on(el.itemBgClear, 'click', () => {
    const item = findItem(state.selectedId);
    if (!item) return;
    item.bg = '';
    render();
    selectItem(item.id);
  });
  on(el.fixedToggle, 'click', () => {
    const item = findItem(state.selectedId);
    if (!item) return;
    item.fixed = !item.fixed;
    if (state.mode === 'fill') renderFillForm();
    render();
    selectItem(item.id);
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

  on(el.fillToggleBtn, 'click', (e) => {
    e.stopPropagation();
    setMode(state.mode === 'fill' ? 'design' : 'fill');
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
      const result = core.importLayoutDef(def);
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
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setMinimalMode(!document.body.classList.contains('designer-minimal'));
      return;
    }
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
