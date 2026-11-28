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
 * Instant gutter price (2026-11-19): Eric's switch in the CRM (GET
 * /api/instant-quote -> share: 0 off, 50 split test, 100 everyone). The first
 * time a visitor has Gutter Cleaning picked, the server deals them a group
 * (?assign=1; in a split test every other visitor), remembered in
 * localStorage kc_iq. Group 'b' posts to /api/instant-quote, sees the price
 * with a brightening add-on, and goes to the CRM quote page to approve and
 * pick a day. Group 'a' gets this form unchanged. ?instant=1 forces the
 * instant flow for a look (tagged 'preview', kept out of the scoreboard).
 *
 * URL params: ?service=Paver%20Sealing preselects the dropdown,
 *             ?src=paver-sealing tags the lead source with the page it came from,
 *             ?offer=... arms an offer banner (from the deal cards).
 */
(function () {
  'use strict';

  var SERVICES = ['House Washing', 'Roof Cleaning', 'Driveway or Walkway', 'Patio or Pool Deck',
    'Deck or Fence', 'Paver Sealing', 'Oxidation Removal', 'Gutter Cleaning', 'Gutter Brightening', 'Something Else'];

  var CSS = '.kcf{background:rgba(13,30,53,.72);-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:26px 22px 18px;box-shadow:0 28px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.09);width:100%;color:#fff;font-family:"Source Sans 3",sans-serif;text-align:left}'
    + '.kcf-title{font-family:"Montserrat",sans-serif;font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#e2c47a;margin:0 0 4px;line-height:1.2;text-align:center}'
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
    + '.kcf-cta{width:100%;background:#c9a84c;color:#0d1e35;border:none;border-radius:10px;padding:15px;font-family:"Montserrat",sans-serif;font-size:13.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;margin-top:6px;transition:background .15s,transform .15s}'
    + '.kcf-cta:hover{background:#e2c47a;transform:translateY(-1px)}.kcf-cta:disabled{opacity:.7;cursor:default;transform:none}'
    + '.kcf-foot{margin-top:10px;text-align:center;font-size:12px;color:rgba(255,255,255,.6)}'
    + '.kcf-fail{display:none;margin-top:9px;text-align:center;font-size:13px;color:#ff9d8f}.kcf-fail a{color:#e2c47a;font-weight:700;text-decoration:none}'
    + '.kcf-callrow{display:flex;gap:8px;margin-top:11px}'
    + '.kcf-callrow a{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.45);color:#e2c47a;font-family:"Montserrat",sans-serif;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;padding:11px 10px;border-radius:8px}'
    + '.kcf-offer{display:none;align-items:center;gap:8px;background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.5);border-radius:8px;padding:8px 11px;font-size:12.5px;color:#e2c47a;margin-bottom:12px;line-height:1.35}.kcf-offer svg{width:14px;height:14px;flex-shrink:0}.kcf-offer b{font-weight:700}.kcf-offer button{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;padding:0 2px;line-height:1}'
    + '.kcf-done{text-align:center;padding:10px 2px 6px}'
    + '.kcf-done-ico{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:50%;background:rgba(201,168,76,.18);border:2px solid #c9a84c;margin-bottom:12px}'
    + '.kcf-done-h{font-family:"Montserrat",sans-serif;font-size:19px;font-weight:700;text-transform:uppercase;color:#e2c47a;margin-bottom:5px}'
    + '.kcf-done-p{font-size:14px;color:rgba(255,255,255,.72);line-height:1.55}'
    + '.kcf-days{display:grid;gap:8px;margin:16px 0 4px}'
    + '.kcf-day{display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:13px 15px;cursor:pointer;color:#fff;width:100%;font-family:"Source Sans 3",sans-serif;transition:all .15s;text-align:left}'
    + '.kcf-day:hover{border-color:#c9a84c;background:rgba(201,168,76,.12)}.kcf-day:disabled{opacity:.6;cursor:default}'
    + '.kcf-day .d{font-weight:700;font-size:14.5px}.kcf-day .t{font-family:"Montserrat",sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#e2c47a;white-space:nowrap}'
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
    + '.kcf-price{font-family:"Montserrat",sans-serif;font-size:46px;font-weight:700;color:#fff;line-height:1.05;margin:6px 0 2px}'
    + '.kcf-price-sub{font-size:13px;color:rgba(255,255,255,.62);line-height:1.45;margin-bottom:14px}'
    + '.kcf-addon{display:flex;align-items:center;gap:11px;width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:13px 14px;cursor:pointer;color:#fff;font-family:"Source Sans 3",sans-serif;text-align:left;transition:all .15s;margin-bottom:12px}'
    + '.kcf-addon:hover{border-color:#c9a84c}.kcf-addon.on{border-color:#c9a84c;background:rgba(201,168,76,.14)}'
    + '.kcf-addon .bx{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:2px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;color:#0d1e35}'
    + '.kcf-addon.on .bx{background:#c9a84c;border-color:#c9a84c}.kcf-addon .bx svg{width:14px;height:14px;display:none}.kcf-addon.on .bx svg{display:block}'
    + '.kcf-addon .nm{flex:1;font-size:14.5px;font-weight:700;line-height:1.3}.kcf-addon .nm small{display:block;font-weight:400;font-size:12.5px;color:rgba(255,255,255,.6)}'
    + '.kcf-addon .pr{font-family:"Montserrat",sans-serif;font-size:13px;font-weight:700;color:#e2c47a;white-space:nowrap}'
    + '.kcf-ba{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 9px}'
    + '.kcf-ba figure{position:relative;margin:0;border-radius:9px;overflow:hidden;border:1px solid rgba(255,255,255,.16);aspect-ratio:1018/704;background:rgba(255,255,255,.05)}'
    + '.kcf-ba img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.kcf-ba figcaption{position:absolute;left:7px;top:7px;font-family:"Montserrat",sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;border-radius:5px;background:rgba(13,30,53,.82);color:#fff}'
    + '.kcf-ba figure+figure figcaption{background:#c9a84c;color:#0d1e35}'
    + '.kcf-pitch{font-size:13.5px;color:rgba(255,255,255,.8);line-height:1.5;margin:0 0 10px;text-align:left}.kcf-pitch b{color:#e2c47a;font-weight:700}'
    + '.kcf-brbox{border:1px solid rgba(201,168,76,.32);border-radius:12px;padding:11px 11px 1px;margin:0 0 12px;background:rgba(201,168,76,.05)}.kcf-brbox .kcf-addon{margin-bottom:10px}'
    + '.kcf-iqtip{align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:12px;border:1px solid rgba(201,168,76,.55);background:rgba(201,168,76,.12);color:#fff;text-decoration:none;font-family:"Source Sans 3",sans-serif;font-size:13px;line-height:1.3;transition:background .15s}'
    + '.kcf-iqtip:hover{background:rgba(201,168,76,.2)}.kcf-iqtip b{display:block;font-size:14.5px}.kcf-iqtip i{font-style:normal;font-family:"Montserrat",sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0d1e35;background:#c9a84c;border-radius:8px;padding:9px 11px;white-space:nowrap}'
    + '.kcf-fine{font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;margin-top:10px}'
    + '@media(max-width:640px){.kcf{padding:20px 16px 14px}.kcf-title{font-size:16px}.kcf-price{font-size:40px}}';

  var PHONE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.5 2.18 2 2 0 012.49.5h3a2 2 0 012 1.72c.12.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.91 8.1a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0122 16.92z"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Gutter brightening: the same photos and the same words on both sides of
  // the split test, so the only difference between them is the instant price.
  var BRIGHT_PITCH = '<div class="kcf-ba">'
    + '<figure><img src="/images/ba-gutter-before.webp" alt="Gutter covered in dark streaks before brightening" loading="lazy" width="1018" height="704"><figcaption>Before</figcaption></figure>'
    + '<figure><img src="/images/ba-gutter-after.webp" alt="The same gutter bright white after brightening" loading="lazy" width="1018" height="704"><figcaption>After</figcaption></figure></div>'
    + '<div class="kcf-pitch">Those black streaks are <b>years of asphalt shingle runoff</b>. A specialized cleaner takes the staining off your gutters and brings them back to their former white glory.</div>';
  function addonBtn(key, title, sub, right) {
    return '<button type="button" class="kcf-addon" data-kcf="' + key + '" aria-pressed="false"><span class="bx">' + CHECK_SVG + '</span><span class="nm">' + title + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (right ? '<span class="pr">' + right + '</span>' : '') + '</button>';
  }

  var inst = null;

  function mount(slot) {
    var cfg;
    try { cfg = JSON.parse(slot.getAttribute('data-kc') || '{}'); } catch (e) { cfg = {}; }
    cfg.title = cfg.title || 'Get Your Free Estimate';
    cfg.kicker = cfg.kicker || 'Takes about 20 seconds';
    cfg.submitLabel = cfg.submitLabel || 'Get Free Estimate';
    cfg.source = cfg.source || 'Quote Page';

    if (!document.getElementById('kcf-css')) {
      var st = document.createElement('style'); st.id = 'kcf-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    var params = new URLSearchParams(location.search);
    var preService = params.get('service') || '';
    // Water Treatment is only offered to visitors arriving from /water-treatment (not in the everyday list).
    if (preService === 'Water Treatment' && SERVICES.indexOf(preService) < 0) SERVICES.splice(SERVICES.length - 1, 0, preService);
    var srcPage = (params.get('src') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    var urlOffer = (params.get('offer') || '').slice(0, 240);

    slot.innerHTML = '<form class="kcf" novalidate autocomplete="on">'
      + '<div class="kcf-title" data-kcf="title">' + esc(cfg.title) + '</div>'
      + '<div class="kcf-kicker" data-kcf="kicker">' + esc(cfg.kicker) + '</div>'
      + '<div class="kcf-offer" data-kcf="offer"></div>'
      + '<div style="display:none" aria-hidden="true"><label>Leave empty<input type="text" name="hf_hpot" tabindex="-1" autocomplete="off" value=""></label></div>'
      + (cfg.service ? '<input type="hidden" data-kcf="service" value="' + esc(cfg.service) + '">' : '<div class="kcf-field kcf-selwrap"><input type="hidden" data-kcf="service" value="' + esc(SERVICES.indexOf(preService) > -1 ? preService : '') + '">'
      + '<button type="button" class="kcf-dd' + (SERVICES.indexOf(preService) > -1 ? '' : ' kcf-empty') + '" data-kcf="ddbtn" aria-haspopup="listbox" aria-label="What do you need done?"><span>' + esc(SERVICES.indexOf(preService) > -1 ? preService : 'What do you need done?') + '</span></button>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      + '<div class="kcf-ddpanel" data-kcf="ddpanel" role="listbox">' + SERVICES.map(function (s) { return '<button type="button" role="option" data-v="' + esc(s) + '"' + (s === preService ? ' class="sel"' : '') + '>' + esc(s) + '</button>'; }).join('') + '</div></div>')
      + '<div class="kcf-field" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input type="text" data-kcf="name" placeholder="First name" autocomplete="given-name" aria-label="First name"><input type="text" data-kcf="lname" placeholder="Last name" autocomplete="family-name" aria-label="Last name"></div>'
      + '<div class="kcf-field"><input type="tel" data-kcf="phone" placeholder="Phone number" autocomplete="tel" inputmode="tel" aria-label="Phone number"></div>'
      + '<div class="kcf-field"><input type="email" data-kcf="email" placeholder="Email (optional)" autocomplete="email" aria-label="Email"></div>'
      + '<div class="kcf-field" style="position:relative"><input type="text" data-kcf="address" placeholder="Street address" autocomplete="off" aria-label="Street address"><div class="kcf-sug" data-kcf="asug"></div></div>'
      + '<div class="kcf-field"><input type="text" data-kcf="town" placeholder="Town" autocomplete="address-level2" aria-label="Town"></div>'
      + '<div class="kcf-field"><textarea data-kcf="note" rows="2" placeholder="Anything we should know? (optional)" aria-label="Optional message"></textarea></div>'
      + (cfg.photos ? '<div class="kcf-field"><label class="kcf-file"><input type="file" data-kcf="files" accept="image/*" multiple style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>Add photos of the project (optional)</label><div class="kcf-files" data-kcf="filelist"></div></div>' : '')
      + '<a class="kcf-iqtip" data-kcf="iqtip" href="/gutter-price" style="display:none"><span><b>Want your price right now?</b>See it in seconds, no visit needed</span><i>Instant price &rarr;</i></a>'
      + '<div class="kcf-brbox" data-kcf="brbox" style="display:none">' + BRIGHT_PITCH + addonBtn('brwant', 'Add gutter brightening to my quote', 'One visit, both done') + '</div>'
      + '<div class="kcf-field" data-kcf="gdbox" style="display:none">' + addonBtn('gdwant', 'My gutters have gutter guards', 'Good for me to know ahead of time') + '</div>'
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
        iqPicked = true; iqSync(); iqDeal();
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

    // Instant gutter price split test. iqGroup: '' (test off), 'a' (this form
    // as is), 'b' (instant price) or 'preview' (?instant=1).
    var iqGroup = params.get('instant') === '1' ? 'preview' : '';
    var iqPicked = false;   // true once the visitor picks a service from the list themselves
    function iqOn() { return (iqGroup === 'b' || iqGroup === 'preview') && q('service').value === 'Gutter Cleaning'; }
    var wantBright = false;
    function iqSync() {
      var on = iqOn(), b = q('submit');
      if (!b || b.disabled) return;
      // The instant price is its own page (/gutter-price, 2026-11-19): a visitor
      // who is getting it is sent there, keeping the ad tags on the address.
      var keep = new URLSearchParams(location.search); keep.delete('service');
      if (iqGroup !== 'preview') keep.delete('instant');
      var qs = keep.toString(), dest = '/gutter-price' + (qs ? '?' + qs : '');
      // Arrived with Gutter Cleaning already picked (an ad or a site button): straight to the price page.
      if (on && !iqPicked) { location.replace(dest); return; }
      // Picked Gutter Cleaning here themselves (Eric, 2026-11-19: "it should allow u to fill it out"):
      // the form stays a normal form, with one line offering the instant price.
      var tip = q('iqtip');
      tip.style.display = on ? 'flex' : 'none'; tip.setAttribute('href', dest);
      // Gutter cleaning visitors can ask for brightening on this form too.
      q('brbox').style.display = q('service').value === 'Gutter Cleaning' ? 'block' : 'none';
      q('gdbox').style.display = /^Gutter/.test(q('service').value) ? 'block' : 'none';
    }
    // iqShare: null until the switch is known, then 0 / 50 / 100.
    var iqShare = null, iqAsking = false;
    function iqDeal() {
      if (iqGroup || iqAsking || !(iqShare > 0) || q('service').value !== 'Gutter Cleaning') return;
      var g = '';
      try { g = localStorage.getItem('kc_iq') || ''; } catch (_) { }
      if (iqShare >= 100) g = 'b';
      if (g === 'a' || g === 'b') { iqGroup = g; iqSync(); return; }
      iqAsking = true;
      fetch('/api/instant-quote?assign=1').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          iqAsking = false;
          if (!j || (j.group !== 'a' && j.group !== 'b') || iqGroup) return;
          iqGroup = j.group;
          try { localStorage.setItem('kc_iq', iqGroup); } catch (_) { }
          iqSync();
        })
        .catch(function () { iqAsking = false; });
    }
    var hasGuards = false;
    q('gdwant').addEventListener('click', function () {
      hasGuards = !hasGuards;
      q('gdwant').classList.toggle('on', hasGuards); q('gdwant').setAttribute('aria-pressed', hasGuards ? 'true' : 'false');
    });
    q('brwant').addEventListener('click', function () {
      wantBright = !wantBright;
      q('brwant').classList.toggle('on', wantBright); q('brwant').setAttribute('aria-pressed', wantBright ? 'true' : 'false');
    });
    iqSync();
    if (!iqGroup) {
      fetch('/api/instant-quote').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { iqShare = j && j.ok ? Number(j.share) || 0 : 0; iqDeal(); })
        .catch(function () { });
    }

    // The 10 digits of a dialable US number, or '' when it is not one. A
    // leading country-code 1 is dropped when 11 digits were typed; area code
    // and exchange must start with 2-9 (so "150-852-3468" is not accepted).
    function usDigits(v) {
      var d = (v || '').replace(/\D/g, '');
      if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : '';
    }
    var phoneEl = q('phone');
    phoneEl.addEventListener('input', function () {
      var d = phoneEl.value.replace(/\D/g, ''), out;
      if (d.length > 10 && d.charAt(0) === '1') d = d.slice(1);
      d = d.slice(0, 10); out = d;
      if (d.length > 6) out = d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
      else if (d.length > 3) out = d.slice(0, 3) + '-' + d.slice(3);
      phoneEl.value = out; phoneEl.classList.remove('kcf-err');
    });
    ['name', 'lname', 'email', 'town', 'note'].forEach(function (id) {
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
              var town = p.city || p.town || p.village || p.district || '';
              return { label: [street, town, p.state, p.postcode].filter(Boolean).join(', '), town: town };
            }).filter(function (x, i, a) {
              return x.label && a.map(function (y) { return y.label; }).indexOf(x.label) === i;
            }).slice(0, 4);
            if (!items.length || document.activeElement !== aEl) { sug.style.display = 'none'; return; }
            sug.innerHTML = items.map(function (t) { return '<button type="button" data-town="' + esc(t.town) + '">' + esc(t.label) + '</button>'; }).join('');
            sug.style.display = 'block';
            [].slice.call(sug.querySelectorAll('button')).forEach(function (b) {
              b.addEventListener('mousedown', function (ev) { ev.preventDefault();
                aEl.value = b.textContent; sug.style.display = 'none';
                // Picking a suggestion fills the town too.
                if (b.getAttribute('data-town')) { q('town').value = b.getAttribute('data-town'); q('town').classList.remove('kcf-err'); }
              });
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
      var town = (q('town').value || '').trim();
      var note = (q('note').value || '').trim();

      var bad = null;
      if (!svc && ddBtn) { ddBtn.classList.add('kcf-err'); bad = bad || ddBtn; }
      if (!first) { q('name').classList.add('kcf-err'); bad = bad || q('name'); }
      if (!usDigits(phone)) { phoneEl.classList.add('kcf-err'); bad = bad || phoneEl; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { q('email').classList.add('kcf-err'); bad = bad || q('email'); }
      if (!address) { q('address').classList.add('kcf-err'); bad = bad || q('address'); }
      if (!town) { q('town').classList.add('kcf-err'); bad = bad || q('town'); }
      if (bad) { bad.focus(); return; }

      // A street typed without tapping a suggestion has no town in it; the
      // town field guarantees the address we save always carries one.
      var afterStreet = address.indexOf(',') > -1 ? address.slice(address.indexOf(',') + 1).toLowerCase() : '';
      if (afterStreet.indexOf(town.toLowerCase()) === -1) address += ', ' + town;

      var lines = ['Quote page request:', '- Looking for: ' + svc, '- Address: ' + address];
      if (note) lines.push('- Note: ' + note);
      if (offer) lines.push('- Offer: ' + offer);
      if (wantBright && svc === 'Gutter Cleaning' && !iqOn()) lines.push('- Also wants a price for: Gutter Brightening');
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
        attachments: photos,
        // One id per submission: if the instant request is lost after the server
        // saved it and the form falls back to /api/lead, the server sees the
        // same id and does not make a second lead or send a second set of texts.
        sid: Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
      };
      lead = payload;
      // Split test: stamp the normal-form group so the CRM can compare.
      if (iqGroup === 'a' && svc === 'Gutter Cleaning') payload.iq = 'a';

      var origText = btn.textContent;
      // Gutter work is priced without a visit (2026-11-28). Gutter cleaning sent
      // from this form is priced by the server like /gutter-price and the real
      // quote opens; a house that cannot be priced gets a text from Eric instead.
      // Guards do not change the price, they are noted on the lead. No gutter lead is offered the estimate booking step.
      var gutter = /^Gutter/.test(svc);
      if (gutter && hasGuards) payload.guards = true;
      if (svc === 'Gutter Cleaning' && wantBright) payload.bright = true;
      var instant = iqOn();
      btn.disabled = true; btn.textContent = instant ? 'Working out your price...' : 'Sending...';
      q('fail').style.display = 'none';

      var post = function (url, body) {
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); });
      };
      // The "?via=/api/lead" tail is what makes the page's attribution script
      // (it watches for /api/lead in the address) attach the ad click ids here too.
      // If the instant endpoint fails for any reason the lead still goes in the normal way.
      var send = instant
        ? post('/api/instant-quote?via=/api/lead', Object.assign({ action: 'quote', variant: iqGroup }, payload))
          .catch(function () { return post('/api/lead', payload); })
        : post('/api/lead', payload);

      send
        .then(function (res) {
          try {
            if (window.gtag) {
              var ph = (payload.phone || '').replace(/\D/g, '');
              var val = (payload.service === 'Paver Sealing' || payload.service === 'Water Treatment') ? 400 : 150;
              gtag('event', 'conversion', { send_to: 'AW-18069179134/4aB2CMbQmrUcEP6Vh6hD', value: val, currency: 'USD', user_data: { email: payload.email || undefined, phone_number: ph.length >= 10 ? '+1' + ph.slice(-10) : undefined, address: { first_name: payload.first || undefined } } });
              gtag('event', 'generate_lead', { lead_source: payload.source || 'Website' });
            }
            if (window.fbq) fbq('track', 'Lead');
          } catch (_) { }
          if (res && res.instant && res.url) { location.href = res.url; return; }
          if (gutter) showDone('<div class="kcf-done-h">Got it!</div><div class="kcf-done-p">' + 'I am putting your price together now. Watch for a text from me shortly.' + '</div>');
          else showBooking();
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = origText;
          q('fail').style.display = 'block';
        });
    });

    function showDone(extraHtml) {
      form.innerHTML = '<div class="kcf-done"><div class="kcf-done-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e2c47a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>' + extraHtml + '</div>';
    }

    // Instant price: the number, the brightening add-on, then off to the
    // normal quote page to approve it and pick a day.
    function showPrice(res) {
      var clean = Number(res.clean) || 0, bright = Number(res.bright) || 0, withBright = false, savedBright = false;
      var usd = function (n) { return '$' + Number(n).toLocaleString('en-US'); };
      try { if (window.gtag) gtag('event', 'instant_quote_shown', { value: clean, currency: 'USD' }); } catch (_) { }
      form.innerHTML = '<div class="kcf-done">'
        + '<div class="kcf-done-h">Your gutter cleaning price</div>'
        + '<div class="kcf-price" data-kcf="ptotal">' + usd(clean) + '</div>'
        + '<div class="kcf-price-sub">' + esc(lead.address) + '<br>Gutters cleared out and downspouts checked. No deposit.</div>'
        + (bright > 0 ? '<div class="kcf-brbox">' + BRIGHT_PITCH + addonBtn('addon', 'Add gutter brightening', 'Same visit', '+ ' + usd(bright)) + '</div>' : '')
        + '<button type="button" class="kcf-cta" data-kcf="accept">Review and Approve</button>'
        + '<div data-kcf="pfail" style="display:none;color:#b42318;font-size:14px;margin-top:8px">That did not save. Tap again, or call (978) 351-2195.</div>'
        + '<div class="kcf-fine">Next you approve the quote, then I will text you to set the day. Price is for a single family home with gutters in normal condition.</div>'
        + '<button type="button" class="kcf-skip" data-kcf="later">Not ready yet, text me the quote</button>'
        + '</div>';
      var addon = q('addon'), go = q('accept');
      if (addon) addon.addEventListener('click', function () {
        withBright = !withBright;
        addon.classList.toggle('on', withBright); addon.setAttribute('aria-pressed', withBright ? 'true' : 'false');
        q('ptotal').textContent = usd(clean + (withBright ? bright : 0));
      });
      go.addEventListener('click', function () {
        if (go.disabled) return;
        go.disabled = true; go.textContent = 'Opening your quote...';
        try { if (window.gtag) gtag('event', 'instant_quote_continue', { value: clean + (withBright ? bright : 0), currency: 'USD' }); } catch (_) { }
        var open = function () { location.href = res.url; };
        // The quote starts as cleaning only; the brightening choice is saved on
        // it before they see it, and the save is checked: an unsaved add-on
        // opened a cheaper quote than the price on this screen.
        if (withBright === savedBright) { open(); return; }
        var want = withBright, tries = 0;
        var save = function () {
          tries++;
          fetch('/api/instant-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addon', token: res.token, bright: want }) })
            .then(function (r) {
              if (r.ok) { savedBright = want; open(); return; }
              if (r.status === 409 || r.status === 404) { open(); return; }   // already answered: show them the quote as it stands
              throw new Error('fail');
            })
            .catch(function () {
              if (tries < 3) { setTimeout(save, 600); return; }
              go.disabled = false; go.textContent = 'Try again';
              var f = q('pfail'); if (f) f.style.display = 'block';
            });
        };
        save();
      });
      // Coming back from the quote page (iPhone keeps this screen as it was): the button works again.
      window.addEventListener('pageshow', function (ev) {
        if (ev.persisted && go) { go.disabled = false; go.textContent = 'Review and Approve'; }
      });
      q('later').addEventListener('click', function () {
        showDone('<div class="kcf-done-h">Got it!</div><div class="kcf-done-p">Your quote is on its way by text. Open it whenever you are ready.</div>');
      });
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
