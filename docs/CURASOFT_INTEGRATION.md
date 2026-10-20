# CuraSoft integration preparation — 1.0.6

The app currently sends **no data** to CuraSoft. No sync, scheduled job or inbound webhook is enabled. Web, iOS and Android continue to use the same Alberring Supabase backend.

## Current implementation

- Administration → Integrationen: CuraSoft setup information and authenticated readiness check.
- `curasoft-readiness` requires an active account with `integrations.manage`. It returns booleans, never credentials or external response bodies. A different organization cannot see credential presence.
- The provider is registered as disabled with no capabilities. Even complete configuration returns `mapping_required`, not an active connection.
- Existing shifts remain in the database as historical records. The Dienstplan is removed from navigation, dashboard and onboarding. Old screen links redirect to Urlaub.

## Information to obtain from CuraSoft

1. CuraGo/REST API activation for Alberring and confirmation of any license/setup costs.
2. Approved test environment, customer/tenant identity and data ownership.
3. Restricted API key plus access key. Official CuraGo docs describe `X-API-Key` **and** `X-ACCESS-Key` headers. Confirm the specific endpoints' authentication requirements before implementation. Do not use a staff member's personal password.
4. Authorized endpoints, example schemas, pagination, limits, deletion/absence semantics and test records for the intended employee/leave integration.
5. Decide authoritative source and direction per field. Proposed starting scope: employee reference data and approved leave dates/status. No automatic invitations, account reactivation, role changes, patient data, sickness documents or schedule imports.

Sources checked on 20 October 2026:

- https://www.curasoft.de/faq/ (REST API currently requires CuraGo)
- https://www.curasoft.de/plattform
- https://docs.curasoft.dev/cura-go.de (CURA.GO 69.25, OpenAPI 3.1)

## Where to configure it later

Use **Supabase → Project Settings → Edge Functions → Secrets** (or the official CLI secret workflow) for the existing Alberring project. Never put keys in Vite variables, browser storage, `integration_connections.config`, GitHub commits, screenshots or email.

| Server secret              | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `CURASOFT_ORGANIZATION_ID` | Exact Alberring Supabase organization UUID; reviewed by technical operator |
| `CURASOFT_ENVIRONMENT`     | `test` initially; `production` only after acceptance                       |
| `CURASOFT_API_KEY`         | Restricted API key issued by CuraSoft                                      |
| `CURASOFT_ACCESS_KEY`      | Matching access key issued by CuraSoft                                     |

Adding secrets only updates readiness. It does not activate data exchange. No arbitrary API URL is accepted by the current function.

## Next implementation stage after API agreement

Implement a server-only adapter in `supabase/functions/_shared/curasoft.ts`, with fixed allowed vendor hosts, timeout, redirect refusal, redacted errors and endpoint-specific authorization. Confirm tenant identity before importing. Map external IDs to same-organization internal records with unique constraints, idempotency and a preview of changes. Start read-only against synthetic test data. Log counts/status in `integration_sync_runs`, never HR payloads or credentials. For write-back, agree conflict handling and review changes before enabling it. Keep credentials and all vendor requests off the mobile/web client.

Validate inactive/foreign/unauthorized accounts, wrong tenant, pagination, duplicate events, retries, removals, revoked keys and timeout. Obtain customer acceptance of the exact data flow before enabling any production schedule. Update privacy information to match the actual activated integration at that point.
