'use strict';

/* PaperStamp shell — creates the stage/page DOM and base CSS when the page
   does not already provide them (single-file build). Runs before core.js. */
(function () {
  const bundle = window.__PS_BUNDLE;
  if (bundle && !document.getElementById('psBaseStyle')) {
    const style = document.createElement('style');
    style.id = 'psBaseStyle';
    style.textContent = bundle.baseCss;
    document.head.appendChild(style);
  }
  if (document.getElementById('stage')) return;
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.innerHTML =
    '<div id="pageViewport"><div id="page"><img id="guideImg" alt="" /></div></div>';
  document.body.appendChild(stage);
  if (!document.getElementById('pageSizeStyle')) {
    const s = document.createElement('style');
    s.id = 'pageSizeStyle';
    document.head.appendChild(s);
  }
})();
