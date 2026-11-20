/* /gutter-price: the instant gutter cleaning price, as its own flow (2026-11-19).
 *
 * Eric did not want the instant price to feel like the normal lead form with a
 * number bolted on. So: address first -> a "finding your home" step that shows
 * the real house from above and what the town record says about it -> name and
 * phone to see the price -> the price, with brightening sold by a drag-to-compare
 * before and after -> the CRM quote page to approve.
 *
 * Server: /api/instant-quote  { action:'lookup' }  house facts, never a price
 *                             { action:'quote' }   saves the lead + the CRM quote, returns the price
 *                             { action:'addon' }   adds brightening to that quote
 * A house the town record cannot price still becomes a normal lead: the same
 * 'quote' call saves it and Eric prices it himself.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('gp'); if (!root) return;
  var params = new URLSearchParams(location.search);
  var srcTag = (params.get('src') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  var variant = params.get('instant') === '1' ? 'preview' : 'b';
  var S = { address: '', house: null, lead: null, quote: null, bright: false };

  // Eric's switch (CRM > Lead Sources). Off, or this visitor is on the normal
  // form side of a split test: the normal quote form takes over.
  if (variant !== 'preview') {
    fetch('/api/instant-quote?assign=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.ok) return;
      var share = Number(j.share) || 0, g = '';
      try { g = localStorage.getItem('kc_iq') || ''; } catch (_) { }
      if (share >= 100) g = 'b';
      else if (share > 0 && g !== 'a' && g !== 'b') { g = j.group === 'a' ? 'a' : 'b'; try { localStorage.setItem('kc_iq', g); } catch (_) { } }
      if (share <= 0 || g === 'a') {
        var keep = new URLSearchParams(location.search); keep.set('service', 'Gutter Cleaning');
        location.replace('/quote?' + keep.toString());
      }
    }).catch(function () { });
  }

  // The price screen survives a reload or the back button (2 hours).
  var KEEP = 'kc_gp_state';
  function remember() { try { sessionStorage.setItem(KEEP, JSON.stringify({ t: Date.now(), address: S.address, house: S.house, lead: S.lead, quote: S.quote, bright: S.bright, sent: S.sent, approved: S.approved })); } catch (_) { } }
  function recall() {
    try {
      var o = JSON.parse(sessionStorage.getItem(KEEP) || 'null');
      if (!o || !o.quote || !o.lead || Date.now() - o.t > 72e5) return false;
      S.address = o.address; S.house = o.house; S.lead = o.lead; S.quote = o.quote; S.bright = !!o.bright; S.sent = !!o.sent; S.approved = !!o.approved;
      return true;
    } catch (_) { return false; }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function usd(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ev(name, data) { try { if (window.gtag) gtag('event', name, data || {}); } catch (_) { } }
  function show(step) {
    [].slice.call(root.querySelectorAll('.gp-step')).forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-step') === step); });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); });
  }
  function titleCase(s) { return String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }); }

  // ---- 1. address ---------------------------------------------------------
  var street = $('gpStreet'), town = $('gpTown'), stateEl = $('gpState'), zip = $('gpZip'), sug = $('gpSug'), aTimer = null;
  function mark(el, bad) { el.classList.toggle('err', !!bad); var f = el.closest ? el.closest('.gp-field') : null; if (f) f.classList.toggle('bad', !!bad); }
  [town, zip, $('gpFirst'), $('gpLast'), $('gpEmail')].forEach(function (el) { el.addEventListener('input', function () { mark(el, false); }); });
  zip.addEventListener('input', function () { zip.value = zip.value.replace(/\D/g, '').slice(0, 5); });
  var ST = { 'massachusetts': 'MA', 'new hampshire': 'NH' };
  street.addEventListener('input', function () {
    mark(street, false); clearTimeout(aTimer);
    var v = street.value.trim();
    if (v.length < 4) { sug.style.display = 'none'; return; }
    aTimer = setTimeout(function () {
      fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(v) + '&limit=5&lat=42.73&lon=-71.19&lang=en')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var items = (j.features || []).filter(function (f) { var p = (f && f.properties) || {}; return p.countrycode === 'US' || p.country === 'United States'; })
            .map(function (f) {
              var p = f.properties || {}, st = ((p.housenumber ? p.housenumber + ' ' : '') + (p.street || p.name || '')).trim();
              var tn = p.city || p.town || p.village || p.district || '';
              return { street: st, town: tn, state: ST[String(p.state || '').toLowerCase()] || '', zip: /^\d{5}$/.test(p.postcode || '') ? p.postcode : '', label: [st, tn, p.state].filter(Boolean).join(', ') };
            }).filter(function (x, i, a) { return x.street && a.map(function (y) { return y.label; }).indexOf(x.label) === i; }).slice(0, 4);
          if (!items.length || document.activeElement !== street) { sug.style.display = 'none'; return; }
          sug.innerHTML = items.map(function (t, i) { return '<button type="button" data-i="' + i + '">' + esc(t.label) + '</button>'; }).join('');
          sug.style.display = 'block';
          [].slice.call(sug.querySelectorAll('button')).forEach(function (b) {
            b.addEventListener('mousedown', function (e) {
              e.preventDefault();
              var t = items[Number(b.getAttribute('data-i'))];
              street.value = t.street; mark(street, false);
              if (t.town) { town.value = t.town; mark(town, false); }
              if (t.state) stateEl.value = t.state;
              if (t.zip) { zip.value = t.zip; mark(zip, false); }
              sug.style.display = 'none';
            });
          });
        }).catch(function () { sug.style.display = 'none'; });
    }, 250);
  });
  street.addEventListener('blur', function () { setTimeout(function () { sug.style.display = 'none'; }, 200); });

  $('gpAddrForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var st = street.value.trim(), tn = town.value.trim(), zp = zip.value.trim(), unit = $('gpUnit').value.trim(), bad = null;
    mark(street, !/^\d+[A-Za-z]?\s+\S/.test(st)); mark(town, !tn); mark(zip, zp !== '' && !/^\d{5}$/.test(zp));
    [street, town, zip].forEach(function (el) { if (!bad && el.classList.contains('err')) bad = el; });
    if (bad) { bad.focus(); return; }
    // "7 Alpine Dr, Haverhill, MA 01830". The unit rides along in the lead notes, not in the address the house is looked up by.
    S.unit = unit;
    S.address = st.split(',')[0].trim() + ', ' + tn + ', ' + stateEl.value + (zp ? ' ' + zp : '');
    ev('instant_quote_address');
    scan();
  });

  // ---- 2. finding the house -------------------------------------------------
  function tick(name, state, note) {
    var li = root.querySelector('#gpTicks li[data-t="' + name + '"]'); if (!li) return;
    li.classList.remove('go', 'ok'); if (state) li.classList.add(state);
    if (note != null) li.querySelector('small').textContent = note;
  }
  // The house from above: the state's 2025 aerial photo (MassGIS, public map tiles,
  // about 4 inches a pixel at zoom 20), laid out so the lot sits in the middle.
  var TILE = 'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer/tile/20/';
  function aerialTiles(lat, lng, onFirst) {
    var n = Math.pow(2, 20), r = lat * Math.PI / 180;
    var xf = (lng + 180) / 360 * n, yf = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    var x0 = Math.floor(xf), y0 = Math.floor(yf), ox = (xf - x0) * 256, oy = (yf - y0) * 256, box = $('gpTiles'), fired = false;
    box.innerHTML = '';
    for (var dy = -1; dy <= 1; dy++) for (var dx = -2; dx <= 2; dx++) {
      var im = new Image();
      im.alt = ''; im.style.left = (dx * 256 - ox) + 'px'; im.style.top = (dy * 256 - oy) + 'px';
      if (dx === 0 && dy === 0) im.onload = function () { if (!fired) { fired = true; onFirst(); } };
      im.onerror = function () { this.style.visibility = 'hidden'; };
      im.src = TILE + (y0 + dy) + '/' + (x0 + dx);
      box.appendChild(im);
    }
  }
  function scan() {
    var box = $('gpScan');
    box.classList.remove('has', 'done'); $('gpTiles').innerHTML = '';
    $('gpScanLbl').textContent = S.address.replace(/,? (MA|NH)( \d{5})?$/, '');
    ['find', 'rec', 'run', 'price'].forEach(function (t) { tick(t, '', ''); });
    show('scan');
    tick('find', 'go');
    var started = Date.now();
    post('/api/instant-quote', { action: 'lookup', address: S.address })
      .catch(function () { return { ok: true, found: false }; })
      .then(function (h) {
        // Never faster than a beat: the steps are meant to be read.
        return wait(Math.max(0, 1500 - (Date.now() - started))).then(function () { return h; });
      })
      .then(function (h) {
        S.house = h && h.found ? h : null;
        if (!S.house) {
          tick('find', 'ok', 'Got the address');
          tick('rec', 'go');
          return wait(1200).then(function () {
            box.classList.add('done');
            tick('rec', 'ok', 'This one needs a quick look from me');
            return wait(900).then(function () { gate(); });
          });
        }
        if (h.lat && h.lng) aerialTiles(Number(h.lat), Number(h.lng), function () { box.classList.add('has'); });
        var two = Number(h.stories) >= 1.75;
        tick('find', 'ok', titleCase(h.addr) + (h.city ? ', ' + titleCase(h.city) : ''));
        tick('rec', 'go');
        return wait(1300).then(function () {
          tick('rec', 'ok', Number(h.sqft).toLocaleString('en-US') + ' sq ft' + (h.style ? ' · ' + titleCase(h.style) : '') + (h.year ? ' · built ' + h.year : ''));
          tick('run', 'go');
          return wait(1300);
        }).then(function () {
          tick('run', 'ok', two ? '2 story roofline, ladder work' : '1 story roofline');
          tick('price', 'go');
          return wait(1200);
        }).then(function () {
          tick('price', 'ok', 'Done');
          box.classList.add('done');
          return wait(550);
        }).then(function () { gate(); });
      });
  }

  // ---- 3. name and phone ----------------------------------------------------
  var phone = $('gpPhone');
  function usDigits(v) {
    var d = (v || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : '';
  }
  phone.addEventListener('input', function () {
    var d = phone.value.replace(/\D/g, ''), out;
    if (d.length > 10 && d.charAt(0) === '1') d = d.slice(1);
    d = d.slice(0, 10); out = d;
    if (d.length > 6) out = d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    else if (d.length > 3) out = d.slice(0, 3) + '-' + d.slice(3);
    phone.value = out; phone.classList.remove('err');
  });
  phone.addEventListener('input', function () { mark(phone, false); });

  function gate() {
    var h = S.house;
    $('gpGateK').textContent = h ? 'Your price is ready' : 'I will price this one myself';
    $('gpBlur').style.display = h ? '' : 'none';
    $('gpFacts').textContent = h
      ? S.address
      : 'The town record does not give me enough on this house to price it on the spot. Leave your number and I will text you a price.';
    $('gpGateBtn').textContent = h ? 'Show My Price' : 'Text Me My Price';
    $('gpGateNote').textContent = h ? 'Your quote is sent to this number and email. No spam, ever.' : 'Usually within the hour. No spam, ever.';
    show('gate');
    setTimeout(function () { try { $('gpFirst').focus({ preventScroll: true }); } catch (_) { } }, 400);
  }

  $('gpGateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('gpGateBtn'); if (btn.disabled) return;
    var first = $('gpFirst').value.trim(), last = $('gpLast').value.trim(), email = $('gpEmail').value.trim(), bad = null;
    // Name, mobile number and email are all taken before the price is shown (Eric, 2026-11-19).
    mark($('gpFirst'), !first); mark($('gpLast'), !last); mark(phone, !usDigits(phone.value));
    mark($('gpEmail'), !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
    [$('gpFirst'), $('gpLast'), phone, $('gpEmail')].forEach(function (el) { if (!bad && el.classList.contains('err')) bad = el; });
    if (bad) { bad.focus(); return; }
    var source = 'Gutter Price Page' + (srcTag ? ' (from ' + srcTag + ')' : '');
    var payload = {
      first: first, last: last, phone: phone.value, email: email,
      address: S.address, service: 'Gutter Cleaning',
      message: 'Instant gutter price page:\n- Address: ' + S.address + (S.unit ? '\n- Unit: ' + S.unit : ''),
      contactPref: 'Phone Call', source: source, kc_hpot_xyz: $('gpHp').value || ''
    };
    S.lead = payload;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = S.house ? 'Getting your price...' : 'Sending...';
    $('gpGateFail').style.display = 'none';
    // "?via=/api/lead": the attribution script in the page head only attaches the
    // ad click ids to requests with /api/lead in the address. If the instant
    // endpoint fails, the lead still goes in the normal way.
    post('/api/instant-quote?via=/api/lead', Object.assign({ action: 'quote', variant: variant }, payload))
      .catch(function () { return post('/api/lead', payload); })
      .then(function (res) {
        try {
          if (window.gtag) {
            var ph = payload.phone.replace(/\D/g, '');
            gtag('event', 'conversion', { send_to: 'AW-18069179134/4aB2CMbQmrUcEP6Vh6hD', value: 150, currency: 'USD', user_data: { email: payload.email || undefined, phone_number: ph.length >= 10 ? '+1' + ph.slice(-10) : undefined, address: { first_name: payload.first || undefined } } });
            gtag('event', 'generate_lead', { lead_source: source });
          }
          if (window.fbq) fbq('track', 'Lead');
        } catch (_) { }
        if (res && res.instant && res.url) { S.quote = res; price(); }
        else done('Got it, ' + first + '!', 'I will take a look at your house and text you a price, usually within the hour.');
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = label;
        $('gpGateFail').style.display = 'block';
      });
  });

  // ---- 4. the price ---------------------------------------------------------
  function countUp(el, to, ms) {
    var t0 = null;
    function f(t) {
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = usd(to * e);
      if (k < 1) requestAnimationFrame(f); else el.textContent = usd(to);
    }
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = usd(to); return; }
    requestAnimationFrame(f);
    // Whatever happens to the animation (a background tab never runs it), the real number lands.
    setTimeout(function () { el.textContent = usd(to); }, ms + 250);
  }
  function total() { return Number(S.quote.clean) + (S.bright ? Number(S.quote.bright) : 0); }
  function drawTotal() {
    $('gpTotal').textContent = usd(total());
    $('gpTotalLbl').textContent = S.bright ? 'Cleaning + brightening' : 'Gutter cleaning';
    var a = $('gpAdd');
    a.classList.toggle('on', S.bright); a.setAttribute('aria-pressed', S.bright ? 'true' : 'false');
    a.querySelector('.nm').firstChild.nodeValue = S.bright ? 'Brightening added' : 'Add gutter brightening';
  }
  function price(restored) {
    var qd = S.quote;
    $('gpPriceSub').textContent = S.lead.address;
    $('gpUp').style.display = Number(qd.bright) > 0 ? '' : 'none';
    $('gpAddPr').textContent = '+ ' + usd(qd.bright);
    if (!restored) { S.bright = false; S.sent = false; }
    drawTotal();
    show('price');
    if (restored) $('gpPrice').textContent = usd(qd.clean);
    else { countUp($('gpPrice'), Number(qd.clean), 900); ev('instant_quote_shown', { value: Number(qd.clean), currency: 'USD' }); }
    remember();
    setTimeout(baHint, restored ? 300 : 1300);
  }
  $('gpAdd').addEventListener('click', function () {
    S.bright = !S.bright; drawTotal(); remember();
    if (S.bright) ev('instant_quote_add_brightening', { value: Number(S.quote.bright), currency: 'USD' });
  });
  // The quote on the CRM is kept in step with the brightening box: only told when it changed.
  function syncAddon() {
    if (!!S.sent === !!S.bright) return Promise.resolve();
    var want = S.bright;
    return post('/api/instant-quote', { action: 'addon', token: S.quote.token, bright: want })
      .then(function () { S.sent = want; remember(); }, function () { });
  }
  // The full quote opens over this page. The button in its top bar (or Esc, or
  // the phone's back button) closes it and the price screen is right where it was.
  var modal = $('gpModal'), frame = $('gpFrame');
  function openQuote() {
    frame.src = S.quote.url + (S.quote.url.indexOf('?') > -1 ? '&' : '?') + 'embed=1&t=' + Date.now();
    modal.classList.add('on'); document.body.classList.add('gp-lock');
    try { history.pushState({ gpQuote: 1 }, ''); } catch (_) { }
    $('gpModalX').focus();
  }
  function closeQuote(fromPop) {
    if (!modal.classList.contains('on')) return;
    modal.classList.remove('on'); document.body.classList.remove('gp-lock');
    frame.removeAttribute('src');
    if (!fromPop) { try { if (history.state && history.state.gpQuote) history.back(); } catch (_) { } }
    var go = $('gpGo'); go.disabled = false; go.textContent = S.approved ? 'See My Approved Quote' : 'See My Full Quote';
    if (S.approved) approved();
  }
  $('gpModalX').addEventListener('click', function () { closeQuote(false); });
  window.addEventListener('popstate', function () { closeQuote(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeQuote(false); });
  // The quote page says so when it is approved or declined (kaim-crm index.html submitApproval).
  window.addEventListener('message', function (e) {
    if (!/^https:\/\/(billing\.kaimcontracting\.com|(www\.)?kaimcontractingapp\.com)$/.test(e.origin)) return;
    var d = e.data || {};
    if (d.kc === 'quote-approved') { S.approved = true; remember(); ev('instant_quote_approved', { value: total(), currency: 'USD' }); }
  });
  function approved() {
    try { sessionStorage.removeItem(KEEP); } catch (_) { }
    done('You are all set, ' + S.lead.first + '!', 'Quote approved. I will text you to set the day. No deposit, you pay when the job is done.');
  }
  $('gpGo').addEventListener('click', function () {
    var go = $('gpGo'); if (go.disabled) return;
    go.disabled = true; go.textContent = 'Opening your quote...';
    ev('instant_quote_continue', { value: total(), currency: 'USD' });
    syncAddon().then(openQuote);
  });
  $('gpLater').addEventListener('click', function () {
    syncAddon().then(function () {
      try { sessionStorage.removeItem(KEEP); } catch (_) { }
      done('Got it!', 'Your quote is on its way by text. Open it whenever you are ready.');
    });
  });

  // Before / after: drag (or arrow keys) to compare.
  var ba = $('gpBa'), baTop = $('gpBaTop'), baLine = $('gpBaLine'), baKnob = $('gpBaKnob'), baPct = 50, baUsed = false;
  function baSet(p) {
    baPct = Math.max(3, Math.min(97, p));
    baTop.style.width = baPct + '%'; baLine.style.left = baPct + '%'; baKnob.style.left = baPct + '%';
    ba.setAttribute('aria-valuenow', String(Math.round(baPct)));
  }
  function baSize() { var w = ba.getBoundingClientRect().width; if (w) baTop.querySelector('img').style.width = w + 'px'; }
  function baFrom(e) { var r = ba.getBoundingClientRect(); baSet((e.clientX - r.left) / r.width * 100); }
  ba.addEventListener('pointerdown', function (e) { baUsed = true; try { ba.setPointerCapture(e.pointerId); } catch (_) { } baFrom(e); });
  ba.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') { baUsed = true; baFrom(e); } });
  ba.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { baUsed = true; baSet(baPct - 6); e.preventDefault(); }
    if (e.key === 'ArrowRight') { baUsed = true; baSet(baPct + 6); e.preventDefault(); }
  });
  window.addEventListener('resize', baSize);
  // A short wiggle the first time so it is obvious the photo can be dragged.
  function baHint() {
    baSize();
    if (baUsed || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var path = [50, 22, 78, 50], i = 0, from = 50, t0 = null;
    function f(t) {
      if (baUsed) return;
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / 620), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      baSet(from + (path[i + 1] - from) * e);
      if (k < 1) { requestAnimationFrame(f); return; }
      i++; from = path[i]; t0 = null;
      if (i < path.length - 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }
  baSet(50);

  // ---- 5. done --------------------------------------------------------------
  function done(h, p) { $('gpDoneH').textContent = h; $('gpDoneP').textContent = p; show('done'); }

  // Back on this page with a price already worked out: straight to it.
  if (recall()) price(true);
})();
