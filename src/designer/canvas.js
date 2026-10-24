/* Infinite-canvas input (designer-only) */
import { core, el, on, state } from './ctx.js';

export function installCanvasInput() {
  const stage = el.stage;
  if (!stage) return;

  core.setInfiniteCanvas(true);

  let panState = null;
  let spaceDown = false;
  const isBackground = (t) =>
    t === stage || t === el.pageViewport || t === el.page || t === el.guideImg;
  const isPanButton = (e) => e.button === 1 || (e.button === 0 && spaceDown);
  const canLeftDragPan = (e) => e.button === 0 && isBackground(e.target);

  function startPan(e) {
    panState = {
      x: e.clientX,
      y: e.clientY,
      panX: state.panX,
      panY: state.panY
    };
    stage.classList.add('panning');
    if (stage.setPointerCapture)
      try {
        stage.setPointerCapture(e.pointerId);
      } catch (_) {}
  }

  function onPointerDown(e) {
    /* Middle mouse or Space+left anywhere on stage → pan. */
    if (isPanButton(e)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    /* Left-drag on empty background → pan (designer-mode default). */
    if (canLeftDragPan(e)) startPan(e);
  }

  function onPointerMove(e) {
    if (!panState) return;
    core.setPan(
      panState.panX + (e.clientX - panState.x),
      panState.panY + (e.clientY - panState.y)
    );
  }

  function onPointerUp() {
    if (!panState) return;
    panState = null;
    stage.classList.remove('panning');
  }

  function onWheel(e) {
    /* Ctrl/Cmd + wheel → pointer-anchored zoom. */
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const base = state.zoomMode === 'fit' ? state.zoomScale : state.zoomScale;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      core.zoomAt(cx, cy, base * factor);
      return;
    }
    /* Plain wheel → pan vertical. Shift+wheel → pan horizontal. */
    e.preventDefault();
    if (e.shiftKey) core.panBy(-e.deltaY, 0);
    else core.panBy(-e.deltaX, -e.deltaY);
  }

  function onKeyDown(e) {
    if (e.code === 'Space' && !e.repeat) {
      spaceDown = true;
      stage.style.cursor = 'grabbing';
    }
  }
  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      stage.style.cursor = '';
    }
  }

  stage.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  el._canvasInput = {
    teardown() {
      stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.style.cursor = '';
    }
  };
}
