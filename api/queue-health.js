import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Watchdog for the iMessage queue. The texts are actually sent by the old
// MacBook running the CRM app at Eric's house. If that machine sleeps, drops
// wifi, or dies, queued texts silently pile up as 'pending' and nothing warns
// anyone — the website keeps looking fine. This endpoint checks for texts that
// should have gone out but didn't, and emails Eric if it finds any.
//
// Called two ways:
//   - Vercel cron (see vercel.json) once a day as a backup
//   - An hourly scheduled Claude check that fetches this URL
//
// While the queue is stuck it will email on every check. That is intentional —
// a nagging inbox beats a silently dead pipeline.

const SB_URL = 'https://dfquwxmoidhhcwezgnry.supabase.co';
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const sbAdmin = createClient(SB_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'info@kaimcontracting.com', pass: process.env.GMAIL_APP_PASSWORD }
});

// How long a pending text can sit before we call it stuck. The autoreply is
// deliberately delayed up to 5 minutes, so anything under ~10 is normal.
const STUCK_MINUTES = 25;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Try to read created_at too; fall back gracefully if the column
    // doesn't exist on this table.
    let rows, error;
    ({ data: rows, error } = await sbAdmin
      .from('imessage_queue')
      .select('id, send_after, created_at, trigger_type')
      .eq('status', 'pending'));
    if (error) {
      ({ data: rows, error } = await sbAdmin
        .from('imessage_queue')
        .select('id, send_after, trigger_type')
        .eq('status', 'pending'));
      if (error) throw error;
    }

    const nowMs = Date.now();
    const cutoffMs = STUCK_MINUTES * 60 * 1000;

    const stuck = (rows || []).filter(r => {
      // A row is stuck if the time it was supposed to send (send_after, or
      // when it was created for immediate sends) is more than STUCK_MINUTES
      // ago. Rows with no readable timestamp are skipped rather than
      // false-alarmed.
      const due = r.send_after ? Date.parse(r.send_after)
        : (r.created_at ? Date.parse(r.created_at) : NaN);
      return Number.isFinite(due) && (nowMs - due) > cutoffMs;
    });

    if (stuck.length > 0) {
      let oldestMin = 0;
      for (const r of stuck) {
        const due = Date.parse(r.send_after || r.created_at);
        const age = Math.round((nowMs - due) / 60000);
        if (age > oldestMin) oldestMin = age;
      }

      try {
        await transporter.sendMail({
          from: 'Kaim Contracting Alerts <info@kaimcontracting.com>',
          to: 'erickaim13@gmail.com',
          cc: 'info@kaimcontracting.com',
          subject: '⚠️ Your texts are NOT sending — check the old MacBook',
          text:
            stuck.length + ' text' + (stuck.length > 1 ? 's are' : ' is') +
            ' stuck in the queue and not going out. The oldest has been waiting ' +
            oldestMin + ' minutes.\n\n' +
            'This almost always means the old MacBook at the house stopped: asleep, ' +
            'off wifi, signed out of iMessage, or powered down after an update.\n\n' +
            'Go check it. Once it is back, the stuck texts should send on their own.\n\n' +
            'Leads are still being saved and confirmation emails still send. Only the ' +
            'texts are down.\n\n' +
            '(Automated check from kaimcontracting.com/api/queue-health. It re-checks ' +
            'hourly and will keep emailing until the queue drains.)'
        });
      } catch (e) {
        console.error('[queue-health] alert email failed:', e?.message || e);
      }

      return res.status(200).json({
        ok: false,
        stuck: stuck.length,
        oldestWaitingMinutes: oldestMin,
        pending: (rows || []).length,
        meaning: 'Texts are not sending. The old MacBook is probably down. Eric has been emailed.'
      });
    }

    return res.status(200).json({
      ok: true,
      stuck: 0,
      pending: (rows || []).length,
      meaning: 'Queue is healthy. Anything pending is within its normal send window.'
    });
  } catch (e) {
    console.error('[queue-health] Error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Health check itself failed', detail: String(e?.message || e) });
  }
}
