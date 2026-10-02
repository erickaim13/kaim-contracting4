// Self-serve estimate-visit booking: shared availability logic.
//
// The website's quote forms offer three open days for a free in-person
// estimate. A day's slots come from fixed windows (weekday evenings +
// Saturday afternoons); a slot is blocked when the CRM calendar already has an
// Estimate Visit at that date+time, and a whole day is skipped when it
// already carries 2+ estimate visits or is listed in
// settings.webBooking.blockedDates. All date math is done in Eastern time —
// Vercel runs in UTC, so never use plain new Date() calendar parts here.

const NY_TZ = 'America/New_York';

// ---- Eastern-time helpers -------------------------------------------------

/** Y-M-D + weekday for a Date, as seen on Eric's (Eastern) calendar. */
export function nyParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday,                       // 'Mon'..'Sun'
    hour: Number(p.hour === '24' ? 0 : p.hour),
    minute: Number(p.minute)
  };
}

/** UTC Date for an Eastern-local wall time like ('2026-09-03','16:30'). */
export function nyToUtc(dateStr, hm) {
  const [h, m] = hm.split(':').map(Number);
  // First guess: treat the wall time as UTC, then correct by the zone offset
  // observed at that instant (stable across the DST boundary for our use).
  let guess = new Date(`${dateStr}T${hm}:00Z`);
  for (let i = 0; i < 2; i++) {
    const seen = nyParts(guess);
    const wantMin = h * 60 + m, seenMin = seen.hour * 60 + seen.minute;
    let diff = wantMin - seenMin;
    if (seen.date !== dateStr) diff += seen.date < dateStr ? 1440 : -1440;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff * 60000);
  }
  return guess;
}

/** '16:30' -> '4:30 PM' (the format CRM jobs use in job.time). */
export function hmToLabel(hm) {
  let [h, m] = hm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

/** 'Wednesday, September 3' for a Y-M-D. */
export function dateLabel(dateStr) {
  return nyToUtc(dateStr, '12:00').toLocaleDateString('en-US', {
    timeZone: NY_TZ, weekday: 'long', month: 'long', day: 'numeric'
  });
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  return nyToUtc(dateStr, '12:00').toLocaleDateString('en-US', { timeZone: NY_TZ, weekday: 'short' });
}

// ---- Availability ---------------------------------------------------------

// Estimate windows: weekday evenings from 5, Saturday afternoons from 12:30.
// Same rules as the AI scheduler (kaim-crm/mac/slots.py), keep them in step:
// a visit starts at least daylightBufferMin before sunset (no estimates in
// the dark), and two visits are at least visitGapMin apart (the visit plus
// the drive to the next one).
// Overridable later via settings.webBooking.{weekdaySlots,satSlots,minLeadDays}.
const DEFAULTS = {
  weekdaySlots: ['17:00', '18:00', '19:00'],
  satSlots: ['12:30', '13:30', '14:30', '15:30'],
  minLeadDays: 2,     // earliest offer = 2 days out, so Eric can always veto
  scanDays: 21,
  maxVisitsPerDay: 2, // stop offering a day once it has this many visits
  visitGapMin: 60,
  daylightBufferMin: 30
};

function isEstimateVisit(j) {
  return j && j.type === 'Estimate Visit' && j.status !== 'cancelled' && j.status !== 'completed' && j.status !== 'done';
}

/** Sunset in Methuen for a Y-M-D, as Eastern minutes after midnight (NOAA method). */
export function sunsetMinutes(dateStr) {
  const LAT = 42.73, LON = -71.19;
  const d = new Date(`${dateStr}T00:00:00Z`);
  const n = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  const g = 2 * Math.PI / 365 * (n - 1 + 0.5);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = LAT * Math.PI / 180;
  const ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(decl))
    - Math.tan(lat) * Math.tan(decl)) * 180 / Math.PI;
  const utcMin = 720 - 4 * (LON - ha) - eqtime;
  const p = nyParts(new Date(d.getTime() + utcMin * 60000));
  return p.hour * 60 + p.minute;
}

/** '6:30 PM' or '18:30' -> minutes after midnight, or null. */
function timeToMin(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] || 0), ap = (m[3] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/**
 * Compute up to `count` bookable {date, time} day-options.
 * @param {Array} jobs       crm_data.jobs
 * @param {Object} settings  crm_data.settings (webBooking overrides optional)
 * @param {Date}   now
 */
export function computeOpenDays(jobs, settings = {}, now = new Date(), count = 3) {
  const cfg = { ...DEFAULTS, ...(settings.webBooking || {}) };
  const blocked = new Set(cfg.blockedDates || []);
  const today = nyParts(now).date;
  const out = [];
  for (let i = cfg.minLeadDays; i <= cfg.scanDays && out.length < count; i++) {
    const date = addDays(today, i);
    if (blocked.has(date)) continue;
    const wd = weekdayOf(date);
    if (wd === 'Sun') continue;
    const slots = wd === 'Sat' ? cfg.satSlots : cfg.weekdaySlots;
    const visits = (jobs || []).filter(j => isEstimateVisit(j) && j.start === date);
    if (visits.length >= cfg.maxVisitsPerDay) continue;
    // A visit with no readable time counts as holding the day's first slot.
    const taken = visits.map(j => timeToMin(j.time) ?? timeToMin(slots[0]));
    const cutoff = sunsetMinutes(date) - cfg.daylightBufferMin;
    const free = slots.find(hm => {
      const t = timeToMin(hm);
      return t <= cutoff && !taken.some(v => Math.abs(v - t) < cfg.visitGapMin);
    });
    if (!free) continue;
    out.push({ date, time: hmToLabel(free), hm: free });
  }
  return out;
}

/** True when (date, timeLabel) is one of the currently offered options. */
export function slotIsOpen(jobs, settings, date, timeLabel, now = new Date()) {
  const days = computeOpenDays(jobs, settings, now, 10);
  return days.some(d => d.date === date && d.time.toUpperCase() === String(timeLabel).trim().toUpperCase());
}
