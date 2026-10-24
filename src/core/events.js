/* Event bus. */

export const listeners = {};
export function onEvent(name, fn) {
  (listeners[name] = listeners[name] || []).push(fn);
  return function off() {
    const a = listeners[name];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
}
export function emit(name, payload) {
  (listeners[name] || []).forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error('[paperstamp] listener error', e);
    }
  });
}
