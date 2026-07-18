import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { en } from './en';
import { LANGUAGE_OPTIONS } from './index';
import { af } from './af';
import { am } from './am';
import { om } from './om';
import { st } from './st';
import { sw } from './sw';
import { xh } from './xh';

console.log('TEST: explicit language drafts');

const stringKeys = Object.keys(en).filter(
  key => key !== 'SPEECH_LOCALE' && typeof en[key as keyof typeof en] === 'string'
) as (keyof typeof en)[];
const functionKeys = Object.keys(en).filter(
  key => typeof en[key as keyof typeof en] === 'function'
) as (keyof typeof en)[];

const drafts: readonly {
  code: 'xh' | 'st' | 'af' | 'sw' | 'am' | 'om';
  label: string;
  locale: string;
  strings: typeof en;
}[] = [
  { code: 'xh', label: 'isiXhosa', locale: 'xh-ZA', strings: xh },
  { code: 'st', label: 'Sesotho', locale: 'st-ZA', strings: st },
  { code: 'af', label: 'Afrikaans', locale: 'af-ZA', strings: af },
  { code: 'sw', label: 'Kiswahili', locale: 'sw-KE', strings: sw },
  { code: 'am', label: 'Amharic', locale: 'am-ET', strings: am },
  { code: 'om', label: 'Afaan Oromoo', locale: 'om-ET', strings: om },
];

for (const draft of drafts) {
  const source = readFileSync(`src/i18n/${draft.code}.ts`, 'utf8');
  assert.doesNotMatch(
    source,
    /\.\.\.\s*en\b/,
    `${draft.label} must list every key explicitly instead of inheriting English with {...en}`
  );

  assert.deepEqual(
    Object.keys(draft.strings).sort(),
    Object.keys(en).sort(),
    `${draft.label} has exactly the canonical English key set`
  );

  const translatedStrings = stringKeys.filter(key => draft.strings[key] !== en[key]);
  assert.ok(
    translatedStrings.length >= Math.floor(stringKeys.length * 0.95),
    `${draft.label} translates the visible string surface ` +
      `(${translatedStrings.length}/${stringKeys.length})`
  );

  assert.ok(
    functionKeys.every(key => draft.strings[key] !== en[key]),
    `${draft.label} supplies its own renderer for every function-valued string`
  );

  const metadata = LANGUAGE_OPTIONS.find(option => option.code === draft.code);
  assert.ok(metadata, `${draft.label} is registered`);
  assert.equal(
    metadata.reviewed,
    false,
    `${draft.label} remains marked for native-speaker review`
  );
  assert.equal(
    draft.strings.SPEECH_LOCALE,
    draft.locale,
    `${draft.label} uses its intended speech/date locale`
  );
}

console.log('PASSED: all language drafts are explicit, complete, translated, and review-pending');
