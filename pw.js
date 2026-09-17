/* PaperStamp PWA bootstrap — registers the service worker and wires
   install/update UX. Loaded by every page; no-op when unsupported. */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function (err) {
      // Registration failure must never break the app.
      if (window.console && console.warn) {
        console.warn('[paperstamp] SW registration failed:', err);
      }
    });
  });

  // SW found a fresh deploy (AGENTS.md sentinel changed) and already
  // refreshed the cache in the background — reload to pick it up.
  // Guarded against reload loops: only one auto-reload per short window,
  // so a flaky sentinel/network hiccup can't reload the page repeatedly.
  var RELOAD_GUARD_KEY = 'paperstamp-reload-guard';
  var RELOAD_GUARD_MS = 10000;

  navigator.serviceWorker.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'paperstamp-update-ready') return;

    var last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
    } catch (err) {
      /* sessionStorage unavailable (private mode etc) — reload once, no guard. */
    }
    if (Date.now() - last < RELOAD_GUARD_MS) return;

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch (err) {
      /* ignore — best effort only. */
    }
    window.location.reload();
  });
})();
