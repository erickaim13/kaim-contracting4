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
import { intakeLead, sanitize, sbAdmin, usPhoneDigits, sendQuoteEmail } from './_lib/intake.js';
import { iqConfig, priceHouse, lookupHouse, buildEstimate, applyItems } from './_lib/instant.js';

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
export function parseFields(fieldData) {
  const out = { fullName: '', first: '', last: '', phone: '', email: '', serviceRaw: '', whatClean: '', howSoon: '', stories: '', gutterWant: '', street: '', city: '', state: '', zip: '', extras: [] };
  for (const f of (fieldData || [])) {
    const key = String(f?.name || '').toLowerCase();
    const val = sanitize(Array.isArray(f?.values) ? f.values.join(', ') : '', 500);
    if (!val) continue;
    if (key === 'first_name') out.first = val;
    else if (key === 'last_name') out.last = val;
    else if (key.includes('full_name') || key === 'name' || key === 'your_name') out.fullName = val;
    else if (key.includes('phone')) out.phone = val;
    else if (key.includes('email')) out.email = val;
    // The gutter form's question ("What do you need done to your gutters?")
    // and Meta's own address fields.
    else if (key.includes('gutter')) out.gutterWant = val;
    else if (key.includes('street') || key === 'address') out.street = val;
    else if (key === 'city') out.city = val;
    else if (key === 'state' || key === 'province') out.state = val;
    else if (key.includes('zip') || key.includes('post')) out.zip = val;
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

// "12 Oak St" + "Methuen" + "MA" + "01844" -> "12 Oak St, Methuen, MA 01844".
export function formAddress(p) {
  if (!p.street) return '';
  // The gutter form asks street, city and ZIP only: the state comes from the ZIP.
  const st = p.state || (/^0[12]/.test(p.zip) ? 'MA' : /^03/.test(p.zip) ? 'NH' : '');
  const tail = [st, p.zip].filter(Boolean).join(' ');
  return [p.street, p.city, tail].filter(Boolean).join(', ');
}

// What a gutter form lead asked for: 'clean', 'both' or 'bright' ('' when the
// lead is not from a gutter form). Meta sends the answer as the option's key,
// so "Gutter cleaning" may arrive as "gutter_cleaning".
export function gutterChoice(p, service) {
  const a = String(p.gutterWant || (/gutter/i.test(p.serviceRaw) ? p.serviceRaw : '')).toLowerCase();
  if (!a) return service === 'Gutter Cleaning' ? 'clean' : '';
  if (a.includes('both') || (a.includes('clean') && a.includes('bright'))) return 'both';
  if (a.includes('bright')) return 'bright';
  return 'clean';
}

function quoteUrl(settings, token) {
  let b = String((settings && settings.publicBase) || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(b)) b = 'https://kaimcontractingapp.com';
  return b + '/?approve=' + token;
}
const money = n => '$' + Number(n || 0).toLocaleString('en-US');

// A gutter form lead (cleaning, or cleaning and brightening): the house is
// priced from the address the same way /gutter-price does it, the real CRM
// quote is saved with the lead, and the quote link goes to them by text a
// minute later and by email right away. A house that cannot be priced (or no
// address) is saved as a normal lead with the usual welcome text.
async function intakeGutterLead(parsed, lead, leadgenId, wantBright) {
  const address = formAddress(parsed);
  const [house, pqRow] = await Promise.all([
    address ? lookupHouse(address) : Promise.resolve({ ok: false, why: 'no_address' }),
    sbAdmin.from('crm_data').select('pq:data->settings->pq').eq('id', 1).single().then(r => r.data, () => null)
  ]);
  const price = house.ok ? priceHouse(house.sqft, house.stories, iqConfig({ pq: pqRow?.pq || {} })) : null;
  const token = crypto.randomBytes(20).toString('hex');
  const first = parsed.first || '(no name)';
  let quoted = null;

  const out = await intakeLead({
    first, last: parsed.last, phone: parsed.phone, email: parsed.email, address,
    service: 'Gutter Cleaning',
    message: buildNotes(parsed) + (wantBright ? '\n- Also wants gutter brightening' : ''),
    contactPref: '', leadSource: 'Meta gutter form', dedupeKey: leadgenId,
    extraClientFields: { metaLeadgenId: leadgenId, metaFormId: sanitize(lead.form_id, 60) },
    activityText: 'New Meta lead ad: ' + first + ' ' + (parsed.last || ''), activityIco: '📣',
    autoReply: !price, confirmationEmail: !price,
    onDb: (db, client, now) => {
      quoted = null;   // the save loop can run more than once
      if (!price) {
        client.iq = { v: 'form', priced: false, why: house.ok ? 'outside_range' : house.why, at: now.toISOString() };
        return;
      }
      if (db._ne == null) db._ne = 1001;
      const est = buildEstimate(db, client, house, price, 'form', token, now);
      if (wantBright) applyItems(est, true);
      db.estimates.unshift(est);
      client.status = 'estimate';
      client.statusAt = now.toISOString();
      client.val = est.total;
      client.iq = { v: 'form', priced: true, at: now.toISOString(), sqft: house.sqft, stories: house.stories, clean: price.clean, bright: price.bright, estId: est.id, ...(house.laser ? { laser: true } : {}) };
      quoted = { total: est.total, url: quoteUrl(db.settings, token) };
    },
    ownerExtra: () => quoted
      ? `\nQuote sent to them by text and email: ${money(quoted.total)}${wantBright ? ' (cleaning and brightening)' : ''}, ${Number(house.sqft).toLocaleString('en-US')} sq ft, ${house.stories} story${house.twoFamily ? ', two family' : ''}${house.laser ? ', New Hampshire: size measured from the air' : ''}. It is in the CRM.`
      : '\nNo instant price for this house, quote it yourself.'
  });
  if (out.duplicate || out.degraded || !quoted) return out;

  const phoneDigits = usPhoneDigits(parsed.phone);
  const what = wantBright ? 'gutter cleaning and brightening' : 'gutter cleaning';
  if (phoneDigits && !out.optOut && out.autoTexts !== false) {
    try {
      const r = await sbAdmin.from('imessage_queue').insert({
        phone: '+1' + phoneDigits,
        body: `Hey ${first}, it's Eric with Kaim Contracting. Thanks for reaching out. Here's your ${what} quote: ${quoted.url}\nYou can approve it right there and I'll get you on the schedule.`,
        direction: 'outgoing', status: 'pending',
        client_name: `${first} ${parsed.last || ''}`.trim(), trigger_type: 'instant_quote_link',
        send_after: new Date(Date.now() + 60 * 1000).toISOString()
      });
      if (r?.error) console.error('[meta-lead-webhook] link text', r.error.message);
    } catch (e) { console.error('[meta-lead-webhook] link text', e?.message || e); }
  }
  if (parsed.email) await sendQuoteEmail(first, parsed.email, quoted.url, quoted.total, what);
  return out;
}

function buildNotes(p) {
  const lines = ['Meta Lead Ad submission.'];
  if (p.gutterWant) lines.push('Asked for: ' + p.gutterWant.replace(/_/g, ' '));
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
      let service = resolveService(lead.form_id, parsed.serviceRaw);
      const gutter = gutterChoice(parsed, service);
      if (gutter === 'bright') service = 'Gutter Brightening';
      else if (gutter) service = 'Gutter Cleaning';
      console.log('[meta-lead-webhook] lead', leadgenId, 'form', lead.form_id, '-> service', service, gutter);

      // Brightening alone has no instant price: a normal lead, Eric quotes it.
      const result = (gutter === 'clean' || gutter === 'both')
        ? await intakeGutterLead(parsed, lead, leadgenId, gutter === 'both')
        : await intakeLead({
        first: parsed.first || '(no name)',
        last: parsed.last,
        phone: parsed.phone,
        email: parsed.email,
        address: formAddress(parsed),
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
