import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SB_URL = 'https://dfquwxmoidhhcwezgnry.supabase.co';
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const sbAdmin = createClient(SB_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'info@kaimcontracting.com', pass: process.env.GMAIL_APP_PASSWORD }
});

const ALLOWED_ORIGINS = new Set([
  'https://kaimcontracting.com',
  'https://www.kaimcontracting.com'
]);

const DEFAULT_OWNER_PHONE = '+19783512195';

function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}
const SERVICE_OPTS = new Set([
  'Paver Installation', 'Paver Restoration', 'Landscaping', 'Drainage Solutions',
  'Hardscaping', 'Landscape Design', 'Pressure Washing',
  'Plantings', 'Multiple Services'
]);

const FALLBACK_BIZ_HRS = 'Hey {name}, thanks for reaching out to Kaim Contracting! Got your request for {service}. Quick question to help prep your quote: are you looking to get this done in the next 30 days, or just gathering info?';
const FALLBACK_AFTER_HRS = "Hey {name}, thanks for reaching out to Kaim Contracting! Its after hours so Eric will personally follow up first thing in the morning. In the meantime, mind sharing if youre hoping to get this done in the next 30 days or just exploring? Helps us prep.";

const sanitize = (s, max = 200) =>
  String(s || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

function brandedHtml(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<tr><td style="background:#1a1a1a;padding:32px;text-align:center">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#c9a84c;letter-spacing:.18em">KAIM CONTRACTING</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;color:#9a8a5a;letter-spacing:.35em;margin-top:8px">LANDSCAPING &middot; HARDSCAPING &middot; PRESSURE WASHING</div>
</td></tr>
<tr><td style="padding:32px 32px 28px">${body}</td></tr>
<tr><td style="padding:0 32px 28px;border-top:1px solid #eee;padding-top:20px;text-align:center">
<p style="margin:0;font-size:12px;color:#999;line-height:1.6">Kaim Contracting LLC<br>info@kaimcontracting.com · (978) 351-2195<br>kaimcontracting.com</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

async function loadTemplate(key, fallback) {
  try {
    const { data } = await sbAdmin
      .from('message_templates')
      .select('body')
      .eq('key', key)
      .maybeSingle();
    return data?.body || fallback;
  } catch { return fallback; }
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
  const message = sanitize(body.message, 2000);
  const contactPref = sanitize(body.contactPref, 80);
  const leadSource = sanitize(body.source, 120) || 'Website (kaimcontracting.com)';

  if (!first) return res.status(400).json({ error: 'Name required' });
  if (!phone || phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Invalid phone' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (service && !SERVICE_OPTS.has(service)) return res.status(400).json({ error: 'Invalid service' });

  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5).map(a => ({
    name: sanitize(a?.name, 80),
    data: typeof a?.data === 'string' && a.data.length < 2_500_000 ? a.data : null
  })).filter(a => a.data) : [];

  try {
    // 1. Read crm_data
    const { data: row, error: readErr } = await sbAdmin
      .from('crm_data').select('data').eq('id', 1).single();
    if (readErr) throw readErr;

    const db = (row?.data && row.data.clients) ? row.data : {
      clients: [], estimates: [], invoices: [], messages: [],
      activity: [], settings: {}, _nc: 1, _ne: 1001, _ni: 2001, jobs: []
    };

    const now = new Date();
    const client = {
      id: db._nc++,
      first, last, phone, email, address: '',
      service,
      val: 0,
      source: leadSource,
      status: 'new',
      prio: 'normal',
      notes: message,
      priv: contactPref ? `Preferred contact: ${contactPref}` : '',
      added: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      addedRaw: now.toISOString()
    };
    if (attachments.length) client.attachments = attachments;

    db.clients.unshift(client);
    db.activity = db.activity || [];
    db.activity.unshift({
      text: 'New website lead: ' + client.first + ' ' + client.last + (attachments.length ? ' (' + attachments.length + ' photo' + (attachments.length > 1 ? 's' : '') + ')' : ''),
      ico: '🌐',
      time: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    });

    // 2. Write back
    const { error: writeErr } = await sbAdmin
      .from('crm_data')
      .update({ data: db, updated_at: now.toISOString() })
      .eq('id', 1);
    if (writeErr) throw writeErr;

    // 3. Queue iMessages — owner notify (immediate) + auto-reply (2-5 min delay)
    const phoneDigits = phone.replace(/\D/g, '');
    const clientNumE164 = phoneDigits.length === 10 ? '+1' + phoneDigits : '+' + phoneDigits;

    const ownerNotifyPhone = normalizePhone(db.settings?.notifyPhone) || normalizePhone(db.settings?.phone) || DEFAULT_OWNER_PHONE;
    sbAdmin.from('imessage_queue').insert({
      phone: ownerNotifyPhone,
      body: 'New quote request from ' + client.first + ' ' + client.last + ' for ' + (service || 'a service') + '\nPhone: ' + phone,
      direction: 'outgoing',
      status: 'pending',
      client_name: client.first + ' ' + client.last,
      trigger_type: 'lead_notify'
    }).then(() => {}, err => console.error('owner notify error', err?.message));

    if (phoneDigits.length >= 10) {
      const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
      const isBizHours = etHour >= 7 && etHour < 20;
      const tplKey = isBizHours ? 'lead_biz_hours' : 'lead_after_hours';
      const tplFallback = isBizHours ? FALLBACK_BIZ_HRS : FALLBACK_AFTER_HRS;
      const template = await loadTemplate(tplKey, tplFallback);
      const replyBody = template.replace(/\{name\}/g, client.first).replace(/\{service\}/g, service || 'your project');
      const delayMs = Math.floor(Math.random() * (300000 - 120000 + 1)) + 120000;
      const sendAfter = new Date(Date.now() + delayMs).toISOString();

      sbAdmin.from('imessage_queue').insert({
        phone: clientNumE164,
        body: replyBody,
        direction: 'outgoing',
        status: 'pending',
        client_name: client.first + ' ' + client.last,
        trigger_type: 'lead_autoreply',
        send_after: sendAfter
      }).then(() => {}, err => console.error('autoreply error', err?.message));
    }

    // 4. Confirmation email to client — AWAITED so the Vercel function doesn't
    // freeze before the SMTP handshake completes. SMTP takes ~1-2s; if we
    // fire-and-forget the way we do with iMessage inserts, Vercel terminates
    // the function and the email never actually sends.
    try {
      await transporter.sendMail({
        from: 'Kaim Contracting <info@kaimcontracting.com>',
        to: email,
        subject: 'We Got Your Quote Request!',
        replyTo: 'info@kaimcontracting.com',
        html: brandedHtml(`
          <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Thanks for Reaching Out!</h2>
          <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6">Hi ${first.replace(/[<>&"']/g, '')},</p>
          <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6">We received your quote request${service ? ' for <strong>' + service.replace(/[<>&"']/g, '') + '</strong>' : ''}. We'll get back to you within one business day to go over the details.</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6">In the meantime, feel free to give us a call or reply to this email with any questions.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="background:#f8f8f8;border-radius:8px;padding:20px 24px;text-align:center">
            <div style="font-size:13px;color:#999;margin-bottom:6px">Call or text us anytime</div>
            <div style="font-size:20px;font-weight:700;color:#1a1a1a">(978) 351-2195</div>
          </td></tr></table>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.5">We look forward to working with you!</p>
        `)
      });
    } catch (e) {
      console.error('confirmation email error', e?.message || e);
      // Don't fail the whole request if the email part stumbles — the lead
      // is already in the CRM and iMessages were queued.
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[lead] Error:', e?.message || e);
    return res.status(500).json({ error: 'Could not submit lead' });
  }
}
