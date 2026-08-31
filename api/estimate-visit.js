// Self-serve estimate booking.
//
// GET  -> three open day options for a free in-person estimate
// POST -> book one: writes an Estimate Visit job onto the CRM calendar
//         (same compare-and-swap discipline as _lib/intake.js), cancels the
//         pending "when are you available?" auto-reply, queues Eric's notify
//         + the client's confirmation text, and queues the same arrival
//         reminders the CRM uses (day-before + morning-of).
//
// The job object matches what the AI scheduler (mac/reply_watcher.py) writes,
// so the CRM calendar, reschedule flow, and reminder cancellation all treat
// web bookings like any other estimate visit.

import { sbAdmin, sanitize, normalizePhone } from './_lib/intake.js';
import { computeOpenDays, slotIsOpen, dateLabel, nyToUtc, nyParts } from './_lib/booking.js';

const ALLOWED_ORIGINS = new Set([
  'https://kaimcontracting.com',
  'https://www.kaimcontracting.com'
]);

async function readCrm() {
  const { data: row, error } = await sbAdmin
    .from('crm_data').select('data, updated_at').eq('id', 1).single();
  if (error) throw error;
  return row;
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
    if (req.method === 'GET') return await getAvailability(res);
    if (req.method === 'POST') return await bookVisit(req, res);
  } catch (e) {
    console.error('[estimate-visit] Error:', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getAvailability(res) {
  const row = await readCrm();
  const db = row?.data || {};
  const days = computeOpenDays(db.jobs || [], db.settings || {}).map(d => ({
    date: d.date, time: d.time, label: dateLabel(d.date)
  }));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, days });
}

async function bookVisit(req, res) {
  const body = req.body || {};
  if (body.kc_hpot_xyz) return res.status(200).json({ ok: true }); // honeypot

  const first = sanitize(body.first, 60);
  const last = sanitize(body.last, 60);
  const phone = sanitize(body.phone, 30);
  const service = sanitize(body.service, 60);
  const address = sanitize(body.address, 160);
  const date = sanitize(body.date, 10);
  const time = sanitize(body.time, 10);

  const phoneDigits = String(phone).replace(/\D/g, '');
  if (!first || phoneDigits.length < 10) return res.status(400).json({ error: 'Name and phone required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2} [AP]M$/i.test(time)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }
  const phoneE164 = normalizePhone(phone);

  // CAS write, same discipline as intake.js: re-read + retry on conflict, and
  // re-verify the slot inside the loop so two people can't grab the same one.
  const MAX_ATTEMPTS = 4;
  let saved = false, clientRec = null, jobRec = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !saved; attempt++) {
    const row = await readCrm();
    const db = row?.data || {};
    db.clients = db.clients || [];
    db.jobs = db.jobs || [];
    db.activity = db.activity || [];
    db.settings = db.settings || {};
    if (db._nc == null) db._nc = 1;
    const prevUpdatedAt = row?.updated_at ?? null;

    if (!slotIsOpen(db.jobs, db.settings, date, time)) {
      return res.status(409).json({ error: 'slot_taken' });
    }

    // Find the client this booking belongs to — normally created seconds ago
    // by the lead POST. Match on phone digits; newest first (clients are
    // unshifted). Create a minimal client if the lead write never landed.
    const digits = p => String(p || '').replace(/\D/g, '').slice(-10);
    clientRec = db.clients.find(c => c && digits(c.phone) === phoneDigits.slice(-10));
    const now = new Date();
    if (!clientRec) {
      clientRec = {
        id: db._nc++, first, last, phone, email: '', address: address || '',
        service, val: 0, source: 'Website Booking', status: 'new',
        prio: 'normal', notes: '', priv: '',
        added: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        addedRaw: now.toISOString()
      };
      db.clients.unshift(clientRec);
    }

    // One active web/AI estimate visit per client: update in place if the
    // client books again (same rule reply_watcher.py uses).
    const isActiveVisit = j => j && j.cid === clientRec.id && j.type === 'Estimate Visit'
      && !['completed', 'done', 'cancelled'].includes(j.status);
    jobRec = db.jobs.find(isActiveVisit) || { id: Date.now(), cid: clientRec.id, crew: '', set_by: 'web' };
    if (address && !clientRec.address) clientRec.address = address;
    const existing = db.jobs.includes(jobRec);
    Object.assign(jobRec, {
      clientName: `${clientRec.first || first} ${clientRec.last || last}`.trim(),
      type: 'Estimate Visit',
      start: date, end: date,
      time, dur: '1 hour',
      addr: address || clientRec.address || '',
      notes: `Self-booked on the website. Service requested: ${service || clientRec.service || 'not specified'}`,
      status: 'confirmed',
      color: '#1a9b58',
      set_by: 'web'
    });
    if (!existing) db.jobs.push(jobRec);

    db.activity.unshift({
      text: `${jobRec.clientName} booked their own estimate visit online: ${dateLabel(date)} at ${time}`,
      ico: '📅',
      time: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    });

    let writeQuery = sbAdmin.from('crm_data')
      .update({ data: db, updated_at: now.toISOString() })
      .eq('id', 1);
    writeQuery = prevUpdatedAt === null
      ? writeQuery.is('updated_at', null)
      : writeQuery.eq('updated_at', prevUpdatedAt);
    const { data: written, error: writeErr } = await writeQuery.select('id');
    if (writeErr) throw writeErr;
    if (written && written.length > 0) saved = true;
    else await new Promise(r => setTimeout(r, 150 * attempt + Math.floor(Math.random() * 200)));
  }
  if (!saved) return res.status(503).json({ error: 'busy' });

  // ---- Texts. All awaited (Vercel freezes on return). -----------------
  const dayStr = dateLabel(date);
  const clientName = `${first} ${last}`.trim();
  const tasks = [];

  // The pending "when are you available?" auto-reply is now obsolete.
  tasks.push(sbAdmin.from('imessage_queue')
    .update({ status: 'cancelled' })
    .eq('phone', phoneE164).eq('status', 'pending').eq('trigger_type', 'lead_autoreply')
    .then(r => { if (r?.error) console.error('autoreply cancel', r.error.message); }, e => console.error('autoreply cancel', e?.message)));

  // Owner notify — immediate.
  tasks.push(sbAdmin.from('imessage_queue').insert({
    phone: '+19789607832',
    body: `${clientName} just booked their own estimate visit online: ${dayStr} at ${time}. It's on your calendar.`,
    direction: 'outgoing', status: 'pending',
    client_name: clientName, trigger_type: 'web_booking_notify'
  }).then(r => { if (r?.error) console.error('owner notify', r.error.message); }, e => console.error('owner notify', e?.message)));

  // Client confirmation — first person, same voice as the AI lock-in text.
  tasks.push(sbAdmin.from('imessage_queue').insert({
    phone: phoneE164,
    body: `Perfect, got you down for ${dayStr} at ${time} for your free estimate. If anything changes just call or text me. I'll text you when I'm on my way. Eric`,
    direction: 'outgoing', status: 'pending',
    client_name: clientName, trigger_type: 'web_booking_confirm',
    send_after: new Date(Date.now() + 4000).toISOString()
  }).then(r => { if (r?.error) console.error('client confirm', r.error.message); }, e => console.error('client confirm', e?.message)));

  // Arrival reminders — same trigger types + wording the CRM uses, so its
  // cancel/reschedule flows manage these rows too.
  const startUtc = nyToUtc(date, to24h(time));
  const endUtc = new Date(startUtc.getTime() + 36e5);
  const fT = t => t.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const windowStr = `between ${fT(startUtc)} and ${fT(endUtc)}`;

  const dayBefore = new Date(startUtc.getTime() - 24 * 36e5);
  const dbParts = nyParts(dayBefore);
  let dayBeforeSend = dayBefore;
  if (dbParts.hour < 7 || (dbParts.hour === 7 && dbParts.minute < 30)) dayBeforeSend = nyToUtc(dbParts.date, '07:30');
  else if (dbParts.hour >= 21) dayBeforeSend = nyToUtc(dbParts.date, '20:00');
  if (dayBeforeSend.getTime() > Date.now()) {
    tasks.push(sbAdmin.from('imessage_queue').insert({
      phone: phoneE164,
      body: `Quick reminder that I'll be out tomorrow (${dayStr}) for your free estimate, arriving ${windowStr}. If anything comes up before then, just call or text me. See you then!`,
      direction: 'outgoing', status: 'pending',
      client_name: clientName, trigger_type: 'arrival_daybefore',
      send_after: dayBeforeSend.toISOString()
    }).then(r => { if (r?.error) console.error('daybefore', r.error.message); }, e => console.error('daybefore', e?.message)));
  }

  const morningOf = nyToUtc(date, '07:30');
  if (morningOf.getTime() > Date.now() && morningOf.getTime() < startUtc.getTime()) {
    tasks.push(sbAdmin.from('imessage_queue').insert({
      phone: phoneE164,
      body: `Just a reminder that I'll be out today for your free estimate, arriving ${windowStr}. If anything comes up, just call or text me. See you soon!`,
      direction: 'outgoing', status: 'pending',
      client_name: clientName, trigger_type: 'arrival_morningof',
      send_after: morningOf.toISOString()
    }).then(r => { if (r?.error) console.error('morningof', r.error.message); }, e => console.error('morningof', e?.message)));
  }

  await Promise.allSettled(tasks);
  return res.status(200).json({ ok: true, label: `${dayStr} at ${time}` });
}

function to24h(label) {
  const m = String(label).trim().match(/^(\d{1,2}):(\d{2}) ([AP]M)$/i);
  if (!m) return '12:00';
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
