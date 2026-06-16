// Meta (Facebook/Instagram) Lead Ads webhook.
//
// GET  -> answers Meta's subscription verification handshake.
// POST -> receives leadgen notifications, verifies the X-Hub-Signature-256
//         signature, fetches each lead's field_data from the Graph API, and
//         funnels it into the SAME new-lead automation the website form uses
//         (intakeLead in _lib/intake.js). Dedupes on leadgen_id.
//
// Required env vars:
//   META_VERIFY_TOKEN  - shared secret you also enter in the Meta webhook setup
//   META_APP_SECRET    - your Meta app secret (signs the POST body)
//   PAGE_ACCESS_TOKEN  - long-lived Page access token with leads_retrieval
//
// Body signature verification needs the raw bytes, so Vercel's automatic body
// parsing is disabled and we read the stream ourselves.

import crypto from 'crypto';
import { intakeLead, sanitize } from './_lib/intake.js';

export const config = { api: { bodyParser: false } };

const GRAPH_VERSION = 'v21.0';

// CRM's canonical service labels — keep in sync with SERVICE_OPTS in lead.js.
const SERVICES = [
  'Paver Installation', 'Paver Restoration', 'Landscaping', 'Drainage Solutions',
  'Hardscaping', 'Landscape Design', 'Pressure Washing', 'Plantings', 'Multiple Services'
];

// Map each Meta lead form to a CRM service. As you launch forms for other
// services, add the form's ID here. Every incoming lead logs its form_id (see
// the console.log in the handler), or find it in Meta's Instant Forms library.
const FORM_SERVICE = {
  // '1234567890123456': 'Paver Installation',
  // '2345678901234567': 'Drainage Solutions',
};

// Used only when the form isn't mapped above and no service question is found.
// Empty on purpose: intakeLead renders an empty service as the neutral
// "your project" in the auto-reply (and "a service" in the owner notify), so an
// unclassified lead never goes out with a wrong service. The owner can set the
// real service in the CRM after reading the lead notes.
const DEFAULT_META_SERVICE = '';

// Best-effort match of a free-text / dropdown answer to a canonical service.
function matchService(answer) {
  const a = String(answer || '').toLowerCase().trim();
  if (!a) return '';
  const exact = SERVICES.find(s => s.toLowerCase() === a);
  if (exact) return exact;
  if (a.includes('paver') && a.includes('restor')) return 'Paver Restoration';
  if (a.includes('paver')) return 'Paver Installation';
  if (a.includes('drain')) return 'Drainage Solutions';
  if (a.includes('hardscap')) return 'Hardscaping';
  if (a.includes('design')) return 'Landscape Design';
  if (a.includes('plant')) return 'Plantings';
  if (a.includes('pressure') || a.includes('wash')) return 'Pressure Washing';
  if (a.includes('landscap')) return 'Landscaping';
  if (a.includes('multiple') || a.includes('several')) return 'Multiple Services';
  return '';
}

// Resolve the CRM service for a lead: explicit form map wins, then a detected
// service question, then the default.
function resolveService(formId, serviceRaw) {
  return FORM_SERVICE[String(formId || '')] || matchService(serviceRaw) || DEFAULT_META_SERVICE;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Pull the lead's field_data from the Graph API.
async function fetchLead(leadgenId, token) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`
    + `?fields=field_data,created_time,form_id`
    + `&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message || ('HTTP ' + r.status);
    throw new Error('Graph API error: ' + msg);
  }
  return json;
}

// Map Meta's field_data array into the fields we care about. Custom-question
// `name` keys are derived by Meta from the question text, so we match on
// keywords and keep anything unrecognized in `extras` so nothing is lost.
function parseFields(fieldData) {
  const out = { fullName: '', first: '', last: '', phone: '', email: '', serviceRaw: '', whatClean: '', howSoon: '', stories: '', extras: [] };
  for (const f of (fieldData || [])) {
    const key = String(f?.name || '').toLowerCase();
    const val = sanitize(Array.isArray(f?.values) ? f.values.join(', ') : '', 500);
    if (!val) continue;
    if (key === 'first_name') out.first = val;
    else if (key === 'last_name') out.last = val;
    else if (key.includes('full_name') || key === 'name' || key === 'your_name') out.fullName = val;
    else if (key.includes('phone')) out.phone = val;
    else if (key.includes('email')) out.email = val;
    else if (key.includes('service') || key.includes('interested') || key.includes('project_type')) out.serviceRaw = val;
    else if (key.includes('clean')) out.whatClean = val;
    else if (key.includes('soon') || key.includes('when') || key.includes('timeline') || key.includes('start')) out.howSoon = val;
    else if (key.includes('stor') || key.includes('level') || key.includes('floor')) out.stories = val;
    else out.extras.push(`${f.name}: ${val}`);
  }
  // Derive first/last from a single full-name field when needed.
  if (!out.first && out.fullName) {
    const parts = out.fullName.trim().split(/\s+/);
    out.first = parts.shift() || '';
    out.last = parts.join(' ');
  }
  return out;
}

function buildNotes(p) {
  const lines = ['Meta Lead Ad submission.'];
  if (p.serviceRaw) lines.push('Service requested: ' + p.serviceRaw);
  if (p.whatClean) lines.push('What to clean: ' + p.whatClean);
  if (p.howSoon) lines.push('Timeline: ' + p.howSoon);
  if (p.stories) lines.push('Stories: ' + p.stories);
  for (const e of p.extras) lines.push(e);
  return lines.join('\n');
}

export default async function handler(req, res) {
  // --- GET: subscription verification handshake ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected = (process.env.META_VERIFY_TOKEN || '').trim();
    if (mode === 'subscribe' && expected && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- POST: leadgen notification ---
  const rawBody = await readRawBody(req);

  if (!verifySignature(rawBody, req.headers['x-hub-signature-256'], (process.env.META_APP_SECRET || '').trim())) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody || '{}'); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  // Only handle Page leadgen events; ack anything else so Meta stops resending.
  if (payload.object !== 'page') {
    return res.status(200).json({ received: true, ignored: true });
  }

  // Collect every leadgen_id in the batch.
  const leadgenIds = [];
  for (const entry of (payload.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field === 'leadgen' && change.value && change.value.leadgen_id) {
        leadgenIds.push(String(change.value.leadgen_id));
      }
    }
  }

  const token = (process.env.PAGE_ACCESS_TOKEN || '').trim();
  let created = 0, duplicates = 0;
  const failed = [];

  for (const leadgenId of leadgenIds) {
    try {
      const lead = await fetchLead(leadgenId, token);
      const parsed = parseFields(lead.field_data);
      const service = resolveService(lead.form_id, parsed.serviceRaw);
      console.log('[meta-lead-webhook] lead', leadgenId, 'form', lead.form_id, '-> service', service);

      const result = await intakeLead({
        first: parsed.first || '(no name)',
        last: parsed.last,
        phone: parsed.phone,
        email: parsed.email,
        service,
        message: buildNotes(parsed),
        contactPref: '',
        leadSource: 'meta_lead_ad',
        dedupeKey: leadgenId,
        extraClientFields: {
          metaLeadgenId: leadgenId,
          metaFormId: sanitize(lead.form_id, 60)
        },
        activityText: 'New Meta lead ad: ' + (parsed.first || '(no name)') + ' ' + (parsed.last || ''),
        activityIco: '📣'
      });

      if (result.duplicate) duplicates++;
      else created++;
    } catch (e) {
      console.error('[meta-lead-webhook]', leadgenId, e?.message || e);
      failed.push(leadgenId);
    }
  }

  // If everything failed (e.g. Graph token expired), return 500 so Meta retries
  // — dedupe makes the retry safe. Otherwise ack.
  if (failed.length && created === 0 && duplicates === 0) {
    return res.status(500).json({ error: 'Processing failed', failed });
  }
  return res.status(200).json({ received: true, created, duplicates, failed: failed.length });
}
