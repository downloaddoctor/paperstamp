/* State to DOM sync */
import { core, el, on, round1, state } from './ctx.js';

export function syncGuideDom() {
  core.applyGuideToDom();
  if (el.guideOpacity) el.guideOpacity.value = state.guideOpacity;
  if (el.opacityVal) el.opacityVal.textContent = state.guideOpacity;
}
export function syncPageSetupInputs() {
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
