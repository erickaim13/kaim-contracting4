/* Kaim Contracting quote form (v2 - classic single-screen form).
 *
 * Lives on quote.html only; every other page shows a "Get My Free Quote"
 * button that links here. Renders into:
 *   <div class="kc-form-slot" data-kc='{ "source": "Quote Page" }'></div>
 *   <script src="js/kc-form.js?v=2" defer></script>
 *
 * Fields: service, name, phone, email (optional), property address, note.
 * On submit -> POST /api/lead, then offers three open days to self-book the
 * free in-person estimate via /api/estimate-visit (address rides along onto
 * the calendar entry).
 *
 * URL params: ?service=Paver%20Sealing preselects the dropdown,
 *             ?src=paver-sealing tags the lead source with the page it came from,
 *             ?offer=... arms an offer banner (from the deal cards).
 */
(function () {
  'use strict';

  var SERVICES = ['House Washing', 'Roof Cleaning', 'Driveway or Walkway', 'Patio or Pool Deck',
    'Deck or Fence', 'Paver Sealing', 'Oxidation Removal', 'Gutter Brightening', 'Something Else'];

  var CSS = '.kcf{background:rgba(13,30,53,.72);-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:26px 22px 18px;box-shadow:0 28px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.09);width:100%;color:#fff;font-family:"Source Sans 3",sans-serif;text-align:left}'
    + '.kcf-title{font-family:Oswald,sans-serif;font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#e2c47a;margin:0 0 4px;line-height:1.2;text-align:center}'
    + '.kcf-kicker{font-size:12.5px;color:rgba(255,255,255,.55);text-align:center;margin-bottom:16px}'
    + '.kcf-field{margin-bottom:10px}'
    + '.kcf input,.kcf select,.kcf textarea{width:100%;min-height:50px;padding:13px 14px;border:1px solid rgba(255,255,255,.16);border-radius:10px;font-family:"Source Sans 3",sans-serif;font-size:16px;color:#fff;background:rgba(255,255,255,.07);outline:none;-webkit-appearance:none;appearance:none;transition:border-color .15s,background .15s,box-shadow .15s}'
    + '.kcf textarea{min-height:64px;resize:vertical}'
    + '.kcf input::placeholder,.kcf textarea::placeholder{color:rgba(255,255,255,.5)}'
    + '.kcf input:focus,.kcf select:focus,.kcf textarea:focus{border-color:#c9a84c;background:rgba(255,255,255,.11);box-shadow:0 0 0 3px rgba(201,168,76,.22)}'
    + '.kcf .kcf-err{border-color:#e06a5a!important;box-shadow:0 0 0 3px rgba(224,106,90,.18)!important}'
    + '.kcf-selwrap{position:relative}'
    + '.kcf-selwrap svg{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#e2c47a;pointer-events:none}'
    + '.kcf select{cursor:pointer}.kcf select.kcf-empty{color:rgba(255,255,255,.5)}'
    + '.kcf select option{background:#0d1e35;color:#fff}'
    + '.kcf-cta{width:100%;background:#c9a84c;color:#0d1e35;border:none;border-radius:10px;padding:15px;font-family:Oswald,sans-serif;font-size:13.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;margin-top:6px;transition:background .15s,transform .15s}'
    + '.kcf-cta:hover{background:#e2c47a;transform:translateY(-1px)}.kcf-cta:disabled{opacity:.7;cursor:default;transform:none}'
    + '.kcf-foot{margin-top:10px;text-align:center;font-size:12px;color:rgba(255,255,255,.6)}'
    + '.kcf-fail{display:none;margin-top:9px;text-align:center;font-size:13px;color:#ff9d8f}.kcf-fail a{color:#e2c47a;font-weight:700;text-decoration:none}'
    + '.kcf-callrow{display:flex;gap:8px;margin-top:11px}'
    + '.kcf-callrow a{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.45);color:#e2c47a;font-family:Oswald,sans-serif;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;padding:11px 10px;border-radius:8px}'
    + '.kcf-offer{display:none;align-items:center;gap:8px;background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.5);border-radius:8px;padding:8px 11px;font-size:12.5px;color:#e2c47a;margin-bottom:12px;line-height:1.35}.kcf-offer svg{width:14px;height:14px;flex-shrink:0}.kcf-offer b{font-weight:700}.kcf-offer button{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;padding:0 2px;line-height:1}'
    + '.kcf-done{text-align:center;padding:10px 2px 6px}'
    + '.kcf-done-ico{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:50%;background:rgba(201,168,76,.18);border:2px solid #c9a84c;margin-bottom:12px}'
    + '.kcf-done-h{font-family:Oswald,sans-serif;font-size:19px;font-weight:700;text-transform:uppercase;color:#e2c47a;margin-bottom:5px}'
    + '.kcf-done-p{font-size:14px;color:rgba(255,255,255,.72);line-height:1.55}'
    + '.kcf-days{display:grid;gap:8px;margin:16px 0 4px}'
    + '.kcf-day{display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:13px 15px;cursor:pointer;color:#fff;width:100%;font-family:"Source Sans 3",sans-serif;transition:all .15s;text-align:left}'
    + '.kcf-day:hover{border-color:#c9a84c;background:rgba(201,168,76,.12)}.kcf-day:disabled{opacity:.6;cursor:default}'
    + '.kcf-day .d{font-weight:700;font-size:14.5px}.kcf-day .t{font-family:Oswald,sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#e2c47a;white-space:nowrap}'
    + '.kcf-skip{display:block;margin:12px auto 2px;background:none;border:none;color:rgba(255,255,255,.55);font-size:12.5px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;font-family:"Source Sans 3",sans-serif}.kcf-skip:hover{color:#e2c47a}'
    + '.kcf-dd{width:100%;min-height:50px;padding:13px 40px 13px 14px;border:1px solid rgba(255,255,255,.16);border-radius:10px;font-family:"Source Sans 3",sans-serif;font-size:16px;color:#fff;background:rgba(255,255,255,.07);text-align:left;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;display:flex;align-items:center}'
    + '.kcf-dd.kcf-empty span{color:rgba(255,255,255,.5)}'
    + '.kcf-dd.open,.kcf-dd:focus{border-color:#c9a84c;background:rgba(255,255,255,.11);box-shadow:0 0 0 3px rgba(201,168,76,.22);outline:none}'
    + '.kcf-ddpanel{position:absolute;top:calc(100% + 5px);left:0;right:0;background:#12253f;border:1px solid rgba(201,168,76,.45);border-radius:12px;overflow:hidden;z-index:40;display:none;box-shadow:0 22px 50px rgba(0,0,0,.55)}'
    + '.kcf-ddpanel.open{display:block;animation:kcfDd .18s ease}'
    + '@keyframes kcfDd{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}'
    + '.kcf-ddpanel button{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.9);font-family:"Source Sans 3",sans-serif;font-size:14.5px;padding:12px 15px;cursor:pointer;transition:background .12s}'
    + '.kcf-ddpanel button:hover{background:rgba(201,168,76,.15);color:#e2c47a}.kcf-ddpanel button:last-child{border-bottom:none}'
    + '.kcf-ddpanel button.sel{color:#e2c47a;font-weight:700;background:rgba(201,168,76,.08)}'
    + '.kcf-sug{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#122843;border:1px solid rgba(201,168,76,.4);border-radius:10px;overflow:hidden;z-index:30;display:none;box-shadow:0 18px 40px rgba(0,0,0,.5)}'
    + '.kcf-sug button{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.88);font-family:"Source Sans 3",sans-serif;font-size:14px;padding:11px 13px;cursor:pointer}.kcf-sug button:hover{background:rgba(201,168,76,.14)}.kcf-sug button:last-child{border-bottom:none}'
    + '.kcf-file{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border:1px dashed rgba(255,255,255,.28);border-radius:10px;color:rgba(255,255,255,.65);font-family:"Source Sans 3",sans-serif;font-size:14px;cursor:pointer;transition:border-color .15s,color .15s;padding:12px;width:100%}'
    + '.kcf-file:hover{border-color:#c9a84c;color:#e2c47a}'
    + '.kcf-files{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'
    + '.kcf-files span{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:4px 9px;font-size:12px;color:rgba(255,255,255,.8)}'
    + '.kcf-files button{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:14px;padding:0;line-height:1}.kcf-files button:hover{color:#ff9d8f}'
    + '@media(max-width:640px){.kcf{padding:20px 16px 14px}.kcf-title{font-size:16px}}';

  var PHONE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.5 2.18 2 2 0 012.49.5h3a2 2 0 012 1.72c.12.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.91 8.1a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0122 16.92z"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var inst = null;

  function mount(slot) {
    var cfg;
    try { cfg = JSON.parse(slot.getAttribute('data-kc') || '{}'); } catch (e) { cfg = {}; }
    cfg.title = cfg.title || 'Get Your Free Estimate';
    cfg.kicker = cfg.kicker || 'Takes about 20 seconds';
    cfg.submitLabel = cfg.submitLabel || 'Get My Free Estimate';
    cfg.source = cfg.source || 'Quote Page';

    if (!document.getElementById('kcf-css')) {
      var st = document.createElement('style'); st.id = 'kcf-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    var params = new URLSearchParams(location.search);
    var preService = params.get('service') || '';
    var srcPage = (params.get('src') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    var urlOffer = (params.get('offer') || '').slice(0, 240);

    slot.innerHTML = '<form class="kcf" novalidate autocomplete="on">'
      + '<div class="kcf-title">' + esc(cfg.title) + '</div>'
      + '<div class="kcf-kicker">' + esc(cfg.kicker) + '</div>'
      + '<div class="kcf-offer" data-kcf="offer"></div>'
      + '<div style="display:none" aria-hidden="true"><label>Leave empty<input type="text" name="hf_hpot" tabindex="-1" autocomplete="off" value=""></label></div>'
      + (cfg.service ? '<input type="hidden" data-kcf="service" value="' + esc(cfg.service) + '">' : '<div class="kcf-field kcf-selwrap"><input type="hidden" data-kcf="service" value="' + esc(SERVICES.indexOf(preService) > -1 ? preService : '') + '">'
      + '<button type="button" class="kcf-dd' + (SERVICES.indexOf(preService) > -1 ? '' : ' kcf-empty') + '" data-kcf="ddbtn" aria-haspopup="listbox" aria-label="What do you need done?"><span>' + esc(SERVICES.indexOf(preService) > -1 ? preService : 'What do you need done?') + '</span></button>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      + '<div class="kcf-ddpanel" data-kcf="ddpanel" role="listbox">' + SERVICES.map(function (s) { return '<button type="button" role="option" data-v="' + esc(s) + '"' + (s === preService ? ' class="sel"' : '') + '>' + esc(s) + '</button>'; }).join('') + '</div></div>')
      + '<div class="kcf-field" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input type="text" data-kcf="name" placeholder="First name" autocomplete="given-name" aria-label="First name"><input type="text" data-kcf="lname" placeholder="Last name" autocomplete="family-name" aria-label="Last name"></div>'
      + '<div class="kcf-field"><input type="tel" data-kcf="phone" placeholder="Phone number" autocomplete="tel" inputmode="tel" aria-label="Phone number"></div>'
      + '<div class="kcf-field"><input type="email" data-kcf="email" placeholder="Email (optional)" autocomplete="email" aria-label="Email"></div>'
      + '<div class="kcf-field" style="position:relative"><input type="text" data-kcf="address" placeholder="Property address" autocomplete="off" aria-label="Property address"><div class="kcf-sug" data-kcf="asug"></div></div>'
      + '<div class="kcf-field"><textarea data-kcf="note" rows="2" placeholder="Anything we should know? (optional)" aria-label="Optional message"></textarea></div>'
      + (cfg.photos ? '<div class="kcf-field"><label class="kcf-file"><input type="file" data-kcf="files" accept="image/*" multiple style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>Add photos of the project (optional)</label><div class="kcf-files" data-kcf="filelist"></div></div>' : '')
      + '<button type="submit" class="kcf-cta" data-kcf="submit">' + esc(cfg.submitLabel) + '</button>'
      + '<div class="kcf-fail" data-kcf="fail">Could not send. Please try again or <a href="tel:978-351-2195">call 978-351-2195</a>.</div>'
      + '<div class="kcf-foot">We typically respond within the hour. No spam, ever.</div>'
      + '<div class="kcf-callrow"><a href="tel:978-351-2195">' + PHONE_SVG + 'Call 978-351-2195</a></div>'
      + '</form>';

    var form = slot.querySelector('form');
    function q(sel) { return form.querySelector('[data-kcf="' + sel + '"]'); }
    var offer = null;

    var ddBtn = q('ddbtn'), ddPanel = q('ddpanel'), svcInp = q('service');
    if (ddBtn) ddBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      ddPanel.classList.toggle('open'); ddBtn.classList.toggle('open');
    });
    if (ddPanel) [].slice.call(ddPanel.querySelectorAll('button')).forEach(function (b) {
      b.addEventListener('click', function () {
        svcInp.value = b.getAttribute('data-v');
        ddBtn.querySelector('span').textContent = b.getAttribute('data-v');
        ddBtn.classList.remove('kcf-empty'); ddBtn.classList.remove('kcf-err');
        [].slice.call(ddPanel.querySelectorAll('button')).forEach(function (x) { x.classList.toggle('sel', x === b); });
        ddPanel.classList.remove('open'); ddBtn.classList.remove('open');
      });
    });
    if (ddPanel) document.addEventListener('click', function (e) {
      if (!ddPanel.contains(e.target)) { ddPanel.classList.remove('open'); ddBtn.classList.remove('open'); }
    });

    // Prefetch open estimate days so the booking step is instant.
    var days = null;
    fetch('/api/estimate-visit').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok && Array.isArray(j.days) && j.days.length) days = j.days; })
      .catch(function () { });

    var phoneEl = q('phone');
    phoneEl.addEventListener('input', function () {
      var d = phoneEl.value.replace(/\D/g, '').slice(0, 10), out = d;
      if (d.length > 6) out = d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
      else if (d.length > 3) out = d.slice(0, 3) + '-' + d.slice(3);
      phoneEl.value = out; phoneEl.classList.remove('kcf-err');
    });
    ['name', 'lname', 'email', 'note'].forEach(function (id) {
      q(id).addEventListener('input', function () { q(id).classList.remove('kcf-err'); });
    });

    // Address autocomplete (OpenStreetMap/Photon, biased to the Merrimack Valley).
    var aEl = q('address'), sug = q('asug'), aTimer = null;
    aEl.addEventListener('input', function () {
      aEl.classList.remove('kcf-err');
      clearTimeout(aTimer);
      var v = aEl.value.trim();
      if (v.length < 4) { sug.style.display = 'none'; return; }
      aTimer = setTimeout(function () {
        fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(v) + '&limit=5&lat=42.73&lon=-71.19&lang=en')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var items = (j.features || []).filter(function (f) {
              var p = (f && f.properties) || {};
              return (p.countrycode === 'US' || p.country === 'United States');
            }).map(function (f) {
              var p = f.properties || {};
              var street = ((p.housenumber ? p.housenumber + ' ' : '') + (p.street || p.name || '')).trim();
              return [street, p.city || p.town || p.village || p.district, p.state, p.postcode].filter(Boolean).join(', ');
            }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 4);
            if (!items.length || document.activeElement !== aEl) { sug.style.display = 'none'; return; }
            sug.innerHTML = items.map(function (t) { return '<button type="button">' + esc(t) + '</button>'; }).join('');
            sug.style.display = 'block';
            [].slice.call(sug.querySelectorAll('button')).forEach(function (b) {
              b.addEventListener('mousedown', function (ev) { ev.preventDefault(); aEl.value = b.textContent; sug.style.display = 'none'; });
            });
          })
          .catch(function () { sug.style.display = 'none'; });
      }, 250);
    });
    aEl.addEventListener('blur', function () { setTimeout(function () { sug.style.display = 'none'; }, 200); });

    // Optional photo attachments: compressed client-side like the old
    // homepage form (max 1200px wide JPEG), capped at 5.
    var photos = [];
    if (cfg.photos) {
      var fInp = q('files'), fList = q('filelist');
      var renderFiles = function () {
        fList.innerHTML = photos.map(function (ph, i) {
          return '<span>' + esc(ph.name) + '<button type="button" data-i="' + i + '" aria-label="Remove">&times;</button></span>';
        }).join('');
        [].slice.call(fList.querySelectorAll('button')).forEach(function (b) {
          b.addEventListener('click', function () { photos.splice(Number(b.getAttribute('data-i')), 1); renderFiles(); });
        });
      };
      fInp.addEventListener('change', function () {
        [].slice.call(fInp.files).slice(0, 5 - photos.length).forEach(function (file) {
          if (!/^image\//.test(file.type)) return;
          var reader = new FileReader();
          reader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
              var w = img.width, h = img.height, maxW = 1200;
              if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
              var c = document.createElement('canvas'); c.width = w; c.height = h;
              c.getContext('2d').drawImage(img, 0, 0, w, h);
              photos.push({ name: file.name, data: c.toDataURL('image/jpeg', 0.6) });
              renderFiles();
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        });
        fInp.value = '';
      });
    }

    var lead = null;
    var extraLines = [];

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = q('submit');
      if (btn.disabled) return;
      var svc = q('service').value;
      var first = (q('name').value || '').trim();
      var lastName = (q('lname').value || '').trim();
      var phone = phoneEl.value || '';
      var email = (q('email').value || '').trim();
      var address = (q('address').value || '').trim();
      var note = (q('note').value || '').trim();

      var bad = null;
      if (!svc && ddBtn) { ddBtn.classList.add('kcf-err'); bad = bad || ddBtn; }
      if (!first) { q('name').classList.add('kcf-err'); bad = bad || q('name'); }
      if (phone.replace(/\D/g, '').length < 10) { phoneEl.classList.add('kcf-err'); bad = bad || phoneEl; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { q('email').classList.add('kcf-err'); bad = bad || q('email'); }
      if (!address) { q('address').classList.add('kcf-err'); bad = bad || q('address'); }
      if (bad) { bad.focus(); return; }

      var lines = ['Quote page request:', '- Looking for: ' + svc, '- Address: ' + address];
      if (note) lines.push('- Note: ' + note);
      if (offer) lines.push('- Offer: ' + offer);
      extraLines.forEach(function (l) { lines.push(l); });

      var source = cfg.source + (srcPage ? ' (from ' + srcPage + ')' : '');
      if (offer) source += ' | Offer: ' + offer;

      var payload = {
        first: first,
        last: lastName || '(not provided)',
        phone: phone, email: email, address: address,
        // Send the specific service label - the auto-reply text uses it
        // verbatim ("thanks for reaching out about Roof Cleaning!").
        service: svc === 'Something Else' ? 'Pressure Washing' : svc,
        message: lines.join('\n'),
        contactPref: 'Phone Call',
        source: source,
        kc_hpot_xyz: (new FormData(form).get('hf_hpot') || '').toString(),
        attachments: photos
      };
      lead = payload;

      var origText = btn.textContent;
      btn.disabled = true; btn.textContent = 'Sending...';
      q('fail').style.display = 'none';

      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); })
        .then(function () {
          try {
            if (window.gtag) {
              var ph = (payload.phone || '').replace(/\D/g, '');
              var val = payload.service === 'Paver Sealing' ? 400 : 150;
              gtag('event', 'conversion', { send_to: 'AW-18069179134/4aB2CMbQmrUcEP6Vh6hD', value: val, currency: 'USD', user_data: { email: payload.email || undefined, phone_number: ph.length >= 10 ? '+1' + ph.slice(-10) : undefined, address: { first_name: payload.first || undefined } } });
              gtag('event', 'generate_lead', { lead_source: payload.source || 'Website' });
            }
            if (window.fbq) fbq('track', 'Lead');
          } catch (_) { }
          showBooking();
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = origText;
          q('fail').style.display = 'block';
        });
    });

    function showDone(extraHtml) {
      form.innerHTML = '<div class="kcf-done"><div class="kcf-done-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e2c47a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>' + extraHtml + '</div>';
    }

    function showBooking() {
      if (!days || !days.length) {
        showDone('<div class="kcf-done-h">Got it!</div><div class="kcf-done-p">We typically respond within the hour. Keep an eye on your texts!</div>');
        return;
      }
      form.innerHTML = '<div class="kcf-done"><div class="kcf-done-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e2c47a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
        + '<div class="kcf-done-h">Request received!</div>'
        + '<div class="kcf-done-p">Want to skip the phone tag? Grab a day for your <b>free in-person estimate</b> right now:</div>'
        + '<div class="kcf-days">'
        + days.slice(0, 3).map(function (d, i) {
          var short = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return '<button type="button" class="kcf-day" data-i="' + i + '"><span class="d">' + esc(short) + '</span><span class="t">' + esc(d.time) + '</span></button>';
        }).join('')
        + '</div>'
        + '<button type="button" class="kcf-skip">No thanks, just text me</button>'
        + '<div class="kcf-fail" data-kcf="bfail">That one just got taken. Pick another day or we\'ll text you.</div>'
        + '</div>';
      [].slice.call(form.querySelectorAll('.kcf-day')).forEach(function (b) {
        b.addEventListener('click', function () { book(days[Number(b.getAttribute('data-i'))], b); });
      });
      form.querySelector('.kcf-skip').addEventListener('click', function () {
        showDone('<div class="kcf-done-h">Got it!</div><div class="kcf-done-p">We typically respond within the hour. Keep an eye on your texts!</div>');
      });
    }

    function book(day, btnEl) {
      if (!lead || !day) return;
      [].slice.call(form.querySelectorAll('.kcf-day')).forEach(function (b) { b.disabled = true; });
      btnEl.querySelector('.t').textContent = 'Booking...';
      fetch('/api/estimate-visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first: lead.first, last: lead.last, phone: lead.phone, address: lead.address, service: lead.service, date: day.date, time: day.time })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.ok) {
            try { if (window.gtag) { gtag('event', 'conversion', { send_to: 'AW-18069179134/dCX4CJKEtuscEP6Vh6hD', value: 600.0, currency: 'USD' }); gtag('event', 'book_estimate_visit', { lead_source: cfg.source }); } } catch (_) { }
            showDone('<div class="kcf-done-h">You\'re on the schedule!</div><div class="kcf-done-p"><b>' + esc(res.j.label || (day.label + ' at ' + day.time)) + '</b><br>It\'s locked in. A confirmation text is on its way, and Eric will text when he\'s on the way over.</div>');
          } else if (res.j && res.j.error === 'slot_taken') {
            days = days.filter(function (d) { return d.date !== day.date; });
            fetch('/api/estimate-visit').then(function (r) { return r.ok ? r.json() : null; })
              .then(function (j) { if (j && j.ok && j.days) days = j.days; showBooking(); var bf = form.querySelector('[data-kcf="bfail"]'); if (bf) bf.style.display = 'block'; })
              .catch(function () { showBooking(); });
          } else { throw new Error('fail'); }
        })
        .catch(function () {
          showDone('<div class="kcf-done-h">Got it!</div><div class="kcf-done-p">We could not lock the day automatically, but your request went through. We typically respond within the hour!</div>');
        });
    }

    inst = {
      armOffer: function (name) {
        offer = name || null;
        var box = q('offer');
        if (box && offer) {
          box.style.display = 'flex';
          box.innerHTML = CHECK_SVG + '<span>You\'re claiming <b>' + esc(offer) + '</b></span><button type="button" aria-label="Remove this offer">&times;</button>';
          box.querySelector('button').addEventListener('click', function () { inst.clearOffer(); });
        }
      },
      clearOffer: function () {
        offer = null;
        var box = q('offer'); if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      },
      setExtra: function (lines) { extraLines = Array.isArray(lines) ? lines : []; }
    };
    if (urlOffer) inst.armOffer(urlOffer);
  }

  window.KCForm = {
    armOffer: function (n) { if (inst) inst.armOffer(n); },
    clearOffer: function () { if (inst) inst.clearOffer(); },
    setExtra: function (l) { if (inst) inst.setExtra(l); }
  };

  function init() { [].slice.call(document.querySelectorAll('.kc-form-slot')).forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
