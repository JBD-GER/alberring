# Alberring Connect

Alberring Connect ist eine interne, mobile-first Mitarbeiterplattform für Kommunikation, News, Einsatzplanung, Abwesenheiten, Dokumente, Fuhrpark und Materialanforderungen. Patientendaten und Pflegedokumentation gehören ausdrücklich nicht in dieses System.

## Der kürzeste Weg zum ersten Login

1. Ein Supabase-Projekt anlegen, möglichst in einer EU-Region.
2. Im **SQL Editor** genau das passende Setup-Bundle vollständig ausführen:
   - Bereits vorhandenes Alberring-Projekt, in dem die bisherigen Migrationen 001 und 002 schon installiert sind: [`supabase/SETUP_UPGRADE_20260710.sql`](supabase/SETUP_UPGRADE_20260710.sql)
   - Wirklich leeres, neues Supabase-Projekt: [`supabase/SETUP_FRESH.sql`](supabase/SETUP_FRESH.sql)
3. Unter **Authentication → Users** den ersten Benutzer anlegen, dessen E-Mail bestätigen und die Auth-UUID kopieren.
4. Den Benutzer einmalig mit `bootstrap_first_admin(...)` als ersten Super Admin mit der App verknüpfen. Der genaue Aufruf steht in [docs/DATABASE.md](docs/DATABASE.md#erster-administrator).
5. Auth-Einstellungen, Edge Functions, Function-Secrets und Zeitpläne nach [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) einrichten.
6. Danach als Super Admin anmelden und weitere Personen in der App unter **Administration → Benutzer** einladen.

Ein Auth-Benutzer allein ist noch kein aktives App-Konto. Der Bootstrap ist für den ersten Administrator deshalb bewusst ein eigener, kurzer Schritt. Existiert bereits ein aktiver Super Admin, darf und muss er nicht wiederholt werden.

## Frontend lokal starten

Voraussetzungen: Node.js 24+ und npm.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

In `.env.local` stehen ausschließlich diese beiden öffentlichen Frontend-Werte:

```dotenv
VITE_SUPABASE_URL=https://IHRE_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=IHR_PUBLISHABLE_ODER_ANON_KEY
```

Das ist keine doppelte Konfiguration: `VITE_*` wird beim Frontend-Build verwendet. Die nicht mit `VITE_` beginnenden Variablen `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` gehören zu Edge Functions; Supabase stellt sie bei gehosteten Functions automatisch bereit. Der Service-Role-Key darf niemals in `.env.local` oder in den Browser gelangen.

## Qualitätsprüfungen

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Die Datenbanktests benötigen zusätzlich die Supabase CLI und Docker:

```bash
npx supabase db reset
npx supabase test db
```

Der tatsächliche Prüfstatus und die noch offenen Produktionsaufgaben stehen in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). Architektur und Betrieb sind in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE.md](docs/DATABASE.md) und [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) dokumentiert.
