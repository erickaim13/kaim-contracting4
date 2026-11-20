// node --test test/instant.test.mjs      (LIVE=1 also hits the real lookups)
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceHouse, iqConfig, pickParcel, houseNumber, lookupHouse, buildEstimate, applyItems, IQ_DEFAULTS } from '../api/_lib/instant.js';

test('price: minimum, rate in between, maximum', () => {
  assert.deepEqual(priceHouse(1332, 1), { clean: 250, bright: 200 });
  assert.deepEqual(priceHouse(2004, 2), { clean: 250, bright: 200 });
  assert.equal(priceHouse(2400, 2).clean, 300);
  assert.deepEqual(priceHouse(3744, 2), { clean: 350, bright: 300 });
  assert.equal(priceHouse(3000, 1).clean, 300);
});
test('price: a cape (1.5) is priced as one story', () => {
  assert.equal(priceHouse(3000, 1.5).clean, 300);
  assert.equal(priceHouse(2600, 2).clean, 300);
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
  assert.equal((await lookupHouse('5 Main St, Salem, NH', () => { throw new Error('x'); })).why, 'not_ma');
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
test('lookup: New Hampshire zip and two-state town names get no instant price', async () => {
  const dead = () => { throw new Error('x'); };
  assert.equal((await lookupHouse('12 Main St, Salem, 03079', dead)).why, 'not_ma');
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
    const p = priceHouse(a, st); assert.ok(p.bright <= p.clean - 25, a + ' sq ft');
  }
  // even when the CRM numbers would put it above
  const p = priceHouse(2400, 2, iqConfig({ pq: { iqBrightMin: 400, iqBrightMax: 500 } }));
  assert.equal(p.clean, 300); assert.equal(p.bright, 275);
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
