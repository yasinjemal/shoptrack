import assert from 'node:assert/strict';
import { parseSpokenCount } from './spokenNumber';

assert.equal(parseSpokenCount('42'), 42);
assert.equal(parseSpokenCount('forty-two'), 42);
assert.equal(parseSpokenCount('one hundred and five'), 105);
assert.equal(parseSpokenCount('two thousand three hundred and nineteen'), 2319);
assert.equal(parseSpokenCount('zero'), 0);
assert.equal(parseSpokenCount('twelve bottles'), null);
assert.equal(parseSpokenCount('1000000'), null);
assert.equal(parseSpokenCount(''), null);

console.log('spoken number tests passed');
