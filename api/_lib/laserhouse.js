// House size and story count from the public airplane laser scan (USGS 3DEP
// lidar), for towns with no assessor record we can read: New Hampshire.
//
// Massachusetts houses are priced off the town record (instant.js). New
// Hampshire publishes the lot and what it is used for, but not the house size.
// So for a New Hampshire address the building outline (FEMA USA Structures) is
// laid over the laser scan: every square metre of roof has a measured height
// above the ground, and a roof 9 feet up has one floor under it, a roof 18
// feet up has two. Adding the floors up gives a living area close to what an
// assessor would write down, and the share of the roof that is two floors up
// says whether it is a one or a two story house.
//
// The numbers in RULE were fitted on 125 Massachusetts single family houses
// (2026-11-20), where the town record gives the real answer: the price off the
// laser was the same as the price off the record on 7 in 10, within $25 on 8
// in 10, and $75 or more apart on about 1 in 8 (finished basements and attics
// the laser cannot see, big attached garages, outlines that miss an addition).
//
// cellHeights() and houseFromCells() are pure and tested. laserPoints() does
// the downloading: the scan is published as an octree of small files, so one
// house is about 20 small downloads.

const D2R = Math.PI / 180, SQM_TO_SQFT = 10.7639104, R_EARTH = 6378137;
const BUCKET = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/';
// Newest first. Each is tried in turn until one has roof points for the house.
const SOURCES = [
  { name: 'MA_CentralEastern_1_2021', box: [-72.2, 41.2, -69.8, 42.95] },
  { name: 'NH_Coastal_1_2019', box: [-71.75, 42.6, -70.5, 43.6] },
  { name: 'NH_Coastal_2_2019', box: [-71.75, 42.6, -70.5, 43.6] }
];

export const RULE = {
  areaAt: 5.8,     // metres above the ground: roof at or above this has two floors of house under it
  storyAt: 6.1,    // roof at or above this is two story roofline
  twoShare: 0.5,   // share of the roof at two story height that makes it a two story house
  floor3: 8.8,     // roof this high over most of the house is a three story (no instant price)
  threeShare: 0.6,
  k1: 0.8,         // outline x floors -> living area, one story (overhangs, garage, porches)
  k2: 0.9,         // ... two story
  minCover: 0.6    // share of the outline the laser must have seen
};

const mercX = lng => R_EARTH * lng * D2R;
const mercY = lat => R_EARTH * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
function pointIn(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringArea(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return Math.abs(a) / 2; }
const median = arr => { const s = Array.from(arr).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * pts: { x, y, z, c } arrays, metres, x east / y north (same origin as ring), c = lidar class.
 * ring: the building outline [[x, y], ...].
 * -> { areaM2, cells, heights } : the outline's area, how many one-metre cells
 *    are inside it, and the roof height above the ground of each cell the
 *    laser saw. null when there is nothing to read.
 * A cell's height is its second lowest roof point, so a tree hanging over the
 * roof does not count as a taller house.
 */
export function cellHeights(pts, ring) {
  const n = pts.x.length;
  if (n < 60 || !ring || ring.length < 3) return null;
  const areaM2 = ringArea(ring);
  if (areaM2 < 30) return null;
  const gz = [];
  for (let i = 0; i < n; i++) if (pts.c[i] === 2) gz.push(pts.z[i]);
  let ground;
  if (gz.length >= 20) ground = median(gz);
  else { const all = Array.from(pts.z).sort((a, b) => a - b); ground = all[Math.floor(all.length * 0.05)]; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ring.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  const w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
  if (w < 3 || h < 3 || w * h > 40000) return null;
  const byCell = new Map();
  for (let i = 0; i < n; i++) {
    const c = pts.c[i], up = pts.z[i] - ground;
    if (c === 2 || c === 7 || c === 18 || up < 1.8 || up > 30) continue;
    const gx = Math.floor(pts.x[i] - x0), gy = Math.floor(pts.y[i] - y0);
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
    const k = gy * w + gx;
    let a = byCell.get(k); if (!a) byCell.set(k, a = []);
    a.push(up);
  }
  let cells = 0; const heights = [];
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    if (!pointIn(ring, x0 + gx + 0.5, y0 + gy + 0.5)) continue;
    cells++;
    const a = byCell.get(gy * w + gx);
    if (!a) continue;
    a.sort((p, q) => p - q);
    heights.push(a[Math.min(1, a.length - 1)]);
  }
  if (!cells) return null;
  return { areaM2, cells, heights };
}

/**
 * The cells of one house -> { ok:true, sqft, stories, footSqft, twoShare } or { ok:false, why }.
 * stories is 1 or 2, the same two cases the price rule knows.
 */
export function houseFromCells(m, rule = RULE) {
  if (!m || !m.heights || !m.cells) return { ok: false, why: 'no_laser' };
  const seen = m.heights.length;
  if (seen < 30 || seen / m.cells < rule.minCover) return { ok: false, why: 'laser_thin' };
  let hi = 0, f3 = 0, floors = 0;
  for (const up of m.heights) {
    if (up >= rule.storyAt) hi++;
    if (up >= rule.floor3) f3++;
    floors += up >= rule.areaAt ? 2 : 1;
  }
  if (f3 / seen >= rule.threeShare) return { ok: false, why: 'three_story' };
  const footSqft = m.areaM2 * SQM_TO_SQFT, twoShare = hi / seen;
  const stories = twoShare >= rule.twoShare ? 2 : 1;
  return {
    ok: true, stories,
    sqft: Math.round(footSqft * (floors / seen) * (stories === 2 ? rule.k2 : rule.k1)),
    footSqft: Math.round(footSqft), twoShare: Math.round(twoShare * 100) / 100
  };
}

// ── reading the scan ──────────────────────────────────────────────────────────
let _lp = null;
async function lazPerf(mod) {
  if (!_lp) {
    const pkg = mod || await import('laz-perf');
    const make = pkg.createLazPerf || (pkg.default && pkg.default.createLazPerf);
    _lp = make();
  }
  return _lp;
}
/** One .laz file -> the points inside the box (Web Mercator metres). */
async function readLaz(LP, buf, box, out) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fmt = dv.getUint8(104) & 0x3f, recLen = dv.getUint16(105, true), count = dv.getUint32(107, true);
  const sc = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)], of = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
  const fp = LP._malloc(buf.byteLength), dp = LP._malloc(recLen), zip = new LP.LASZip();
  try {
    LP.HEAPU8.set(buf, fp); zip.open(fp, buf.byteLength);
    for (let i = 0; i < count; i++) {
      zip.getPoint(dp);
      const pv = new DataView(LP.HEAPU8.buffer, dp, recLen);
      const x = pv.getInt32(0, true) * sc[0] + of[0], y = pv.getInt32(4, true) * sc[1] + of[1];
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
      out.x.push(x); out.y.push(y); out.z.push(pv.getInt32(8, true) * sc[2] + of[2]);
      out.c.push(fmt >= 6 ? pv.getUint8(16) : pv.getUint8(15) & 0x1f);
    }
  } finally { zip.delete(); LP._free(fp); LP._free(dp); }
}
const _ept = new Map();
async function getJson(fetchImpl, url, ms) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('lidar http ' + r.status);
  return r.json();
}
async function pointsFrom(fetchImpl, LP, src, box) {
  const root = BUCKET + src + '/';
  if (!_ept.has(src)) _ept.set(src, await getJson(fetchImpl, root + 'ept.json', 6000));
  const ept = _ept.get(src), B = ept.bounds, hcache = new Map(), nodes = [];
  if (String((ept.srs || {}).horizontal) !== '3857' || ept.dataType !== 'laszip') throw new Error('lidar format');
  const hier = async key => { if (!hcache.has(key)) hcache.set(key, await getJson(fetchImpl, root + 'ept-hierarchy/' + key + '.json', 6000)); return hcache.get(key); };
  const walk = async (d, x, y, z, hmap) => {
    const s = (B[3] - B[0]) / Math.pow(2, d), bx = B[0] + x * s, by = B[1] + y * s;
    if (bx > box[2] || bx + s < box[0] || by > box[3] || by + s < box[1]) return;
    const key = d + '-' + x + '-' + y + '-' + z; let cnt = hmap[key];
    if (cnt == null) return;
    if (cnt === -1) { hmap = await hier(key); cnt = hmap[key]; }
    if (!cnt || cnt < 0) return;
    nodes.push(key);
    if (nodes.length > 90) throw new Error('lidar too many files');
    for (let i = 0; i < 8; i++) await walk(d + 1, 2 * x + (i & 1), 2 * y + ((i >> 1) & 1), 2 * z + ((i >> 2) & 1), hmap);
  };
  await walk(0, 0, 0, 0, await hier('0-0-0-0'));
  nodes.sort();
  const parts = nodes.map(() => ({ x: [], y: [], z: [], c: [] })); let next = 0;
  const worker = async () => {
    while (next < nodes.length) {
      const i = next++;
      const r = await fetchImpl(root + 'ept-data/' + nodes[i] + '.laz', { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('lidar http ' + r.status);
      await readLaz(LP, new Uint8Array(await r.arrayBuffer()), box, parts[i]);
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  const out = { x: [], y: [], z: [], c: [] };
  parts.forEach(q => { for (let i = 0; i < q.x.length; i++) { out.x.push(q.x[i]); out.y.push(q.y[i]); out.z.push(q.z[i]); out.c.push(q.c[i]); } });
  return out;
}

/**
 * ring: the building outline [[lng, lat], ...] -> the cells of that house
 * ({ areaM2, cells, heights, src }) or null when no scan covers it.
 * deps.lazPerf lets a script hand in the laz-perf module from somewhere else.
 */
export async function laserCells(ring, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const LP = await lazPerf(deps.lazPerf);
  let lng = 0, lat = 0; ring.forEach(p => { lng += p[0]; lat += p[1]; }); lng /= ring.length; lat /= ring.length;
  const k = Math.cos(lat * D2R), cx = mercX(lng), cy = mercY(lat);
  const xs = ring.map(p => mercX(p[0])), ys = ring.map(p => mercY(p[1])), pad = 9 / k;
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const local = ring.map((p, i) => [(xs[i] - cx) * k, (ys[i] - cy) * k]);
  for (const src of SOURCES) {
    if (lng < src.box[0] || lng > src.box[2] || lat < src.box[1] || lat > src.box[3]) continue;
    let raw;
    try { raw = await pointsFrom(fetchImpl, LP, src.name, box); } catch (e) { continue; }
    if (raw.x.length < 60) continue;
    const pts = { x: raw.x.map(v => (v - cx) * k), y: raw.y.map(v => (v - cy) * k), z: raw.z, c: raw.c };
    const m = cellHeights(pts, local);
    if (m && m.heights.length >= 30) return { ...m, src: src.name };
  }
  return null;
}
