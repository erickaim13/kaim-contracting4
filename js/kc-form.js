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
    var urlOffer = (params.get('offer') || '').slice(0, 120);

    slot.innerHTML = '<form class="kcf" novalidate autocomplete="on">'
      + '<div class="kcf-title">' + esc(cfg.title) + '</div>'
      + '<div class="kcf-kicker">' + esc(cfg.kicker) + '</div>'
      + '<div class="kcf-offer" data-kcf="offer"></div>'
      + '<div style="display:none" aria-hidden="true"><label>Leave empty<input type="text" name="hf_hpot" tabindex="-1" autocomplete="off" value=""></label></div>'
      + '<div class="kcf-field"><div class="kcf-selwrap"><select data-kcf="service" aria-label="What do you need done?" class="kcf-empty">'
      + '<option value="" disabled selected>What do you need done?</option>'
      + SERVICES.map(function (s) { return '<option' + (s === preService ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('')
      + '</select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div></div>'
      + '<div class="kcf-field"><input type="text" data-kcf="name" placeholder="Your name" autocomplete="name" aria-label="Your name"></div>'
      + '<div class="kcf-field"><input type="tel" data-kcf="phone" placeholder="Phone number" autocomplete="tel" inputmode="tel" aria-label="Phone number"></div>'
      + '<div class="kcf-field"><input type="email" data-kcf="email" placeholder="Email (optional)" autocomplete="email" aria-label="Email"></div>'
      + '<div class="kcf-field"><input type="text" data-kcf="address" placeholder="Property address" autocomplete="street-address" aria-label="Property address"></div>'
      + '<div class="kcf-field"><textarea data-kcf="note" rows="2" placeholder="Anything we should know? (optional)" aria-label="Optional message"></textarea></div>'
      + '<button type="submit" class="kcf-cta" data-kcf="submit">' + esc(cfg.submitLabel) + '</button>'
      + '<div class="kcf-fail" data-kcf="fail">Could not send. Please try again or <a href="tel:978-351-2195">call 978-351-2195</a>.</div>'
      + '<div class="kcf-foot">We typically respond within the hour. No spam, ever.</div>'
      + '<div class="kcf-callrow"><a href="tel:978-351-2195">' + PHONE_SVG + 'Call 978-351-2195</a></div>'
      + '</form>';

    var form = slot.querySelector('form');
    function q(sel) { return form.querySelector('[data-kcf="' + sel + '"]'); }
    var offer = null;

    if (preService && SERVICES.indexOf(preService) > -1) q('service').classList.remove('kcf-empty');
    q('service').addEventListener('change', function () {
      q('service').classList.remove('kcf-err');
      q('service').classList.toggle('kcf-empty', !q('service').value);
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
    ['name', 'email', 'address', 'note'].forEach(function (id) {
      q(id).addEventListener('input', function () { q(id).classList.remove('kcf-err'); });
    });

    var lead = null;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = q('submit');
      if (btn.disabled) return;
      var svc = q('service').value;
      var name = (q('name').value || '').trim();
      var phone = phoneEl.value || '';
      var email = (q('email').value || '').trim();
      var address = (q('address').value || '').trim();
      var note = (q('note').value || '').trim();

      var bad = null;
      if (!svc) { q('service').classList.add('kcf-err'); bad = bad || q('service'); }
      if (!name) { q('name').classList.add('kcf-err'); bad = bad || q('name'); }
      if (phone.replace(/\D/g, '').length < 10) { phoneEl.classList.add('kcf-err'); bad = bad || phoneEl; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { q('email').classList.add('kcf-err'); bad = bad || q('email'); }
      if (!address) { q('address').classList.add('kcf-err'); bad = bad || q('address'); }
      if (bad) { bad.focus(); return; }

      var parts = name.split(/\s+/);
      var lines = ['Quote page request:', '- Looking for: ' + svc, '- Address: ' + address];
      if (note) lines.push('- Note: ' + note);
      if (offer) lines.push('- Offer: ' + offer);

      var source = cfg.source + (srcPage ? ' (from ' + srcPage + ')' : '');
      if (offer) source += ' | Offer: ' + offer;

      var payload = {
        first: parts.shift() || '',
        last: parts.join(' ') || '(not provided)',
        phone: phone, email: email, address: address,
        service: svc === 'Paver Sealing' ? 'Paver Sealing' : 'Pressure Washing',
        message: lines.join('\n'),
        contactPref: 'Phone Call',
        source: source,
        kc_hpot_xyz: (new FormData(form).get('hf_hpot') || '').toString(),
        attachments: []
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
            try { if (window.gtag) gtag('event', 'book_estimate_visit', { lead_source: cfg.source }); } catch (_) { }
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
      }
    };
    if (urlOffer) inst.armOffer(urlOffer);
  }

  window.KCForm = {
    armOffer: function (n) { if (inst) inst.armOffer(n); },
    clearOffer: function () { if (inst) inst.clearOffer(); }
  };

  function init() { [].slice.call(document.querySelectorAll('.kc-form-slot')).forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
