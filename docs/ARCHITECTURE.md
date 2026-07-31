# Architektur

Die Single-Page-App nutzt React, striktes TypeScript, React Router und TanStack Query. Supabase stellt Auth, PostgreSQL, RLS, Storage, Realtime und privilegierte Edge Functions bereit. Geschäftsbereiche liegen unter `src/features`; Plattformzugriffe und Integrationen hinter Interfaces in `src/services`.

Jede fachliche Zeile trägt eine `organization_id`. Browserzugriff wird nicht durch UI-Gates, sondern durch RLS erzwungen. Effektive Permissions sind die Vereinigung zeitlich gültiger Rollenzuweisungen. Private Direktchats bleiben selbst für technische Administratoren unsichtbar; Atteste verlangen die separate Fachpermission `sick_leave.view_certificates`.

Die PWA cached nur die App-Shell. Sensible Dateien und API-Antworten werden nicht in Workbox-Runtime-Caches aufgenommen. Careville ist ein expliziter `NotConfigured`-Adapter, MediFox ist nicht implementiert.
