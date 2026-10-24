/* Designer markup and element cache */
import { deleteLayout, saveLayout } from './layouts.js';
import { el, on } from './ctx.js';

export async function buildDom() {
  const bundled = window.__PS_BUNDLE;
  const res = bundled
    ? { ok: true, text: async () => bundled.designerHtml }
    : await fetch('designer.html', { cache: 'no-cache' });
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

export function cacheEls() {
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
    'minimalToggleBtn',
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
    'fillToggleBtn',
    'printBtn',
    'railAddText',
    'railClearAll',
    'itemToolbar',
    'itemName',
    'fontSize',
    'textAlignGroup',
    'vertAlignGroup',
    'deleteItem',
    'lineStyle',
    'lineThickness',
    'lineColor',
    'railAddLine',
    'itemBg',
    'itemBgClear',
    'fixedToggle',
    'fillPanel',
    'fillFormList'
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

export function buildBadges() {
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
  /* Fixed in viewport space so badges never scale with the page. */
  document.body.appendChild(el.wBadge);
  document.body.appendChild(el.hBadge);
}
