/* Kaim Contracting shared behaviour: mobile menu, nav scroll state, email links.
 * Loaded on every page with `defer`. Pages may also carry older inline copies of
 * closeMobMenu(); this file defines the same names so either wins harmlessly. */
(function () {
  'use strict';

  var body = document.body;
  var nav = document.querySelector('nav.site-nav');
  var menu = document.getElementById('mobMenu');
  var burger = nav ? nav.querySelector('.hamburger') : null;

  function setOpen(open) {
    if (!menu) return;
    menu.classList.toggle('open', open);
    body.classList.toggle('menu-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var first = menu.querySelector('.mob-close');
      if (first) first.focus({ preventScroll: true });
    } else if (burger && document.activeElement && menu.contains(document.activeElement)) {
      burger.focus({ preventScroll: true });
    }
  }
  window.closeMobMenu = function () { setOpen(false); };
  window.openMobMenu = function () { setOpen(true); };

  if (burger) burger.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });
  document.addEventListener('click', function (e) {
    if (!body.classList.contains('menu-open') || !menu) return;
    if (!menu.contains(e.target) && !(e.target.closest && e.target.closest('.hamburger'))) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('menu-open')) setOpen(false);
  });
  // Any link inside the panel closes it (the old inline onclicks did the same).
  if (menu) menu.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) setOpen(false);
  });

  // Nav gets a shadow once the page has scrolled. A 1px sentinel above the nav
  // and an IntersectionObserver do this without a scroll listener.
  if (nav && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
    nav.parentNode.insertBefore(sentinel, nav);
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('scrolled', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  }

  // Email address assembled at runtime (keeps scrapers off it).
  var em = 'info' + String.fromCharCode(64) + 'kaimcontracting.com';
  ['tb-email', 'ci-email', 'ft-email'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = em; el.href = 'mailto:' + em; }
  });

  // Tell CSS whether the sticky phone bar is on this page.
  if (document.querySelector('.kc-bar')) body.classList.add('has-bar');
})();
