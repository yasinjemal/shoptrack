import {
  backupFilesToDelete,
  createCrashRecord,
  dailyBackupFilename,
  isSharedBackupDue,
  parseCrashRecord,
} from './safety';

let failures = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`); }
}

console.log('TEST: local crash evidence');
const error = new Error('database unavailable');
const crash = createCrashRecord(error, '1.2.3', 123, true);
equal(crash.message, 'database unavailable', 'captures the message');
equal(crash.build_version, '1.2.3', 'captures the build');
equal(crash.occurred_at, 123, 'captures the time');
equal(parseCrashRecord(JSON.stringify(crash))?.message, crash.message, 'round-trips through local storage');
equal(parseCrashRecord('{broken'), null, 'corrupt local evidence fails safe');

console.log('TEST: daily snapshots');
equal(dailyBackupFilename(new Date(2026, 6, 5)), 'shoptrack-auto-2026-07-05.json', 'names by local calendar day');
const files = Array.from({ length: 9 }, (_, i) => `file:///shoptrack-auto-2026-07-${String(i + 1).padStart(2, '0')}.json`).reverse();
equal(backupFilesToDelete(files).length, 2, 'seven snapshots survive');
equal(backupFilesToDelete(files)[0].endsWith('01.json'), true, 'oldest goes first');
equal(backupFilesToDelete(files, 10).length, 0, 'nothing is deleted under the limit');

console.log('TEST: shared-backup nudge');
const NOW = Date.UTC(2026, 6, 16);
equal(isSharedBackupDue(null, NOW), true, 'a shop that never shared is nudged');
equal(isSharedBackupDue(NOW - 7 * 86400000, NOW), true, 'seven days is due');
equal(isSharedBackupDue(NOW - 6 * 86400000, NOW), false, 'six days is still fresh');

if (failures > 0) { console.error(`FAILED: ${failures} safety assertion(s)`); process.exit(1); }
console.log('PASSED: all data-safety assertions held');

