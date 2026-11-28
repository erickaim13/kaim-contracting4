/* /gutter-price: the instant gutter cleaning price, as its own flow (2026-11-19).
 *
 * address -> who the quote is for (first, last, mobile, email) -> a calculating
 * screen (the real house from above, the town record ticking in) -> the real
 * CRM quote page, the same one every customer gets, where they see the number
 * and approve it. There is no price screen on this page.
 *
 * Server: /api/instant-quote  { action:'lookup' }  house facts, never a price
 *                             { action:'quote' }   saves the lead + the CRM quote, returns its link
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
  var S = { address: '', house: null, lead: null, quote: null };

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

  // The finished quote survives a reload or the back button (2 hours).
  var KEEP = 'kc_gp_state';
  function remember() { try { sessionStorage.setItem(KEEP, JSON.stringify({ t: Date.now(), address: S.address, house: S.house, lead: S.lead, quote: S.quote })); } catch (_) { } }
  function recall() {
    try {
      var o = JSON.parse(sessionStorage.getItem(KEEP) || 'null');
      if (!o || !o.quote || !o.lead || Date.now() - o.t > 72e5) return false;
      S.address = o.address; S.house = o.house; S.lead = o.lead; S.quote = o.quote;
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
    // Meta gets this step too (2026-11-28): it happens far more often than a finished
    // lead, so an ad set can be pointed at it and get enough examples to learn from.
    try { if (window.fbq && variant !== 'preview') fbq('trackCustom', 'GutterAddressEntered'); } catch (_) { }
    gate();
  });

  // ---- 2. who the quote is for ---------------------------------------------
  // Name, mobile number and email come BEFORE anything is calculated (Eric,
  // 2026-11-19: no blurred price; gather the info, then the loading screen).
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
    phone.value = out; mark(phone, false);
  });

  // Gutter brightening, the add-on (back on this page 2026-11-23): ticked here, it
  // is a second line on the quote they are about to see. No price is shown on this page.
  var brBtn = $('gpBright');
  brBtn.addEventListener('click', function () {
    var on = !brBtn.classList.contains('on');
    brBtn.classList.toggle('on', on); brBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) ev('instant_quote_brightening');
  });

  // Gutter guards (2026-11-28): asked on every quote. The price is the same
  // either way; the answer rides along on the lead so Eric knows beforehand.
  var gdBox = $('gpGuards'), gdBtns = gdBox ? [].slice.call(gdBox.querySelectorAll('.gp-gd-btn')) : [];   // an older cached page has no question
  gdBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      S.guards = b.getAttribute('data-v');
      gdBtns.forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      gdBox.classList.remove('bad');
    });
  });

  function gate(failed) {
    $('gpFacts').textContent = S.address;
    var btn = $('gpGateBtn'); btn.disabled = false; btn.textContent = 'Calculate My Price';
    $('gpGateFail').style.display = failed ? 'block' : 'none';
    show('gate');
    if (!failed) setTimeout(function () { try { $('gpFirst').focus({ preventScroll: true }); } catch (_) { } }, 400);
  }

  $('gpGateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('gpGateBtn'); if (btn.disabled) return;
    var first = $('gpFirst').value.trim(), last = $('gpLast').value.trim(), email = $('gpEmail').value.trim(), bad = null;
    mark($('gpFirst'), !first); mark($('gpLast'), !last); mark(phone, !usDigits(phone.value));
    mark($('gpEmail'), !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
    [$('gpFirst'), $('gpLast'), phone, $('gpEmail')].forEach(function (el) { if (!bad && el.classList.contains('err')) bad = el; });
    if (bad) { bad.focus(); return; }
    if (gdBox && S.guards !== 'yes' && S.guards !== 'no') { gdBox.classList.add('bad'); try { gdBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { } return; }
    var wantBright = brBtn.classList.contains('on');
    S.lead = {
      first: first, last: last, phone: phone.value, email: email, bright: wantBright, guards: S.guards === 'yes',
      address: S.address, service: 'Gutter Cleaning',
      message: 'Instant gutter price page:\n- Address: ' + S.address + (S.unit ? '\n- Unit: ' + S.unit : '') + (wantBright ? '\n- Also wants gutter brightening' : ''),
      contactPref: 'Phone Call', source: 'Gutter Price Page' + (srcTag ? ' (from ' + srcTag + ')' : ''),
      kc_hpot_xyz: $('gpHp').value || ''
    };
    btn.disabled = true;
    if (S.lead.guards) ev('instant_quote_guards');
    calc();
  });

  // ---- 3. calculating -------------------------------------------------------
  function tick(name, state, note) {
    var li = root.querySelector('#gpTicks li[data-t="' + name + '"]'); if (!li) return;
    li.classList.remove('go', 'ok'); if (state) li.classList.add(state);
    if (note != null) li.querySelector('small').textContent = note;
  }
  // The second step's wording: a town record in Massachusetts, a measurement in New Hampshire.
  function recLabel(t) {
    var li = root.querySelector('#gpTicks li[data-t="rec"]'), sp = li && li.querySelector('span:not(.gp-dot)');
    if (sp && sp.firstChild && sp.firstChild.nodeType === 3) sp.firstChild.nodeValue = t;
  }
  // The bar: the fill eases to each mark, the number counts along with it.
  var barAt = 0, barTimer = null;
  function bar(to, label) {
    $('gpBar').style.width = to + '%';
    if (label) $('gpBarTxt').textContent = label;
    clearInterval(barTimer);
    barTimer = setInterval(function () {
      if (barAt >= to) { clearInterval(barTimer); return; }
      barAt = Math.min(to, barAt + 1);
      $('gpBarPct').textContent = barAt + '%'; $('gpBarBox').setAttribute('aria-valuenow', String(barAt));
    }, 28);
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
  function leadEvents() {
    try {
      if (window.gtag) {
        var ph = S.lead.phone.replace(/\D/g, '');
        gtag('event', 'conversion', { send_to: 'AW-18069179134/4aB2CMbQmrUcEP6Vh6hD', value: 150, currency: 'USD', user_data: { email: S.lead.email || undefined, phone_number: ph.length >= 10 ? '+1' + ph.slice(-10) : undefined, address: { first_name: S.lead.first || undefined } } });
        gtag('event', 'generate_lead', { lead_source: S.lead.source });
      }
      if (window.fbq) fbq('track', 'Lead');
    } catch (_) { }
  }
  function calc() {
    var box = $('gpScan'), started = Date.now();
    box.classList.remove('has', 'done'); $('gpTiles').innerHTML = '';
    $('gpScanLbl').textContent = S.address.replace(/,? (MA|NH)( \d{5})?$/, '');
    ['find', 'rec', 'run', 'price', 'quote'].forEach(function (t) { tick(t, '', ''); });
    recLabel('Pulling the town record');
    barAt = 0; $('gpBarPct').textContent = '0%'; $('gpBar').style.width = '0%';
    show('scan');
    tick('find', 'go'); bar(14, 'Finding your home');
    // Both run while the steps play: the house facts for this screen, and the
    // real work (the lead and the quote saved in the CRM). "?via=/api/lead" makes
    // the page's attribution script attach the ad click ids; if the instant
    // endpoint fails, the lead still goes in the normal way.
    var look = post('/api/instant-quote', { action: 'lookup', address: S.address }).catch(function () { return { ok: true, found: false }; });
    var quote = post('/api/instant-quote?via=/api/lead', Object.assign({ action: 'quote', variant: variant }, S.lead))
      .catch(function () { return post('/api/lead', S.lead).then(function () { return { ok: true, instant: false }; }); })
      .then(function (r) { leadEvents(); return r; }, function () { return null; });

    look.then(function (h) { return wait(Math.max(0, 1500 - (Date.now() - started))).then(function () { return h; }); })
      .then(function (h) {
        S.house = h && h.found ? h : null;
        if (!S.house) {
          tick('find', 'ok', 'Got the address');
          tick('rec', 'go'); bar(55, 'Checking the town record');
          return wait(1300).then(function () {
            box.classList.add('done');
            tick('rec', 'ok', 'This one needs a quick look from me');
            bar(90, 'Sending it to Eric');
          });
        }
        if (h.lat && h.lng) aerialTiles(Number(h.lat), Number(h.lng), function () { box.classList.add('has'); });
        var two = Number(h.stories) >= 1.75;
        tick('find', 'ok', titleCase(h.addr) + (h.city ? ', ' + titleCase(h.city) : ''));
        // New Hampshire has no town record with the house size: the house is measured from the air.
        if (h.laser) recLabel('Measuring your home');
        tick('rec', 'go'); bar(34, h.laser ? 'Measuring your home' : 'Pulling the town record');
        return wait(1300).then(function () {
          tick('rec', 'ok', h.laser
            ? 'About ' + (Math.round(Number(h.sqft) / 50) * 50).toLocaleString('en-US') + ' sq ft · measured from the air'
            : Number(h.sqft).toLocaleString('en-US') + ' sq ft' + (h.style ? ' · ' + titleCase(h.style) : '') + (h.year ? ' · built ' + h.year : ''));
          tick('run', 'go'); bar(56, 'Sizing up the gutter run');
          return wait(1300);
        }).then(function () {
          tick('run', 'ok', two ? '2 story roofline, ladder work' : '1 story roofline');
          tick('price', 'go'); bar(76, 'Calculating your price');
          return wait(1300);
        }).then(function () {
          tick('price', 'ok', 'Done');
          tick('quote', 'go'); bar(92, 'Writing up your quote');
          return wait(900);
        });
      })
      .then(function () { return quote; })
      .then(function (res) {
        if (!res) { gate(true); return; }   // nothing went through: back to the form, nothing lost
        box.classList.add('done');
        if (res.instant && res.url) {
          S.quote = res;
          tick('quote', 'ok', 'Ready'); bar(100, 'Your quote is ready');
          return wait(750).then(openQuote);
        }
        bar(100, 'Sent');
        return wait(600).then(function () {
          done('Got it, ' + S.lead.first + '!', 'I will take a look at your house myself and text you a price, usually within the hour.');
        });
      });
  }

  // ---- 4. the quote ---------------------------------------------------------
  // Eric, 2026-11-19: no price screen of its own ("i just want the real quote i
  // normally send customers for them to see the number and approve it"). The
  // calculating screen ends on the real CRM quote page: the number is there, and
  // so is the approve button.
  function openQuote() {
    remember();
    ev('instant_quote_shown', { value: Number(S.quote.total || S.quote.clean), currency: 'USD' });
    location.href = S.quote.url;
  }
  // Only seen coming back from the quote (the back button, a reload): one button to open it again.
  function ready() {
    $('gpReadyH').textContent = 'Your quote is ready, ' + S.lead.first;
    $('gpReadyAddr').textContent = S.lead.address;
    var go = $('gpGo'); go.disabled = false; go.textContent = 'See My Quote';
    show('price');
  }
  $('gpGo').addEventListener('click', function () {
    var go = $('gpGo'); if (go.disabled) return;
    go.disabled = true; go.textContent = 'Opening your quote...';
    openQuote();
  });
  // Back from the quote on a phone: the browser brings this page back frozen on the calculating screen.
  window.addEventListener('pageshow', function (e) { if (e.persisted && S.quote && S.lead) ready(); });

  // ---- 5. done --------------------------------------------------------------
  function done(h, p) { $('gpDoneH').textContent = h; $('gpDoneP').textContent = p; show('done'); }

  // Back on this page with a quote already written: straight to its button.
  if (recall()) ready();
})();
