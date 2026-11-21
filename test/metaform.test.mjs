// Meta gutter form leads: reading the form's answers. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
const { parseFields, formAddress, gutterChoice } = await import('../api/meta-lead-webhook.js');

const F = (o) => Object.entries(o).map(([name, v]) => ({ name, values: [v] }));

test('gutter form: name, address and the question are read', () => {
  const p = parseFields(F({ first_name: 'Pat', last_name: 'Smith', phone_number: '+19785550142', email: 'p@example.com',
    street_address: '59 Marblehead St', city: 'North Andover', state: 'MA', zip_code: '01845',
    'what_do_you_need_done_to_your_gutters?': 'both' }));
  assert.equal(p.first, 'Pat'); assert.equal(p.phone, '+19785550142');
  assert.equal(formAddress(p), '59 Marblehead St, North Andover, MA 01845');
  assert.equal(gutterChoice(p, ''), 'both');
  assert.deepEqual(p.extras, []);
});

test('gutter form: each answer', () => {
  const g = v => gutterChoice(parseFields(F({ 'what_do_you_need_done_to_your_gutters?': v })), '');
  assert.equal(g('gutter_cleaning'), 'clean');
  assert.equal(g('Gutter cleaning'), 'clean');
  assert.equal(g('gutter_brightening'), 'bright');
  assert.equal(g('Both'), 'both');
  assert.equal(g('cleaning_and_brightening'), 'both');
});

test('other forms are left alone', () => {
  const p = parseFields(F({ full_name: 'Pat Smith', 'which_service_are_you_interested_in?': 'House washing' }));
  assert.equal(gutterChoice(p, 'Pressure Washing'), '');
  assert.equal(formAddress(p), '');
  assert.equal(gutterChoice(parseFields(F({ full_name: 'A B' })), 'Gutter Cleaning'), 'clean');
});
