/* Toast and confirm dialogs */
import { el, on } from './ctx.js';

let toastTimer = null;
export function notify(message) {
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
export function confirmAction(message, onConfirm) {
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
