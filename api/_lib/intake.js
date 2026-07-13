// Shared new-lead intake + automation.
//
// This is the single source of truth for "a new lead arrived": it writes the
// lead into crm_data.clients, logs an activity entry, queues the owner-notify
// and near-instant auto-reply iMessages, and sends the branded confirmation email.
//
// Both the public website form (api/lead.js) and the Meta Lead Ads webhook
// (api/meta-lead-webhook.js) call intakeLead() so there is exactly one code
// path — no parallel automation to keep in sync.

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SB_URL = 'https://dfquwxmoidhhcwezgnry.supabase.co';
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const sbAdmin = createClient(SB_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'info@kaimcontracting.com', pass: process.env.GMAIL_APP_PASSWORD }
});

const DEFAULT_OWNER_PHONE = '+19783512195';

export function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}

// First text a new lead gets. First person, as Eric himself (see
// feedback_first_person_messaging). Editable in Supabase message_templates
// under key 'lead_autoreply'; this is the fallback if that row is missing.
const FALLBACK_AUTOREPLY = "Hey {name}, it's Eric with Kaim Contracting, thanks for reaching out about {service}! When are you available for me to come by for a free in person estimate? I'm available Monday to Friday 8am to 6pm and Saturday mornings.";

export const sanitize = (s, max = 200) =>
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

/**
 * Create a new lead and fire the full new-lead automation.
 *
 * @param {Object} opts
 * @param {string} opts.first            First name (required)
 * @param {string} opts.last             Last name
 * @param {string} opts.phone            Phone (any format; normalized internally)
 * @param {string} opts.email            Email (confirmation sent if present)
 * @param {string} opts.service          Service label
 * @param {string} opts.message          Free-text notes
 * @param {string} opts.contactPref      Preferred contact method
 * @param {string} opts.leadSource       Goes into client.source
 * @param {Array}  [opts.attachments]    [{name,data}]
 * @param {string} [opts.dedupeKey]      If set, skip insert when an existing
 *                                       client already has this metaLeadgenId.
 * @param {Object} [opts.extraClientFields] Merged onto the client object
 *                                       (e.g. { metaLeadgenId, metaFormId }).
 * @param {string} [opts.activityText]   Override the activity-feed line.
 * @param {string} [opts.activityIco]    Activity emoji (default 🌐).
 * @param {boolean}[opts.confirmationEmail] Send the branded email (default true).
 * @returns {Promise<{ok:boolean, duplicate:boolean, clientId?:number}>}
 */
export async function intakeLead(opts) {
  const {
    first = '', last = '', phone = '', email = '', service = '',
    message = '', contactPref = '', leadSource = '',
    attachments = [],
    dedupeKey = null,
    extraClientFields = {},
    activityText = null,
    activityIco = '🌐',
    confirmationEmail = true
  } = opts || {};

  // 1. Read crm_data
  const { data: row, error: readErr } = await sbAdmin
    .from('crm_data').select('data').eq('id', 1).single();
  if (readErr) throw readErr;

  // Merge any missing top-level keys onto the EXISTING blob rather than
  // replacing it. A partial/corrupted row (data present but missing `clients`)
  // must never cause us to overwrite the whole CRM with a fresh skeleton.
  const db = row?.data || {};
  db.clients = db.clients || [];
  db.estimates = db.estimates || [];
  db.invoices = db.invoices || [];
  db.messages = db.messages || [];
  db.activity = db.activity || [];
  db.settings = db.settings || {};
  db.jobs = db.jobs || [];
  if (db._nc == null) db._nc = 1;
  if (db._ne == null) db._ne = 1001;
  if (db._ni == null) db._ni = 2001;

  // Dedupe — same Meta leadgen_id must never create two leads.
  if (dedupeKey) {
    const exists = (db.clients || []).some(c => c && c.metaLeadgenId === dedupeKey);
    if (exists) return { ok: true, duplicate: true };
  }

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
    addedRaw: now.toISOString(),
    ...extraClientFields
  };
  if (attachments.length) client.attachments = attachments;

  db.clients.unshift(client);
  db.activity = db.activity || [];
  db.activity.unshift({
    text: activityText || ('New website lead: ' + client.first + ' ' + client.last + (attachments.length ? ' (' + attachments.length + ' photo' + (attachments.length > 1 ? 's' : '') + ')' : '')),
    ico: activityIco,
    time: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  });

  // 2. Write back
  const { error: writeErr } = await sbAdmin
    .from('crm_data')
    .update({ data: db, updated_at: now.toISOString() })
    .eq('id', 1);
  if (writeErr) throw writeErr;

  // 3. Queue iMessages — owner notify (immediate) + auto-reply (2-6s delay)
  const phoneDigits = String(phone).replace(/\D/g, '');
  const clientNumE164 = phoneDigits.length === 10 ? '+1' + phoneDigits : '+' + phoneDigits;

  // Queue inserts are AWAITED (via allSettled below). Vercel freezes the
  // function once the handler returns, so a fire-and-forget insert can be
  // dropped — critically for no-email leads, where nothing else is awaited
  // and the owner would silently never learn about the lead.
  const queueInserts = [];

  const ownerNotifyPhone = normalizePhone(db.settings?.notifyPhone) || normalizePhone(db.settings?.phone) || DEFAULT_OWNER_PHONE;
  queueInserts.push(
    sbAdmin.from('imessage_queue').insert({
      phone: ownerNotifyPhone,
      body: 'New quote request from ' + client.first + ' ' + client.last + ' for ' + (service || 'a service') + '\nPhone: ' + phone,
      direction: 'outgoing',
      status: 'pending',
      client_name: client.first + ' ' + client.last,
      trigger_type: 'lead_notify'
    }).then(r => { if (r?.error) console.error('owner notify error', r.error.message); },
      err => console.error('owner notify error', err?.message))
  );

  // Auto-reply to the lead — single template, any time of day. Gated by the
  // master "Automated Lead Texting" switch (settings.aiScheduler); when off,
  // the owner notify above still fires but the lead gets no auto-text.
  if (phoneDigits.length >= 10 && db.settings?.aiScheduler !== false) {
    const template = await loadTemplate('lead_autoreply', FALLBACK_AUTOREPLY);
    const replyBody = template.replace(/\{name\}/g, client.first).replace(/\{service\}/g, service || 'your project');
    // Near-instant: 2-6s here + the Mac sender's 10s poll = lead hears back in
    // well under 30 seconds. Speed-to-lead beats looking casual.
    const delayMs = Math.floor(Math.random() * (6000 - 2000 + 1)) + 2000;
    const sendAfter = new Date(Date.now() + delayMs).toISOString();

    queueInserts.push(
      sbAdmin.from('imessage_queue').insert({
        phone: clientNumE164,
        body: replyBody,
        direction: 'outgoing',
        status: 'pending',
        client_name: client.first + ' ' + client.last,
        trigger_type: 'lead_autoreply',
        send_after: sendAfter
      }).then(r => { if (r?.error) console.error('autoreply error', r.error.message); },
        err => console.error('autoreply error', err?.message))
    );
  }

  await Promise.allSettled(queueInserts);

  // 4. Confirmation email to client — AWAITED so the Vercel function doesn't
  // freeze before the SMTP handshake completes. SMTP takes ~1-2s; if we
  // fire-and-forget the way we do with iMessage inserts, Vercel terminates
  // the function and the email never actually sends. Only send when we have
  // an address (Meta lead forms may omit email).
  if (confirmationEmail && email) {
    try {
      await transporter.sendMail({
        from: 'Kaim Contracting <info@kaimcontracting.com>',
        to: email,
        subject: 'We Got Your Quote Request!',
        replyTo: 'info@kaimcontracting.com',
        html: brandedHtml(`
          <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Thanks for Reaching Out!</h2>
          <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6">Hi ${first.replace(/[<>&"']/g, '')},</p>
          <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6">We received your quote request${service ? ' for <strong>' + service.replace(/[<>&"']/g, '') + '</strong>' : ''}. You'll hear from us shortly, typically within the hour, to go over the details.</p>
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
  }

  return { ok: true, duplicate: false, clientId: client.id };
}
