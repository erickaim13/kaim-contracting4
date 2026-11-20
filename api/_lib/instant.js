// Instant gutter quote: the price rule and the town-record lookup.
//
// Price = house living area x a rate for the number of stories, never under
// the minimum and never over the maximum, rounded to the nearest $25. The
// numbers are Eric's and live in the CRM (Price & Quote > My numbers, saved
// as settings.pq.iq*); the ones below are only the starting values.
//
// The house size and story count come from the MassGIS property tax parcel
// (the assessor record) for the typed address. No record, not a single family
// house, an odd size or a New Hampshire address means NO instant price: the
// lead goes through the normal form and Eric quotes it himself.
//
// Everything network-facing takes `fetch` as an argument so the tests run
// with no network.

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const PARCELS = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query';

export const IQ_DEFAULTS = {
  iqClean1: 0.10,      // $ per sq ft of house, 1 story
  iqClean2: 0.12,      // $ per sq ft of house, 2 story
  iqCleanMin: 250,
  iqCleanMax: 350,
  iqBright1: 0.085,
  iqBright2: 0.10,
  iqBrightMin: 200,
  iqBrightMax: 300,
  iqShare: 0,          // % of gutter cleaning visitors who get the instant price (0 = test off)
  iqMaxSqft: 5000      // bigger than this and Eric quotes it himself
};
const MIN_SQFT = 600;

/** Eric's numbers from the CRM, falling back to the starting values. */
export function iqConfig(settings) {
  const own = (settings && settings.pq) || {};
  const cfg = {};
  for (const k of Object.keys(IQ_DEFAULTS)) {
    const v = own[k];
    const n = Number(v);
    cfg[k] = v !== '' && v != null && Number.isFinite(n) && n >= 0 ? n : IQ_DEFAULTS[k];
  }
  cfg.iqShare = Math.min(100, cfg.iqShare);
  return cfg;
}

const round25 = n => Math.round(n / 25) * 25;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), n));

/**
 * { clean, bright } in whole dollars, or null when the house is outside what
 * the instant price covers (no size, too small or too big, 3 stories).
 * A cape or a split (1.5 on the record) is priced as 1 story.
 */
export function priceHouse(sqft, stories, cfg = IQ_DEFAULTS) {
  const a = Number(sqft), st = Number(stories);
  if (!(a >= MIN_SQFT) || a > cfg.iqMaxSqft) return null;
  if (!(st >= 1) || st > 2.5) return null;
  const two = st >= 1.75;
  const clean = clamp(round25(a * (two ? cfg.iqClean2 : cfg.iqClean1)), cfg.iqCleanMin, cfg.iqCleanMax);
  // Brightening is the upsell (Eric, 2026-11-19): whatever the numbers in the
  // CRM say, it never comes out at or above the cleaning price.
  const bright = Math.max(0, Math.min(clean - 25,
    clamp(round25(a * (two ? cfg.iqBright2 : cfg.iqBright1)), cfg.iqBrightMin, cfg.iqBrightMax)));
  return { clean, bright };
}

/** "12A Oak Hill Rd, Haverhill" -> "12A" (the house number as typed), or ''. */
export function houseNumber(address) {
  const m = String(address || '').trim().match(/^(\d+[A-Za-z]?)\b/);
  return m ? m[1].toUpperCase() : '';
}

const normNum = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// Street names are compared with the common words shortened the same way on
// both sides: "9 West Hollow" is the record's "WEST HOLLOW", "163 Old Ferry
// Drive" is "OLD FERRY DR".
const ABBR = {
  STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', AVENUE: 'AVE', AV: 'AVE', LANE: 'LN', PLACE: 'PL', COURT: 'CT', CIRCLE: 'CIR',
  TERRACE: 'TER', TERR: 'TER', BOULEVARD: 'BLVD', HIGHWAY: 'HWY', PARKWAY: 'PKWY', SQUARE: 'SQ', EXTENSION: 'EXT', WAY: 'WAY',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', MOUNT: 'MT', SAINT: 'ST'
};
export function normStreet(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map(w => ABBR[w] || w).join(' ');
}
/** "163 Old Ferry Drive, Methuen, MA" -> "OLD FERRY DR" (what was typed after the number, before the town). */
export function typedStreet(address) {
  const first = String(address || '').split(',')[0].trim().replace(/^\d+[A-Za-z]?\s+/, '');
  return normStreet(first.replace(/\b(apt|unit|#).*$/i, ''));
}

async function getJson(fetchImpl, url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': 'KaimContracting/1.0 (instant quote)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * Pick the parcel that is this house out of the candidate records: same house
 * number and the same street name. Pure, tested.
 * Returns { ok:true, sqft, stories, ... } or { ok:false, why }.
 */
export function pickParcel(rows, num, street) {
  const want = normNum(num), st = normStreet(street);
  const mine = (rows || []).filter(a => a && normNum(a.ADDR_NUM) === want && normStreet(a.FULL_STR) === st);
  if (!mine.length) return { ok: false, why: 'no_record' };
  // More than one record at one address is a condo or a multi-unit building.
  if (mine.length > 1 || Number(mine[0].UNITS) > 1) return { ok: false, why: 'not_single_family' };
  const a = mine[0];
  // 101 (some towns write 1010) is a single family house on the state's use codes.
  if (String(a.USE_CODE || '').slice(0, 3) !== '101') return { ok: false, why: 'not_single_family' };
  // Stories come as "2", "1.5", "2A", "1H": the leading number is the count.
  const sqft = Number(a.RES_AREA) || 0, stories = parseFloat(a.STORIES) || 0;
  if (!(sqft > 0)) return { ok: false, why: 'no_size' };
  if (!(stories > 0)) return { ok: false, why: 'no_stories' };
  return {
    ok: true, sqft, stories,
    style: String(a.STYLE || ''), year: Number(a.YEAR_BUILT) || 0,
    addr: String(a.SITE_ADDR || '').replace(/\s+/g, ' ').trim(), city: String(a.CITY || ''),
    // Centre of the lot itself (the geocoder's point sits out on the street).
    lotLat: Number(a._cy) || null, lotLng: Number(a._cx) || null
  };
}

// Long and short spellings of a street's first word, for the record search
// ("WEST HOLLOW" on one town's records is "W LOWELL ST" style on another's).
const LONG = Object.fromEntries(Object.entries(ABBR).map(([k, v]) => [v, k]));
function firstWordForms(street) {
  const w = street.split(' ')[0] || '';
  return [...new Set([w, LONG[w], ABBR[w]].filter(Boolean))];
}
function distM(lat1, lng1, lat2, lng2) {
  const k = Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
  return Math.hypot((lng2 - lng1) * k * 111320, (lat2 - lat1) * 110540);
}

const normTown = s => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
// Town names found in both Massachusetts and New Hampshire.
const BOTH_STATES = new Set(['SALEM', 'HUDSON', 'KINGSTON', 'NEWTON', 'BEDFORD', 'SALISBURY', 'WINDHAM', 'AUBURN', 'CHESTER',
  'PELHAM', 'AMHERST', 'MILFORD', 'CONCORD', 'DOVER', 'PLYMOUTH', 'ROCHESTER', 'MANCHESTER', 'LEE', 'HAMPSTEAD']);
/**
 * Keep the candidate records that are in the address's own town. Pure, tested.
 * known = the geocoder's town plus whatever the visitor typed after the street.
 * A record whose town is one of those is kept. When none is, the records are
 * kept only if the known names are not towns on any candidate at all (a
 * village name such as Bradford for Haverhill) and they all sit in one town.
 */
export function sameTown(rows, gcTown, typedParts) {
  const known = new Set([gcTown, ...(typedParts || [])].filter(Boolean));
  if (!known.size) return rows;
  const hit = rows.filter(a => known.has(normTown(a.CITY)));
  if (hit.length) return hit;
  const towns = new Set(rows.map(a => normTown(a.CITY)).filter(Boolean));
  // The geocoder named a real town and no record is in it: wrong house.
  if (gcTown && MA_TOWNS_NEARBY.has(gcTown)) return [];
  return towns.size <= 1 ? rows : [];
}
// The towns Kaim works in: when the geocoder says one of these, a record from
// any other town is never this house.
const MA_TOWNS_NEARBY = new Set(['METHUEN', 'ANDOVER', 'NORTH ANDOVER', 'LAWRENCE', 'HAVERHILL', 'LOWELL', 'DRACUT', 'TEWKSBURY',
  'BOXFORD', 'GEORGETOWN', 'GROVELAND', 'MERRIMAC', 'WEST NEWBURY', 'NORTH READING', 'MIDDLETON', 'WILMINGTON', 'CHELMSFORD',
  'TYNGSBOROUGH', 'NEWBURYPORT', 'AMESBURY', 'READING', 'BILLERICA']);

/**
 * Typed address -> the assessor record for that house.
 * The parcel layer is asked for that house number on streets starting with
 * the same word (a plain attribute search, well under a second; searching by
 * map area takes 10 seconds or more), and the Census geocoder says where the
 * address is so a same-named street in another town is not picked.
 * Never throws: any failure is { ok:false, why } and the lead takes the
 * normal form path.
 */
export async function lookupHouse(address, fetchImpl = fetch) {
  try {
    const typed = String(address || '').trim();
    const num = houseNumber(typed), street = typedStreet(typed);
    if (!num || !street) return { ok: false, why: 'no_house_number' };
    if (/\b(NH|New Hampshire)\b/i.test(typed)) return { ok: false, why: 'not_ma' };
    // A New Hampshire zip, or a town name both states have with nothing that
    // says Massachusetts: no instant price, the lead takes the normal form.
    // ("12 Main St, Salem" was priced off the Salem MA house.)
    const zip = (typed.match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1] || '';
    if (zip.startsWith('03')) return { ok: false, why: 'not_ma' };
    const parts = typed.split(',').slice(1).map(normTown).filter(Boolean);
    const saysMA = /\b(MA|Massachusetts)\b/i.test(typed) || /^0[12]/.test(zip);
    if (!saysMA && parts.some(p => BOTH_STATES.has(p))) return { ok: false, why: 'state_unclear' };
    // The zip is dropped: the form's address suggestions sometimes carry a
    // neighbouring town's zip ("3 Bedford Place, Andover, 01841"), which
    // sends the geocoder to the wrong town.
    const noZip = typed.replace(/,?\s*\d{5}(-\d{4})?\s*$/, '');
    const line = /\b(MA|Massachusetts)\b/i.test(noZip) ? noZip : noZip + ', MA';
    const likes = firstWordForms(street).map(w => `FULL_STR LIKE '${w.replace(/[^A-Z0-9]/g, '')}%'`).join(' OR ');
    const q = new URLSearchParams({
      where: `ADDR_NUM = '${normNum(num)}' AND (${likes})`,
      outFields: 'SITE_ADDR,ADDR_NUM,FULL_STR,CITY,RES_AREA,BLD_AREA,STORIES,STYLE,YEAR_BUILT,USE_CODE,USE_DESC,UNITS',
      returnGeometry: 'false', returnCentroid: 'true', outSR: '4326', f: 'json'
    });
    const [g, d] = await Promise.all([
      getJson(fetchImpl, CENSUS + '?' + new URLSearchParams({ address: line, benchmark: 'Public_AR_Current', format: 'json' }), 6000),
      getJson(fetchImpl, PARCELS + '?' + q, 6000)
    ]);
    const m = g && g.result && g.result.addressMatches && g.result.addressMatches[0];
    if (!m || !m.coordinates) return { ok: false, why: 'no_geocode' };
    if (m.addressComponents && m.addressComponents.state && m.addressComponents.state !== 'MA') return { ok: false, why: 'not_ma' };
    const lng = Number(m.coordinates.x), lat = Number(m.coordinates.y);
    // Only records within 2 miles of where the address really is.
    // ... and only records in the town the address is in: the same number on a
    // same-named street one town over is a different house. A record's town
    // must be the geocoder's town or one the visitor typed (a village name like
    // Bradford is neither, so a record with no town match is kept only when
    // every candidate is in one town AND that town was not contradicted).
    const gcTown = normTown(m.addressComponents && m.addressComponents.city);
    const near = ((d && d.features) || []).filter(f => f && f.centroid && distM(lat, lng, Number(f.centroid.y), Number(f.centroid.x)) <= 3200)
      .map(f => ({ ...(f.attributes || {}), _cx: f.centroid.x, _cy: f.centroid.y }));
    const rows = sameTown(near, gcTown, parts);
    const out = pickParcel(rows, num, street);
    if (out.ok) { out.lat = lat; out.lng = lng; }
    return out;
  } catch (e) {
    return { ok: false, why: 'lookup_failed' };
  }
}

// ---- the quote itself ------------------------------------------------------

export const CLEAN_ITEM = {
  desc: 'Gutter Cleaning',
  brief: '• Clear all leaves and debris from the gutters\n• Flush gutters and downspouts thoroughly to ensure proper drainage'
};
export const BRIGHT_ITEM = {
  desc: 'Gutter Brightening',
  brief: '• Specialized brightening solution applied to the exterior faces of all gutters to lift black streaks and tiger striping\n• Solution is brushed and rinsed to leave gutters looking bright and clean'
};

/** Set the quote's lines and totals for cleaning alone or cleaning + brightening. */
export function applyItems(est, withBright) {
  const iq = est.instant || {};
  const items = [{ ...CLEAN_ITEM, qty: 1, price: iq.clean, amount: iq.clean }];
  if (withBright) items.push({ ...BRIGHT_ITEM, qty: 1, price: iq.bright, amount: iq.bright });
  const sub = items.reduce((t, i) => t + i.amount, 0);
  const taxRate = Number(est.taxRate) || 0;
  const tax = Math.round(sub * taxRate) / 100;
  est.items = items;
  est.subtotal = sub; est.sub = sub; est.tax = tax; est.total = sub + tax;
  est.scope = 'Kaim Contracting will complete the following at the property: gutter cleaning'
    + (withBright ? ' and gutter brightening' : '')
    + '. All work includes protecting plants and landscaping, final cleanup and a walkthrough.';
  iq.withBright = !!withBright;
  est.instant = iq;
  return est;
}

function nyDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * A normal CRM quote (same shape the quote builder saves), already "sent",
 * for the price the visitor was shown. The caller unshifts it onto
 * db.estimates inside its compare-and-swap write.
 */
export function buildEstimate(db, client, house, price, variant, token, now = new Date()) {
  const est = {
    id: db._ne++, cid: client.id,
    clientName: `${client.first || ''} ${client.last || ''}`.trim(), clientAttn: '',
    clientEmail: client.email || '', clientPhone: client.phone || '',
    clientAddress: client.address || '', jobAddress: client.address || '',
    service: 'Gutter Cleaning',
    date: nyDate(now), due: nyDate(new Date(now.getTime() + 14 * 864e5)),
    notes: '', scope: '', ref: '', terms: '', paidDeposit: 0,
    portalDisplay: 'itemized', matCost: 0, labCost: 0,
    discountPct: 0, discountAmt: 0, discountType: 'pct', discountName: '',
    taxRate: parseFloat(db.settings && db.settings.tax) || 0,
    depPct: 0, dep: 0,
    status: 'sent', sentAt: now.toISOString(),
    salesperson: '', remindInvoice: false,
    token,
    instant: {
      v: variant, at: now.toISOString(),
      sqft: house.sqft, stories: house.stories,
      clean: price.clean, bright: price.bright
    }
  };
  return applyItems(est, false);
}
