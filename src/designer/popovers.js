/* Popovers */
import { el, on, state } from './ctx.js';

export function closeAllPopovers() {
  document
    .querySelectorAll('.tool-popover.open')
    .forEach((p) => p.classList.remove('open'));
  document
    .querySelectorAll('.rail-btn.active')
    .forEach((b) => b.classList.remove('active'));
  if (el.rightStack) el.rightStack.classList.remove('popover-open');
  /* Any close path drops out of fill mode and resets the pencil toggle. */
  state.mode = 'design';
  if (el.fillToggleBtn) {
    el.fillToggleBtn.classList.remove('active');
    el.fillToggleBtn.setAttribute('aria-pressed', 'false');
  }
}
/* Anchor the fill panel above the pencil button (bottom-right). */
export function positionFillPanel(panel) {
  if (!panel || !el.fillToggleBtn) return;
  const r = el.fillToggleBtn.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const gap = 12;
  /* Prefer right-aligned to the pencil, above it. */
  let left = r.right - p.width;
  let top = r.top - p.height - gap;
  /* Flip below if it would overflow the top. */
  if (top < 8) top = r.bottom + gap;
  /* Clamp horizontally. */
  left = Math.max(8, Math.min(window.innerWidth - p.width - 8, left));
  panel.style.left = left + 'px';
  panel.style.right = 'auto';
  panel.style.top = top + 'px';
  panel.style.bottom = 'auto';
}

export function openPopover(panelId, railBtn) {
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
