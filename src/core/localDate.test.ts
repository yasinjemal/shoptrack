import assert from 'node:assert/strict';
import { setCurrentCountryPack } from './countryPacks';
import { formatShopDateTime, localCalendarDayLabel, toEthiopianDate } from './localDate';

assert.deepEqual(toEthiopianDate(new Date(2025, 8, 11, 12)), { year: 2018, month: 1, day: 1 });
setCurrentCountryPack('ZA');
assert.equal(localCalendarDayLabel('2025-09-11'), null);
setCurrentCountryPack('ET');
assert.equal(localCalendarDayLabel('2025-09-11'), '1/1/2018 EC');
assert.match(formatShopDateTime(new Date(2025, 8, 11, 12).getTime(), 'en-ZA'), /^2018-01-01 EC/);
setCurrentCountryPack('ZA');

console.log('local date tests passed');
