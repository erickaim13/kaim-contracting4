// Instant gutter cleaning quote (a split test against the normal quote form).
//
// GET  -> { ok, share }: Eric's switch in the CRM (Lead Sources page):
//         0 = off, 50 = split test, 100 = everyone gets the instant price.
// GET ?assign=1 -> also { group }: 'b' (instant price) or 'a' (normal form)
//         for a visitor who has none yet. In a split test it is every other
//         visitor, counted by the Postgres sequence behind iq_next().
// POST { action: 'quote', ...the normal lead fields, variant }
//      -> saves the lead exactly like /api/lead, looks the house up on the
//         town record, and when it can be priced also saves a real CRM quote
//         (status sent) and answers { instant:true, clean, bright, token, url }.
//         When it cannot be priced the lead is still saved the normal way and
//         the answer is { instant:false }, so the form carries on as usual.
// POST { action: 'lookup', address } -> what the town record says about the
//         house ({ found, sqft, stories, style, year, lat, lng }) for the
//         "finding your home" step on /gutter-price. Never returns a price:
//         the price only comes back with a name and phone ('quote').
// POST { action: 'addon', token, bright } -> adds or removes the gutter
//         brightening line on that quote before the visitor accepts it.
//
// Accepting happens on the CRM's own quote page (url), so the approval, the
// signed name and the terms are the same record as any other quote. Picking
// the job day happens there too (kaim-crm api/portal.js instant_days / instant_book).

import { randomBytes } from 'node:crypto';
import { intakeLead, sbAdmin, sanitize, usPhoneDigits, sendQuoteEmail } from './_lib/intake.js';
import { iqConfig, priceFor, whyNoPrice, lookupHouse, buildEstimate, applyItems } from './_lib/instant.js';

const ALLOWED_ORIGINS = new Set([
  'https://kaimcontracting.com',
  'https://www.kaimcontracting.com'
]);

// Same stopgap limiter as api/estimate-visit.js: per warm instance only.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 6;
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  for (const [k, stamps] of hits) {
    const live = stamps.filter(t => now - t < WINDOW_MS);
    if (live.length) hits.set(k, live); else hits.delete(k);
  }
  const mine = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (mine.length >= MAX_HITS) return true;
  mine.push(now);
  hits.set(ip, mine);
  return false;
}

const money = n => '$' + Number(n || 0).toLocaleString('en-US');

function quoteUrl(settings, token) {
  let b = String((settings && settings.publicBase) || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(b)) b = 'https://kaimcontractingapp.com';
  return b + '/?approve=' + token;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const okOrigin = ALLOWED_ORIGINS.has(origin) ||
    [...ALLOWED_ORIGINS].some(o => referer.startsWith(o + '/'));

  if (okOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'https://kaimcontracting.com');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!okOrigin) return res.status(403).json({ error: 'Forbidden' });

  try {
    if (req.method === 'GET') return await getShare(res, String(req.query?.assign || '') === '1');
    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'addon') return await setAddon(body, res);
      if (body.action === 'lookup') return await lookupOnly(req, body, res);
      return await makeQuote(req, body, res);
    }
  } catch (e) {
    console.error('[instant-quote] Error:', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getShare(res, assign) {
  // Only the price settings are read, not the whole CRM row.
  const { data, error } = await sbAdmin.from('crm_data').select('pq:data->settings->pq').eq('id', 1).single();
  if (error) throw error;
  const share = iqConfig({ pq: data?.pq || {} }).iqShare;
  const out = { ok: true, share };
  if (assign && share > 0) {
    if (share >= 100) out.group = 'b';
    else {
      // Every other visitor. If the counter cannot be read, a coin flip.
      let n = null;
      try { const r = await sbAdmin.rpc('iq_next'); if (!r.error) n = Number(r.data); } catch (_) { }
      out.group = Number.isFinite(n) ? (n % 2 === 1 ? 'b' : 'a') : (Math.random() < 0.5 ? 'b' : 'a');
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
}

// The house facts for the loading screen. Its own, looser limit: a visitor
// may fix a typo a few times before the form is ever sent.
const lookHits = new Map();
async function lookupOnly(req, body, res) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const mine = (lookHits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (mine.length >= 25) return res.status(429).json({ error: 'Too many requests' });
  mine.push(now); lookHits.set(ip, mine);
  if (lookHits.size > 5000) lookHits.clear();

  const address = sanitize(body.address, 160);
  const [house, pqRow] = await Promise.all([
    lookupHouse(address),
    sbAdmin.from('crm_data').select('pq:data->settings->pq').eq('id', 1).single().then(r => r.data, () => null)
  ]);
  const cfg = iqConfig({ pq: pqRow?.pq || {} });
  const price = house.ok ? priceFor(house, cfg) : null;
  res.setHeader('Cache-Control', 'no-store');
  // why: the reason code only (no_record, not_single_family, no_laser...), handy when checking an address
  if (!price) return res.status(200).json({ ok: true, found: false, why: house.ok ? whyNoPrice(house, cfg) : house.why });
  return res.status(200).json({
    ok: true, found: true, sqft: house.sqft, stories: house.stories,
    style: house.style, year: house.year, addr: house.addr, city: house.city, laser: !!house.laser,
    lat: house.lotLat || house.lat, lng: house.lotLng || house.lng
  });
}

async function makeQuote(req, body, res) {
  if (body.kc_hpot_xyz) return res.status(200).json({ ok: true, instant: false }); // honeypot
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many requests' });

  const first = sanitize(body.first, 60);
  const last = sanitize(body.last, 60);
  const phoneDigits = usPhoneDigits(sanitize(body.phone, 30));
  const phone = phoneDigits ? phoneDigits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : '';
  const email = sanitize(body.email, 120);
  const address = sanitize(body.address, 160);
  // "Do your gutters have gutter guards?" answered yes. Same price (Eric,
  // 2026-11-28: leaves still build up on guards and he cleans those too); it is
  // noted on the lead and in his new-lead text so he knows before he shows up.
  const guards = body.guards === true;
  const message = sanitize(body.message, 2000) + (guards ? '\n- Has gutter guards' : '');
  const leadSource = sanitize(body.source, 120) || 'Website (kaimcontracting.com)';
  // 'preview' = opened with ?instant=1 (Eric looking at it); kept out of the scoreboard.
  const variant = body.variant === 'preview' ? 'preview' : 'b';
  // Ticked "Add gutter brightening to my quote" on /gutter-price: the quote opens with both lines.
  const wantBright = body.bright === true;

  if (!first) return res.status(400).json({ error: 'Name required' });
  if (!phone) return res.status(400).json({ error: 'Invalid phone' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });

  const rawAttr = (body.attribution && typeof body.attribution === 'object') ? body.attribution : {};
  const attribution = {};
  for (const k of ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing']) {
    const v = sanitize(rawAttr[k], (k === 'fbclid' || k === 'fbc') ? 600 : 200);
    if (v) attribution[k] = v;
  }
  if (Number.isFinite(rawAttr.captured)) attribution.captured = rawAttr.captured;

  // Photos, checked the same way as api/lead.js. (They were dropped here, so
  // an instant-price visitor's photos never reached the CRM.)
  let attachTotal = 0;
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5).map(a => {
    const data = typeof a?.data === 'string'
      && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(a.data)
      && a.data.length < 2_500_000 ? a.data : null;
    return { name: sanitize(a?.name, 80).replace(/["'<>`=]/g, ''), data };
  }).filter(a => {
    if (!a.data) return false;
    attachTotal += a.data.length;
    return attachTotal < 6_000_000;
  }) : [];

  // The house lookup and Eric's numbers are read side by side; the price is
  // settled before the lead is saved so the right texts go out with it.
  const [house, pqRow] = await Promise.all([
    lookupHouse(address),
    sbAdmin.from('crm_data').select('pq:data->settings->pq').eq('id', 1).single().then(r => r.data, () => null)
  ]);
  const cfg = iqConfig({ pq: pqRow?.pq || {} });
  const price = house.ok ? priceFor(house, cfg) : null;
  const token = randomBytes(20).toString('hex');
  let quoted = null;   // { clean, bright, url } once the quote is in the CRM

  const out = await intakeLead({
    first, last, phone, email, address, service: 'Gutter Cleaning', message,
    contactPref: 'Phone Call', leadSource, attachments,
    webKey: /^[a-z0-9]{8,40}$/.test(String(body.sid || '')) ? String(body.sid) : null,
    attribution: Object.keys(attribution).length ? attribution : null,
    // A priced lead gets its quote on screen, not "what day works for an estimate".
    autoReply: !price,
    confirmationEmail: !price,
    onDb: (db, client, now) => {
      quoted = null;   // the save loop can run more than once
      if (!price) {
        client.iq = { v: variant, priced: false, why: house.ok ? whyNoPrice(house, cfg) : house.why, at: now.toISOString() };
        return;
      }
      if (db._ne == null) db._ne = 1001;
      const est = buildEstimate(db, client, house, price, variant, token, now);
      if (wantBright && price.bright > 0) applyItems(est, true);
      db.estimates.unshift(est);
      client.status = 'estimate';
      client.statusAt = now.toISOString();
      client.val = est.total;
      client.iq = { v: variant, priced: true, at: now.toISOString(), sqft: house.sqft, stories: house.stories, clean: price.clean, bright: price.bright, estId: est.id, ...(price.travel ? { travel: price.travel, miles: price.miles } : {}), ...(house.laser ? { laser: true } : {}), ...(guards ? { guards: true } : {}) };
      quoted = { clean: price.clean, bright: price.bright, travel: price.travel, miles: price.miles, withBright: !!est.instant.withBright, total: est.total, url: quoteUrl(db.settings, token) };
    },
    ownerExtra: () => quoted
      ? `\nInstant price shown on the website: ${money(quoted.clean)}${quoted.withBright ? ` cleaning + ${money(quoted.bright)} brightening = ${money(quoted.total)}` : ''} (${Number(house.sqft).toLocaleString('en-US')} sq ft, ${house.stories} story${house.twoFamily ? ', two family' : ''}${quoted.travel ? `, ${money(quoted.travel)} of it is travel, ${Math.round(quoted.miles)} miles out` : ''}${house.laser ? ', New Hampshire: no town record, size measured from the air' : ''}). The quote is in the CRM.${guards ? ' They have gutter guards.' : ''}`
      : (house.ok && whyNoPrice(house, cfg) === 'too_far' ? '\nNo instant price, this one is past your distance limit. Quote it yourself.' : '\nNo instant price for this house, quote it yourself.') + (guards ? ' They have gutter guards.' : '')
  });

  // The CRM write failed (the degraded path texted Eric the lead) or the
  // house could not be priced: the form carries on as the normal one.
  if (!quoted || out.degraded) return res.status(200).json({ ok: true, instant: false });

  // One text with the quote link, held a few minutes: if they accept on the
  // spot the CRM cancels it, otherwise it lands instead of the usual auto-reply.
  // Not when "Automated Lead Texting" is off in the CRM: that switch stops
  // the welcome text this one stands in for.
  if (!out.optOut && out.autoTexts !== false) {
    try {
      const r = await sbAdmin.from('imessage_queue').insert({
        phone: '+1' + phoneDigits,
        body: `Hey ${first}, it's Eric with Kaim Contracting. Here's your ${quoted.withBright ? 'gutter cleaning and brightening' : 'gutter cleaning'} quote in case you want to look it over again: ${quoted.url}`,
        direction: 'outgoing', status: 'pending',
        client_name: `${first} ${last}`.trim(), trigger_type: 'instant_quote_link',
        send_after: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      });
      if (r?.error) console.error('[instant-quote] link text', r.error.message);
    } catch (e) { console.error('[instant-quote] link text', e?.message || e); }
  }

  // And the same quote by email, right away, so they have it outside the app
  // the ad opened in.
  if (email) await sendQuoteEmail(first, email, quoted.url, quoted.withBright ? quoted.total : quoted.clean, quoted.withBright ? 'gutter cleaning and brightening' : 'gutter cleaning');

  return res.status(200).json({ ok: true, instant: true, clean: quoted.clean, bright: quoted.bright, withBright: quoted.withBright, total: quoted.total, token, url: quoted.url });
}

// Add or remove the brightening line. Only while the quote is still waiting
// on the visitor (status sent); an approved quote is never changed from here.
async function setAddon(body, res) {
  const token = sanitize(body.token, 60);
  if (!/^[0-9a-f]{40}$/.test(token)) return res.status(400).json({ error: 'Invalid token' });
  const want = !!body.bright;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const { data: row, error } = await sbAdmin.from('crm_data').select('data, updated_at').eq('id', 1).single();
    if (error) throw error;
    const db = row?.data || {};
    const est = (db.estimates || []).find(e => e && e.token === token && e.instant);
    if (!est) return res.status(404).json({ error: 'Quote not found' });
    if (est.status !== 'sent') return res.status(409).json({ error: 'Quote already answered', total: Number(est.total) || 0 });
    if (!!est.instant.withBright === want) return res.status(200).json({ ok: true, total: est.total });

    applyItems(est, want);
    const cl = (db.clients || []).find(c => c && c.id === est.cid);
    if (cl) cl.val = est.total;

    let q = sbAdmin.from('crm_data').update({ data: db, updated_at: new Date().toISOString() }).eq('id', 1);
    q = row.updated_at == null ? q.is('updated_at', null) : q.eq('updated_at', row.updated_at);
    const { data: written, error: writeErr } = await q.select('id');
    if (writeErr) throw writeErr;
    if (written && written.length) return res.status(200).json({ ok: true, total: est.total });
    await new Promise(r => setTimeout(r, 150 * attempt + Math.floor(Math.random() * 200)));
  }
  return res.status(503).json({ error: 'busy' });
}
