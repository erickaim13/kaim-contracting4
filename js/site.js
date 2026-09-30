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

  // Nav widens into a flush bar once the page has scrolled past 20px (the
  // pre-redesign threshold). A 20px sentinel above the nav and an
  // IntersectionObserver do this without a scroll listener.
  if (nav && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:20px;pointer-events:none';
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

/* kcReveal for interior pages (2026-09-30, Eric: "add transitions like the home page"). The homepage carries
   its own copy inline with hand-placed classes; here the blocks are tagged automatically, with a mix of
   flavours, then the same observer reveals them. Anything already scrolled past is shown at once. */
(function () {
  if (!document.body || !document.body.classList.contains('pro-int')) return;
  if (document.documentElement.classList.contains('rv-on')) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  function tag(sel, cls) { document.querySelectorAll(sel).forEach(function (el) { if (!/rv(-|)/.test(el.className)) el.className += ' ' + cls; }); }
  // headings and intros rise; alternate sections slide from opposite sides so it is not all the same
  var flip = 0;
  document.querySelectorAll('.pi-h2,.svc-split-text h2,.svc-block-header h2,.pw-offers h2,.pw-hub h2,.page-content>h2,.ab-story h2,.ab-serving-strip h2,.referral h2,.svc-hero h1,.page-hero-content h1').forEach(function (el) {
    if (/rv(-|)/.test(el.className)) return;
    el.className += (flip++ % 3 === 1) ? ' rv rv-left' : (flip % 3 === 0 ? ' rv rv-right' : ' rv rv-up');
  });
  tag('.pi-lead,.svc-split-text>p,.svc-block-header>p,.page-content>p,.ab-story p', 'rv rv-up rv-d2');
  tag('.pi-why,.pi-steps3,.pi-acc,.sec-light .acc-list,.tools-grid,.svc-checklist,.kc-ba-grid,.pw-offers-grid,.kc-svc-grid,.pkg-grid,.loc-list,.calc-surface-grid,.ft-none', 'rv-stagger');
  tag('.pi-card,.pkg-band-inner,.calc-results,.svc-callout', 'rv rv-right');
  tag('.ba-pair,.kc-ba,.ba-slider,.svc-split-img,.svc-split-media,.svc-split-photo,.svc-photo,.ab-photo,.pi-steps-cta,.calc-card,.loc-map-wrap', 'rv rv-pop');
  tag('.pi-cta .pi-wrap,.svc-final-inner,.referral-inner', 'rv rv-zoom');
  tag('.inc-section,.proc-section,.deal,.hf-card,.post-card,.blog-card', 'rv rv-up');
  document.documentElement.classList.add('rv-on');
  var els = [].slice.call(document.querySelectorAll('.rv,.rv-stagger,.rv-stagger-right'));
  var left = els.length;
  function show(el) { if (!el.classList.contains('in')) { el.classList.add('in'); left--; } }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting || e.boundingClientRect.top < 0) { show(e.target); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
  els.forEach(function (el) { io.observe(el); });
  var ticking = false;
  function sweep() { ticking = false; if (left <= 0) { window.removeEventListener('scroll', onScroll); return; }
    var h = window.innerHeight; els.forEach(function (el) { if (!el.classList.contains('in') && el.getBoundingClientRect().top < h * 0.92) { show(el); io.unobserve(el); } }); }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', sweep);
  setTimeout(sweep, 400);
})();
