// Self-serve estimate-visit booking: shared availability logic.
//
// The website's quote forms offer three open days for a free in-person
// estimate. A day's slots come from fixed windows (weekday evenings +
// Saturday mornings); a slot is blocked when the CRM calendar already has an
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

// Estimate windows. Weekday evenings after job hours, Saturday mornings —
// matches the availability Eric already quotes in the lead auto-reply.
// Overridable later via settings.webBooking.{weekdaySlots,satSlots,minLeadDays}.
const DEFAULTS = {
  weekdaySlots: ['16:30', '17:30'],
  satSlots: ['09:00', '10:00', '11:00'],
  minLeadDays: 2,     // earliest offer = 2 days out, so Eric can always veto
  scanDays: 21,
  maxVisitsPerDay: 2  // stop offering a day once it has this many visits
};

function isEstimateVisit(j) {
  return j && j.type === 'Estimate Visit' && j.status !== 'cancelled' && j.status !== 'completed' && j.status !== 'done';
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
    const taken = new Set(visits.map(j => String(j.time || '').trim().toUpperCase()));
    const free = slots.find(hm => !taken.has(hmToLabel(hm).toUpperCase()));
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
