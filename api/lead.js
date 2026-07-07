// Public website quote form -> CRM lead intake.
//
// This endpoint owns the HTTP concerns (CORS/origin allow-list, honeypot,
// input validation) then hands off to the shared intakeLead() automation in
// _lib/intake.js — the exact same path the Meta Lead Ads webhook uses.

import { intakeLead, sanitize } from './_lib/intake.js';

const ALLOWED_ORIGINS = new Set([
  'https://kaimcontracting.com',
  'https://www.kaimcontracting.com'
]);

const SERVICE_OPTS = new Set([
  'Paver Installation', 'Paver Restoration', 'Landscaping', 'Drainage Solutions',
  'Hardscaping', 'Landscape Design', 'Pressure Washing',
  'Plantings', 'Multiple Services'
]);

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const okOrigin = ALLOWED_ORIGINS.has(origin) ||
    [...ALLOWED_ORIGINS].some(o => referer.startsWith(o + '/'));

  if (okOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'https://kaimcontracting.com');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!okOrigin) return res.status(403).json({ error: 'Forbidden' });

  const body = req.body || {};

  // Honeypot — bots usually fill all visible fields. Random obscure name so
  // browser autofill leaves it alone. If filled, reject silently.
  if (body.kc_hpot_xyz) {
    return res.status(200).json({ ok: true }); // pretend success so bots don't probe
  }

  const first = sanitize(body.first, 60);
  const last = sanitize(body.last, 60);
  const phone = sanitize(body.phone, 30);
  const email = sanitize(body.email, 120);
  const service = sanitize(body.service, 60);
  // Calculators post their project detail under `notes`; the hero/service forms
  // use `message`. Accept either so calculator context isn't silently dropped.
  const message = sanitize(body.message || body.notes, 2000);
  const contactPref = sanitize(body.contactPref, 80);
  const leadSource = sanitize(body.source, 120) || 'Website (kaimcontracting.com)';

  if (!first) return res.status(400).json({ error: 'Name required' });
  if (!phone || phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Invalid phone' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (service && !SERVICE_OPTS.has(service)) return res.status(400).json({ error: 'Invalid service' });

  // Attachments must be real base64 image data URIs (not arbitrary strings) and
  // are capped both per-item and in total so a forged POST can't bloat the row.
  let attachTotal = 0;
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5).map(a => {
    const data = typeof a?.data === 'string'
      && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(a.data)
      && a.data.length < 2_500_000 ? a.data : null;
    return { name: sanitize(a?.name, 80), data };
  }).filter(a => {
    if (!a.data) return false;
    attachTotal += a.data.length;
    return attachTotal < 6_000_000; // ~6MB total across all attachments
  }) : [];

  try {
    await intakeLead({
      first, last, phone, email, service, message, contactPref,
      leadSource, attachments
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[lead] Error:', e?.message || e);
    return res.status(500).json({ error: 'Could not submit lead' });
  }
}
