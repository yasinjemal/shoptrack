# ShopTrack release train

Every train starts with `npm run release:check`. A failed unit, SQLite,
translation-shape, type, Expo Doctor, or critical dependency-audit gate stops
the build.

| Train | EAS profile/channel | Purpose | Promotion rule |
|---|---|---|---|
| Development | `development` | Native-module work on a development client | Never promoted |
| Preview | `preview` | Automated Maestro/device-farm tap-throughs | Critical flows green |
| Pilot | `pilot` | Named pilot cohort, install-over-upgrade rehearsal | Real-Android rehearsal and pilot owner sign-off |
| Production | `production` | Public store release | Pilot retro, backup restore, crash/privacy review |

Production is a fresh build from the reviewed commit. It is not an update sent
directly from a developer machine. Core counting, stock-in, credit, cash-up,
expenses, sales, backup, restore, and data export are permanently uncapped.

External commands (credentials required):

- `npm run build:preview`
- `npm run build:pilot`
- `npm run build:production`
- `maestro test .maestro/critical-count-flow.yaml`
- `maestro test .maestro/settings-flow.yaml`
