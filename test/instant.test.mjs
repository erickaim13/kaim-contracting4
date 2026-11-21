// node --test test/instant.test.mjs      (LIVE=1 also hits the real lookups)
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceHouse, iqConfig, pickParcel, houseNumber, lookupHouse, buildEstimate, applyItems, IQ_DEFAULTS } from '../api/_lib/instant.js';

test('price: minimum, rate in between, maximum', () => {
  assert.deepEqual(priceHouse(1332, 1), { clean: 199, bright: 175 });
  assert.deepEqual(priceHouse(2004, 2), { clean: 199, bright: 175 });
  assert.equal(priceHouse(2157, 2).clean, 199);
  assert.equal(priceHouse(2400, 2).clean, 225);
  assert.deepEqual(priceHouse(3744, 2), { clean: 350, bright: 300 });
  assert.equal(priceHouse(3000, 1).clean, 250);
});
test('price: a cape (1.5) is priced as one story', () => {
  assert.equal(priceHouse(3000, 1.5).clean, 250);
  assert.equal(priceHouse(2600, 2).clean, 250);
});
test('price: nothing for houses outside the range', () => {
  assert.equal(priceHouse(14704, 2), null);
  assert.equal(priceHouse(400, 1), null);
  assert.equal(priceHouse(2000, 3), null);
  assert.equal(priceHouse(2000, 0), null);
  assert.equal(priceHouse(0, 2), null);
});
test('config: his numbers win, blanks fall back', () => {
  const cfg = iqConfig({ pq: { iqCleanMin: 275, iqCleanMax: '', iqShare: 50, gutter: 1.5 } });
  assert.equal(cfg.iqCleanMin, 275);
  assert.equal(cfg.iqCleanMax, IQ_DEFAULTS.iqCleanMax);
  assert.equal(cfg.iqShare, 50);
  assert.equal(priceHouse(1500, 1, cfg).clean, 275);
  assert.equal(iqConfig(null).iqShare, 0);
});
test('house number', () => {
  assert.equal(houseNumber('7 Alpine Dr, Haverhill'), '7');
  assert.equal(houseNumber(' 12a Oak Hill Rd'), '12A');
  assert.equal(houseNumber('North Andover'), '');
});
const row = (o) => ({ ADDR_NUM: '7', FULL_STR: 'ALPINE DR', USE_CODE: '101', RES_AREA: 2004, STORIES: '2', UNITS: 1, SITE_ADDR: '7  ALPINE DR', CITY: 'HAVERHILL', ...o });
test('parcel: the matching single family house', () => {
  const r = pickParcel([row({ ADDR_NUM: '9', RES_AREA: 9999 }), row()], '7', 'Alpine Drive');
  assert.equal(r.ok, true); assert.equal(r.sqft, 2004); assert.equal(r.stories, 2); assert.equal(r.addr, '7 ALPINE DR');
});
test('parcel: neighbour, other street, condo, school, blanks are refused', () => {
  assert.equal(pickParcel([row({ ADDR_NUM: '9' })], '7', 'ALPINE DR').why, 'no_record');
  assert.equal(pickParcel([row({ FULL_STR: 'OAK HILL RD' })], '7', 'ALPINE DR').why, 'no_record');
  assert.equal(pickParcel([row(), row()], '7', 'ALPINE DR').why, 'not_single_family');
  assert.equal(pickParcel([row({ UNITS: 2 })], '7', 'ALPINE DR').why, 'not_single_family');
  assert.equal(pickParcel([row({ USE_CODE: '934' })], '7', 'ALPINE DR').why, 'not_single_family');
  assert.equal(pickParcel([row({ RES_AREA: 0 })], '7', 'ALPINE DR').why, 'no_size');
  assert.equal(pickParcel([row({ STORIES: null })], '7', 'ALPINE DR').why, 'no_stories');
});
test('lookup: no number, NH, and a dead network never throw', async () => {
  assert.equal((await lookupHouse('North Andover', () => { throw new Error('x'); })).why, 'no_house_number');
  assert.equal((await lookupHouse('5 Main St, Salem, NH', () => { throw new Error('x'); })).why, 'lookup_failed');
  assert.equal((await lookupHouse('5 Main St, Methuen', () => Promise.reject(new Error('down')))).why, 'lookup_failed');
});
test('quote: cleaning alone, then with brightening, then without', () => {
  const db = { _ne: 1400, settings: { tax: '0' } };
  const cl = { id: 9, first: 'Pat', last: 'Lee', phone: '978-555-0100', email: '', address: '7 Alpine Dr, Haverhill' };
  const est = buildEstimate(db, cl, { sqft: 2400, stories: 2 }, { clean: 300, bright: 250 }, 'b', 'a'.repeat(40), new Date('2026-11-20T15:00:00Z'));
  assert.equal(est.id, 1400); assert.equal(db._ne, 1401);
  assert.equal(est.status, 'sent'); assert.equal(est.total, 300); assert.equal(est.items.length, 1);
  assert.equal(est.date, '2026-11-20'); assert.equal(est.due, '2026-12-04'); assert.equal(est.depPct, 0);
  applyItems(est, true);
  assert.equal(est.total, 550); assert.equal(est.items[1].desc, 'Gutter Brightening'); assert.match(est.scope, /and gutter brightening/);
  applyItems(est, false);
  assert.equal(est.total, 300); assert.equal(est.instant.withBright, false);
});
test('LIVE: real addresses', { skip: !process.env.LIVE }, async () => {
  const a = await lookupHouse('7 Alpine Dr, Haverhill');
  assert.equal(a.ok, true); assert.equal(a.sqft, 2004); assert.equal(a.stories, 2);
  for (const q of ['3 Bedford Place, Andover, Massachusetts, 01841', '163 Old Ferry Drive, Methuen, Massachusetts, 01844', '21 Braewood dr, Bradford', '59 Marblehead Street, North Reading', '9 West Hollow, Andover', '87 Hay Meadow Road, North Andover', '1 West Lowell Street, Lawrence', '8 Oak Hill Road, Haverhill, MA', '10 Robandy Rd, Andover', '11 Archelaus Hill Rd, West Newbury']) {
    const r = await lookupHouse(q);
    console.log(q, '->', JSON.stringify(r), JSON.stringify(r.ok ? priceHouse(r.sqft, r.stories) : null));
  }
});
import { normStreet, typedStreet } from '../api/_lib/instant.js';
test('street names match across spellings', () => {
  assert.equal(typedStreet('163 Old Ferry Drive, Methuen, Massachusetts, 01844'), 'OLD FERRY DR');
  assert.equal(typedStreet('9 West Hollow, Andover'), normStreet('WEST HOLLOW'));
  assert.equal(typedStreet('1 West Lowell Street'), normStreet('W LOWELL ST'));
  assert.equal(typedStreet('3 Bedford Place'), 'BEDFORD PL');
  assert.equal(typedStreet('12a Oak Hill Rd Apt 2, Haverhill'), 'OAK HILL RD');
  assert.equal(pickParcel([row({ SITE_ADDR: '163 OLD FERRY DR LT 3', ADDR_NUM: '163', FULL_STR: 'OLD FERRY DR', STORIES: '2A', RES_AREA: 1920 })], '163', 'Old Ferry Drive').stories, 2);
  assert.equal(pickParcel([row({ USE_CODE: '1010', UNITS: 0 })], '7', 'alpine dr').ok, true);
});

import { sameTown } from '../api/_lib/instant.js';
test('lookup: a two-state town name with no state gets no instant price', async () => {
  const dead = () => { throw new Error('x'); };
  assert.equal((await lookupHouse('12 Main St, Salem, 03079', dead)).why, 'lookup_failed');   // New Hampshire: measured, and the network is down
  assert.equal((await lookupHouse('12 Main St, Salem', dead)).why, 'state_unclear');
  assert.equal((await lookupHouse('12 Main St, Hudson', dead)).why, 'state_unclear');
  // Massachusetts said outright, or a Massachusetts zip: carries on to the lookup
  assert.equal((await lookupHouse('12 Main St, Salem, MA', () => Promise.reject(new Error('down')))).why, 'lookup_failed');
  assert.equal((await lookupHouse('12 Main St, Bedford, 01730', () => Promise.reject(new Error('down')))).why, 'lookup_failed');
  assert.equal((await lookupHouse('5 Main St, Methuen', () => Promise.reject(new Error('down')))).why, 'lookup_failed');
});
test('lookup: the same number on a same-named street one town over is not this house', () => {
  const law = { CITY: 'LAWRENCE' }, met = { CITY: 'METHUEN' }, hav = { CITY: 'HAVERHILL' };
  assert.deepEqual(sameTown([law], 'METHUEN', ['METHUEN']), []);
  assert.deepEqual(sameTown([law, met], 'METHUEN', ['METHUEN']), [met]);
  assert.deepEqual(sameTown([hav], 'HAVERHILL', ['BRADFORD']), [hav]);   // village typed, geocoder names the town
  assert.deepEqual(sameTown([hav], 'BRADFORD', ['BRADFORD']), [hav]);    // village on both: one town of records, kept
  assert.deepEqual(sameTown([hav, law], 'BRADFORD', ['BRADFORD']), []);
  assert.deepEqual(sameTown([hav], '', []), [hav]);
});
test('brightening (the upsell) always comes out under the cleaning price', () => {
  for (const [a, st] of [[1332, 1], [2004, 2], [2600, 1], [3744, 2], [4900, 2], [3000, 1.5]]) {
    const p = priceHouse(a, st); assert.ok(p.bright < p.clean, a + ' sq ft');
  }
  // even when the CRM numbers would put it above
  const p = priceHouse(2400, 2, iqConfig({ pq: { iqBrightMin: 400, iqBrightMax: 500 } }));
  assert.equal(p.clean, 225); assert.equal(p.bright, 200);
});
test('parcel: a two family is priced, three families and up are not', () => {
  const two = pickParcel([row({ USE_CODE: '104', UNITS: 2, RES_AREA: 2954, STORIES: '2H' })], '7', 'ALPINE DR');
  assert.equal(two.ok, true); assert.equal(two.twoFamily, true); assert.equal(two.sqft, 2954); assert.equal(two.stories, 2);
  assert.equal(pickParcel([row({ USE_CODE: '1040', UNITS: 0 })], '7', 'ALPINE DR').ok, true);
  assert.equal(pickParcel([row()], '7', 'ALPINE DR').twoFamily, false);
  assert.equal(pickParcel([row({ USE_CODE: '104', UNITS: 3 })], '7', 'ALPINE DR').why, 'not_single_family');
  assert.equal(pickParcel([row({ USE_CODE: '105', UNITS: 3 })], '7', 'ALPINE DR').why, 'not_single_family');
  assert.equal(pickParcel([row({ USE_CODE: '102' })], '7', 'ALPINE DR').why, 'not_single_family');   // condo
});

// ---- New Hampshire: lot record + building outline + laser scan --------------
import { nhTown, pickNhParcel, pickBuilding } from '../api/_lib/instant.js';
import { cellHeights, houseFromCells } from '../api/_lib/laserhouse.js';
test('NH: the town out of the typed address', () => {
  assert.equal(nhTown('101 Bluff St, Salem, NH 03079'), 'SALEM');
  assert.equal(nhTown('101 Bluff St, Salem NH'), 'SALEM');
  assert.equal(nhTown('5 Elm St, North Hampton, New Hampshire'), 'NORTH HAMPTON');
  assert.equal(nhTown('5 Elm St, Pelham, 03076'), 'PELHAM');
  assert.equal(nhTown('7 Alpine Dr, Haverhill, MA 01830'), '');
  assert.equal(nhTown('5 Elm St, NH'), '');
});
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const lotRow = (o) => ({ attributes: { StreetAddress: '101 BLUFF ST', Town: 'Salem', SLU: '11', ...o }, geometry: { rings: [sq(0, 0, 10)] } });
test('NH: the single family lot at that address, nothing else', () => {
  const r = pickNhParcel([lotRow({ StreetAddress: '101 N MAIN ST' }), lotRow()], '101', 'Bluff Street');
  assert.equal(r.ok, true); assert.equal(r.addr, '101 BLUFF ST'); assert.equal(r.city, 'Salem');
  assert.equal(pickNhParcel([lotRow({ StreetAddress: '101  BLUFF ST', SLU: '11-70' })], '101', 'BLUFF ST').ok, true);
  assert.equal(pickNhParcel([lotRow({ StreetAddress: '1010 BLUFF ST' })], '101', 'BLUFF ST').why, 'no_record');
  assert.equal(pickNhParcel([lotRow({ SLU: '12' })], '101', 'BLUFF ST').why, 'not_single_family');   // 2 to 4 units
  assert.equal(pickNhParcel([lotRow({ SLU: '22' })], '101', 'BLUFF ST').why, 'not_single_family');   // empty lot
  assert.equal(pickNhParcel([lotRow(), lotRow()], '101', 'BLUFF ST').why, 'not_single_family');
});
const bld = (lng, lat, sqft) => ({ attributes: { LONGITUDE: lng, LATITUDE: lat, SQFEET: sqft }, geometry: { rings: [sq(lng, lat, 1)] } });
test('NH: the house is the biggest building on the lot, not the shed or the neighbour', () => {
  const lot = sq(0, 0, 10);
  assert.equal(pickBuilding([bld(5, 5, 300), bld(3, 3, 1400), bld(20, 5, 3000)], lot).lng, 3);
  assert.equal(pickBuilding([bld(5, 5, 300)], lot), null);
  assert.equal(pickBuilding([bld(20, 5, 3000)], lot), null);
});
// A made-up scan: ground all round, a flat roof `up` metres high over a 12 x 10 m outline.
function scan(up, part) {
  const p = { x: [], y: [], z: [], c: [] };
  for (let x = -8; x < 20; x += 0.5) for (let y = -8; y < 18; y += 0.5) {
    const on = x >= 0 && x < 12 && y >= 0 && y < 10;
    p.x.push(x + 0.1); p.y.push(y + 0.1);
    if (on) { p.z.push(100 + (part && x >= 8 ? part : up)); p.c.push(1); } else { p.z.push(100); p.c.push(2); }
  }
  return p;
}
const outline = [[0, 0], [12, 0], [12, 10], [0, 10], [0, 0]];
test('laser: a low roof is a one story house, a high roof a two story with twice the floor', () => {
  const one = houseFromCells(cellHeights(scan(3.2), outline));
  assert.equal(one.ok, true); assert.equal(one.stories, 1); assert.equal(one.footSqft, 1292); assert.equal(one.sqft, 1033);
  const two = houseFromCells(cellHeights(scan(6.6), outline));
  assert.equal(two.stories, 2); assert.equal(two.sqft, 2325);
  // a two story house with a one story garage on a third of it is still a two story
  const mix = houseFromCells(cellHeights(scan(6.6, 3.2), outline));
  assert.equal(mix.stories, 2); assert.ok(mix.sqft > 1700 && mix.sqft < 2100, String(mix.sqft));
  assert.equal(houseFromCells(cellHeights(scan(9.5), outline)).why, 'three_story');
  assert.equal(houseFromCells(null).why, 'no_laser');
});
test('laser: a tree over the roof does not make the house taller', () => {
  const p = scan(3.2);
  for (let x = 0; x < 12; x += 0.5) for (let y = 0; y < 10; y += 0.5) { p.x.push(x + 0.3); p.y.push(y + 0.3); p.z.push(112); p.c.push(1); }
  assert.equal(houseFromCells(cellHeights(p, outline)).stories, 1);
});
test('NH lookup: lot, outline and laser put together; no network needed', async () => {
  const fake = async (url) => ({ ok: true, json: async () => String(url).includes('ParcelMosaic')
    ? { features: [{ attributes: { StreetAddress: '101 BLUFF ST', Town: 'Salem', SLU: '11' }, geometry: { rings: [sq(-71.2, 42.8, 0.001)] } }] }
    : { features: [bld(-71.1995, 42.8005, 1400)] } });
  const cells = async () => cellHeights(scan(6.6), outline);
  const r = await lookupHouse('101 Bluff Street, Salem, NH 03079', fake, { laserCells: cells });
  assert.equal(r.ok, true); assert.equal(r.laser, true); assert.equal(r.stories, 2); assert.equal(r.sqft, 2325); assert.equal(r.city, 'Salem');
  assert.equal(priceHouse(r.sqft, r.stories).clean, 225);
  // the scan has nothing over the house, or takes too long: no price, a normal lead
  assert.equal((await lookupHouse('101 Bluff Street, Salem, NH', fake, { laserCells: async () => null })).why, 'no_laser');
  assert.equal((await lookupHouse('101 Bluff Street, Salem, NH', fake, { laserCells: () => new Promise(() => { }), nhMs: 30 })).why, 'lookup_slow');
  assert.equal((await lookupHouse('9 Bluff Street, Salem, NH', fake, { laserCells: cells })).why, 'no_record');
});
test('LIVE: New Hampshire addresses', { skip: !process.env.LIVE }, async () => {
  for (const q of ['101 Bluff St, Salem, NH 03079', '101 Millville St, Salem, NH 03079', '101 Lawrence Rd, Salem, NH 03079', '12 Main St, Pelham, NH 03076', '20 Indian Rock Rd, Windham, NH 03087']) {
    const t = Date.now(), r = await lookupHouse(q);
    console.log(q, '->', Date.now() - t, 'ms', JSON.stringify(r), JSON.stringify(r.ok ? priceHouse(r.sqft, r.stories) : null));
  }
});
