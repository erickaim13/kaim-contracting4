// Blog newsletter sign-up.
//   POST /api/subscribe {email, source}  -> saves the address in Supabase table
//        newsletter_subscribers (one row per address; signing up again after
//        leaving turns it back on). Same origin allow-list and honeypot as
//        api/lead.js. Nothing is emailed from here.
//   GET  /api/subscribe?u=<token>        -> the unsubscribe link every
//        newsletter email must carry. Marks the row and says so.

import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://dfquwxmoidhhcwezgnry.supabase.co';
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ALLOWED_ORIGINS = new Set([
  'https://kaimcontracting.com',
  'https://www.kaimcontracting.com'
]);

const page = (msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kaim Contracting</title><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f9;color:#0f1c2e;padding:60px 20px;text-align:center"><p style="font-size:18px;max-width:460px;margin:0 auto 18px;line-height:1.6">${msg}</p><a href="https://kaimcontracting.com/blog" style="color:#0d1e35;font-weight:600">Back to the blog</a></body>`;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const u = String((req.query || {}).u || '');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)) return res.status(400).send(page('That link does not look right.'));
      const { error } = await sb.from('newsletter_subscribers').update({ unsubscribed_at: new Date().toISOString() }).eq('unsub_token', u).is('unsubscribed_at', null);
      if (error) throw error;
      return res.status(200).send(page('You are off the list. No more emails from us.'));
    }

    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const okOrigin = ALLOWED_ORIGINS.has(origin) || [...ALLOWED_ORIGINS].some(o => referer.startsWith(o + '/'));
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
    if (body.kc_hpot_xyz) return res.status(200).json({ ok: true });   // bots: pretend success

    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    const source = String(body.source || 'Blog').replace(/[<>"'`]/g, '').trim().slice(0, 80);

    const { error } = await sb.from('newsletter_subscribers')
      .upsert({ email, source, unsubscribed_at: null }, { onConflict: 'email' });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[subscribe]', e?.message || e);
    if (req.method === 'GET') return res.status(500).send(page('Something went wrong on our end. Please try the link again in a minute.'));
    return res.status(500).json({ error: 'Server error' });
  }
}
