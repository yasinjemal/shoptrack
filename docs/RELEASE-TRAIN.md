# ShopTrack release train

Every train starts with `npm run release:check`. This local, credential-free
gate runs the unit and real-SQL tests, translation-shape checks, TypeScript,
ESLint, Expo Doctor, and the high-severity production dependency audit. Any
failure stops the build.

GitHub Actions then repeats that locked-dependency gate on Ubuntu and exports
both web and Android bundles. A green CI run therefore proves the reviewed
commit passes the release checks and Metro can compile both targets; it does
not claim that a native binary installed or that device-only behavior worked.
The workflow runs on pushes, pull requests, and manual dispatches from
`.github/workflows/ci.yml`.

| Train | EAS profile/channel | Purpose | Promotion rule |
|---|---|---|---|
| Development | `development` | Native-module work on a development client | Never promoted |
| Preview | `preview` | Automated Maestro/device-farm tap-throughs | Critical flows green |
| Pilot | `pilot` | Named pilot cohort, install-over-upgrade rehearsal | Real-Android rehearsal and pilot owner sign-off |
| Production | `production` | Public store release | Pilot retro, backup restore, crash/privacy review |

Production is a fresh build from the reviewed commit. It is not an update sent
directly from a developer machine. Core counting, stock-in, credit, cash-up,
expenses, sales, backup, restore, and data export are permanently uncapped.

Local and CI proof (no EAS credentials required):

- `npm ci`
- `npm run release:check`
- `npx expo export --platform web --output-dir .expo/export-check/web`
- `npx expo export --platform android --output-dir .expo/export-check/android`

EAS build commands require the project account, signing credentials, and
network access:

- `npm run build:preview`
- `npm run build:pilot`
- `npm run build:production`

Maestro remains a separate emulator/device gate. It needs an installed Android
build and a configured local emulator, physical phone, or device-farm runner;
bundle export alone cannot exercise SQLite, migration, document picking,
sharing, camera permissions, background relock, or Android system Back.

- `maestro test .maestro/critical-count-flow.yaml`
- `maestro test .maestro/settings-flow.yaml`
