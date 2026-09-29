# Abschließende lokale Prüfungen

17.09.2026. Aus tatsächlich ausgeführten Befehlen, ohne Zugangsdaten.

## install

```text
npm warn deprecated source-map@0.8.0-beta.0: The work that was done in this beta branch won't be included in future versions
npm warn deprecated glob@11.1.0: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me

added 640 packages, and audited 641 packages in 5s

173 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

## typecheck

```text
> alberring-connect@0.1.0 typecheck
> tsc -b --pretty false
```

## lint

```text
> alberring-connect@0.1.0 lint
> eslint . --max-warnings 0
```

## tests

```text
> alberring-connect@0.1.0 test
> vitest run


 RUN  v4.1.11 /Users/chrisotphpfad/Projekte/Alberring


 Test Files  22 passed (22)
      Tests  166 passed (166)
   Start at  10:43:48
   Duration  3.13s (transform 1.51s, setup 0ms, import 9.54s, tests 3.86s, environment 11.34s)
```

## web-build

```text
dist/assets/permissions-BIXbwhpZ.js                1.88 kB │ gzip:   0.92 kB
dist/assets/web-BMNJ2HZl.js                        2.08 kB │ gzip:   0.85 kB
dist/assets/PwaUpdate-BAC1mFKd.js                  2.24 kB │ gzip:   1.02 kB
dist/assets/useMutation-BhzbJZ-y.js                2.25 kB │ gzip:   0.94 kB
dist/assets/parseISO-AqjFaj9U.js                   2.62 kB │ gzip:   1.20 kB
dist/assets/Directory-DNwrGUsk.js                  2.95 kB │ gzip:   1.33 kB
dist/assets/Operations-Cbi8aB1O.js                 4.67 kB │ gzip:   1.88 kB
dist/assets/Notifications-BSQWuzii.js              5.49 kB │ gzip:   2.18 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js    5.65 kB │ gzip:   2.20 kB
dist/assets/web-C6PDIQw5.js                        6.07 kB │ gzip:   1.82 kB
dist/assets/de-CgcEd0lX.js                         6.99 kB │ gzip:   2.02 kB
dist/assets/en-US-B-5W3x4Z.js                      7.57 kB │ gzip:   2.66 kB
dist/assets/web-DoAoVgDv.js                        8.49 kB │ gzip:   2.84 kB
dist/assets/AuthScreens-BfH84ZzJ.js               10.41 kB │ gzip:   3.44 kB
dist/assets/Dashboard-C6OnIuOC.js                 10.59 kB │ gzip:   3.05 kB
dist/assets/createLucideIcon-CHwC25J_.js          11.04 kB │ gzip:   4.42 kB
dist/assets/format-BusR-2M4.js                    11.93 kB │ gzip:   3.27 kB
dist/assets/News-0iNGekr9.js                      12.17 kB │ gzip:   3.69 kB
dist/assets/Settings-CM1B3ldr.js                  15.25 kB │ gzip:   4.79 kB
dist/assets/leave-eaGLRyNf.js                     15.28 kB │ gzip:   5.03 kB
dist/assets/materials-C4WH4qim.js                 15.65 kB │ gzip:   5.10 kB
dist/assets/sick-leave-DFAsUbRo.js                19.18 kB │ gzip:   6.03 kB
dist/assets/scheduling-C2Qxy-m-.js                23.52 kB │ gzip:   7.15 kB
dist/assets/Documents-BHY-DSlW.js                 24.95 kB │ gzip:   6.41 kB
dist/assets/Onboarding-C2kxsMJh.js                27.12 kB │ gzip:   8.15 kB
dist/assets/uploads-B3wItbJz.js                   31.47 kB │ gzip:  10.70 kB
dist/assets/WorkflowUI-Domi3YiT.js                35.56 kB │ gzip:  12.94 kB
dist/assets/Messaging-DYpu7sqY.js                 42.11 kB │ gzip:  11.92 kB
dist/assets/Admin-DmfNMmQc.js                     42.36 kB │ gzip:  10.15 kB
dist/assets/fleet-Bd91MzxJ.js                     44.84 kB │ gzip:  10.09 kB
dist/assets/schemas-FwkoMif_.js                   64.77 kB │ gzip:  17.44 kB
dist/assets/hooks-9iccwTH7.js                     69.55 kB │ gzip:  23.03 kB
dist/assets/index-B6wulWjY.js                    497.21 kB │ gzip: 144.11 kB

✓ built in 188ms

PWA v1.3.0
mode      generateSW
precache  74 entries (1243.72 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```

## native-sync

```text
✓ built in 137ms
Native bundle verified: local assets, CSP, no PWA service worker.

> alberring-connect@0.1.0 mobile:version
> node scripts/sync-mobile-version.mjs

Mobile version 1.0.0, build 1; Android reads the same version source.
✔ Copying web assets from dist-native to android/app/src/main/assets/public in 12.87ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 1.08ms
✔ copy android in 23.97ms
✔ Updating Android plugins in 2.60ms
[info] Found 9 Capacitor plugins for android:
       @capacitor/app@8.1.1
       @capacitor/camera@8.2.4
       @capacitor/filesystem@8.1.3
       @capacitor/geolocation@8.2.2
       @capacitor/keyboard@8.0.5
       @capacitor/network@8.0.1
       @capacitor/push-notifications@8.1.2
       @capacitor/splash-screen@8.0.2
       @capgo/capacitor-audio-recorder@8.2.9
✔ update android in 51.47ms
✔ Copying web assets from dist-native to ios/App/App/public in 10.87ms
✔ Creating capacitor.config.json in ios/App/App in 181.13μs
✔ copy ios in 34.42ms
✔ Updating iOS plugins in 2.36ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 9 Capacitor plugins for ios:
       @capacitor/app@8.1.1
       @capacitor/camera@8.2.4
       @capacitor/filesystem@8.1.3
       @capacitor/geolocation@8.2.2
       @capacitor/keyboard@8.0.5
       @capacitor/network@8.0.1
       @capacitor/push-notifications@8.1.2
       @capacitor/splash-screen@8.0.2
       @capgo/capacitor-audio-recorder@8.2.9
✔ update ios in 14.17ms
✔ copy web in 5.03ms
✔ update web in 5.87ms
[info] Sync finished in 0.175s
```

## security

```text
> alberring-connect@0.1.0 security:check
> node scripts/check-client-security.mjs

Client source and available bundles: no private credential patterns found (not a substitute for a full secret audit).
```

## audit

```text
found 0 vulnerabilities
```

## e2e

```text
(node:13977) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:13978) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   2 [chromium] › src/test/e2e/public.spec.ts:3:1 › Login ist mobil ohne horizontales Scrollen bedienbar (976ms)
  ✓   1 [mobile] › src/test/e2e/public.spec.ts:3:1 › Login ist mobil ohne horizontales Scrollen bedienbar (976ms)
  ✓   3 [mobile] › src/test/e2e/public.spec.ts:26:1 › Passwort-Reset zeigt neutralen Flow (850ms)
  ✓   4 [chromium] › src/test/e2e/public.spec.ts:26:1 › Passwort-Reset zeigt neutralen Flow (855ms)
  ✓   6 [chromium] › src/test/e2e/public.spec.ts:32:1 › Einladungsseite akzeptiert keine beliebige Sitzung (852ms)
  ✓   5 [mobile] › src/test/e2e/public.spec.ts:32:1 › Einladungsseite akzeptiert keine beliebige Sitzung (854ms)
  ✓   8 [mobile] › src/test/e2e/public.spec.ts:39:1 › es gibt keine öffentliche Registrierung (856ms)
  ✓   7 [chromium] › src/test/e2e/public.spec.ts:39:1 › es gibt keine öffentliche Registrierung (856ms)
  ✓   9 [chromium] › src/test/e2e/public.spec.ts:46:1 › Onboarding ist ohne exklusive Admin-Sitzung nicht erreichbar (853ms)
  ✓  10 [mobile] › src/test/e2e/public.spec.ts:46:1 › Onboarding ist ohne exklusive Admin-Sitzung nicht erreichbar (853ms)
  ✓  11 [mobile] › src/test/e2e/public.spec.ts:55:1 › Login hat keine automatisiert erkennbaren WCAG-Verstöße (234ms)
  ✓  12 [chromium] › src/test/e2e/public.spec.ts:55:1 › Login hat keine automatisiert erkennbaren WCAG-Verstöße (235ms)

  12 passed (5.4s)
```

## local

```text
Local real-backend verification: 25 mobile routes, login, restore, logout, permissions and offline checked.
```

## format

```text
> alberring-connect@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
```

## Git-Arbeitsstand

`git diff --check` erfolgreich. Kein Commit, Push oder Produktionsdeployment durchgeführt.
