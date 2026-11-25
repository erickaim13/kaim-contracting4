// One contact per person. COPY of kaim-crm/lib/dupes.js (the body between its DUPES-BODY marks);
// the rule and the reasons are written up there. Change both together.
// Same person = same first + last name AND the same phone or email. The older record is kept.

var REF_KEYS = { cid: 1, clientId: 1, linkedClientId: 1 };
// Fields that describe where the lead stands. They travel together, from whichever record is furthest along.
var STATE_KEYS = ['status', 'statusAt', 'lostAt', 'lostFrom', 'lostNote', 'lostReason', 'stale1At', 'stale2At'];
// Live work beats a fresh lead, a fresh lead beats finished work (they are asking again), anything beats a dead one.
var RANK = { invoiced: 9, scheduled: 8, approved: 7, estimate: 6, sent: 6, visit: 5, 'new': 4, paid: 3, completed: 3, declined: 2, dead: 1 };
var MAX_NUM = { val: 1, value: 1, ai_replies_sent: 1, lead_score: 1 };
// The latest form wins here: the instant quote it produced, and the ids that stop the same form saving twice.
var NEWEST = { iq: 1, webSubmitId: 1, metaLeadgenId: 1, metaFormId: 1 };
var TIME_KEYS = ['t', 'received', 'sent', 'at', 'ts', 'date'];

function p10(x) { var d = String(x || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function em(x) { return String(x || '').trim().toLowerCase(); }
function nameKey(c) {
  return ((c && c.first) || '').concat(' ', (c && c.last) || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function blank(v) { return v === undefined || v === null || v === ''; }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function rank(s) { return RANK[s] || 0; }
function when(c) { var t = Date.parse((c && c.addedRaw) || ''); return isNaN(t) ? null : t; }

function sameClient(a, b) {
  if (!a || !b || a === b || a.deleted || b.deleted) return false;
  var n = nameKey(a);
  if (!n || n !== nameKey(b)) return false;
  if (p10(a.phone) && p10(a.phone) === p10(b.phone)) return true;
  if (em(a.email) && em(a.email) === em(b.email)) return true;
  return false;
}

// Older first: by the date added when both have one, else by id.
function older(a, b) {
  var ta = when(a), tb = when(b);
  if (ta !== null && tb !== null && ta !== tb) return ta < tb ? a : b;
  return (+a.id || 0) <= (+b.id || 0) ? a : b;
}

function timeKey(list) {
  for (var i = 0; i < TIME_KEYS.length; i++) {
    var k = TIME_KEYS[i];
    if (list.every(function (x) { return isObj(x) && !blank(x[k]) && !isNaN(Date.parse(x[k])); })) return k;
  }
  return null;
}
// Two lists of texts / emails / photos: keep every row once, in the order the kept list already used.
function joinLists(a, b) {
  var seen = {}, out = [];
  // The same email or text stored on both records is one row (matched by its id when it has one).
  a.concat(b).forEach(function (x) { var k = isObj(x) && !blank(x.id) ? 'id:' + x.id : isObj(x) && !blank(x.rowid) ? 'rowid:' + x.rowid : JSON.stringify(x); if (!seen[k]) { seen[k] = 1; out.push(x); } });
  if (out.length === a.length) return a;
  var tk = timeKey(out);
  if (tk) {
    var src = a.length > 1 ? a : b;
    var desc = src.length > 1 && Date.parse(src[0][tk]) > Date.parse(src[src.length - 1][tk]);
    out.sort(function (x, y) { var d = Date.parse(x[tk]) - Date.parse(y[tk]); return desc ? -d : d; });
  }
  return out;
}
function joinText(a, b, sep) {
  var parts = [];
  [a, b].forEach(function (s) {
    String(s || '').split(sep).forEach(function (p) {
      p = p.trim();
      if (p && !parts.some(function (q) { return q.toLowerCase() === p.toLowerCase(); })) parts.push(p);
    });
  });
  return parts.join(sep);
}

// Fold `gone` (the newer record) into `keep` (the older one). Changes `keep` in place.
function fold(keep, gone) {
  var extraPriv = [], extraNote = [];

  // Where the lead stands.
  if (rank(gone.status) >= rank(keep.status)) {
    STATE_KEYS.forEach(function (k) { if (k in gone) keep[k] = gone[k]; else delete keep[k]; });
    if (!keep.statusAt) keep.statusAt = gone.addedRaw || new Date().toISOString();   // a returning lead is fresh today, not stale
  }

  // The latest service asked for leads; the earlier one is kept in the notes.
  var s1 = String(keep.service || '').trim(), s2 = String(gone.service || '').trim();
  if (s2 && s2.toLowerCase() !== s1.toLowerCase()) {
    if (s1) extraNote.push('Also asked about: ' + s1);
    keep.service = s2;
  }

  // A second number or address is never thrown away.
  if (p10(gone.phone) && p10(keep.phone) && p10(gone.phone) !== p10(keep.phone)) extraPriv.push('Other phone: ' + gone.phone);
  if (em(gone.email) && em(keep.email) && em(gone.email) !== em(keep.email)) extraPriv.push('Other email: ' + gone.email);
  if (String(gone.address || '').trim().length > String(keep.address || '').trim().length) keep.address = gone.address;

  keep.notes = joinText(joinText(keep.notes, gone.notes, '\n'), extraNote.join('\n'), '\n');
  keep.priv = joinText(joinText(keep.priv, gone.priv, ' · '), extraPriv.join(' · '), ' · ');

  var done = { id: 1, service: 1, notes: 1, priv: 1, address: 1, mergedFrom: 1 };
  STATE_KEYS.forEach(function (k) { done[k] = 1; });
  Object.keys(gone).forEach(function (k) {
    if (done[k]) return;
    var g = gone[k], h = keep[k];
    if (blank(g)) return;
    if (blank(h) || NEWEST[k]) { keep[k] = g; return; }
    if (Array.isArray(g) && Array.isArray(h)) { keep[k] = joinLists(h, g); return; }
    if (typeof g === 'boolean' && typeof h === 'boolean') { keep[k] = h || g; return; }      // do not text, opted out: either one counts
    if (typeof g === 'number' && typeof h === 'number') { if (MAX_NUM[k]) keep[k] = Math.max(h, g); return; }
    if (isObj(g) && isObj(h)) { Object.keys(g).forEach(function (f) { if (blank(h[f])) h[f] = g[f]; }); return; }
    // Two different plain values: the older record's stands (name, phone, source, date added).
  });

  keep.mergedFrom = (keep.mergedFrom || []).concat([gone.id], gone.mergedFrom || []);
  return keep;
}

// Point everything that referenced the removed record at the kept one. Walks the whole CRM except the client list.
function repoint(node, map) {
  if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) repoint(node[i], map); return; }
  if (!isObj(node)) return;
  Object.keys(node).forEach(function (k) {
    var v = node[k];
    if (REF_KEYS[k] && (typeof v === 'number' || typeof v === 'string') && Object.prototype.hasOwnProperty.call(map, String(v))) {
      node[k] = typeof v === 'number' ? map[String(v)] : String(map[String(v)]);
    } else if (v && typeof v === 'object') repoint(v, map);
  });
}

/**
 * Merge every duplicated contact in `db` (changed in place).
 * @returns {Array<{keep:number, gone:number, name:string}>} one entry per record folded away; empty when nothing matched.
 */
function mergeDupClients(db) {
  if (!db || !Array.isArray(db.clients) || db.clients.length < 2) return [];
  var list = db.clients, merged = [], map = {}, removed = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a || removed.indexOf(a) >= 0) continue;
    for (var j = i + 1; j < list.length; j++) {
      var b = list[j];
      if (!b || removed.indexOf(b) >= 0 || !sameClient(a, b)) continue;
      var keep = older(a, b), gone = keep === a ? b : a;
      fold(keep, gone);
      // The kept record takes the higher spot in the list (newest leads sit on top).
      if (keep === b) { list[i] = b; list[j] = a; }
      removed.push(gone);
      map[String(gone.id)] = keep.id;
      merged.push({ keep: keep.id, gone: gone.id, name: ((keep.first || '') + ' ' + (keep.last || '')).trim() });
      a = keep;
    }
  }
  if (!merged.length) return [];
  db.clients = list.filter(function (c) { return removed.indexOf(c) < 0; });
  // A record folded into one that was itself folded away: follow the chain to the survivor.
  Object.keys(map).forEach(function (k) { var t = map[k], n = 0; while (Object.prototype.hasOwnProperty.call(map, String(t)) && n++ < 20) t = map[String(t)]; map[k] = t; });
  Object.keys(db).forEach(function (k) { if (k !== 'clients') repoint(db[k], map); });
  return merged;
}

export { mergeDupClients, sameClient, fold };
