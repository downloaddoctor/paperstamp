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
})();
