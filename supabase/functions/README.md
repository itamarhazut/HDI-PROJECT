# Edge Functions

- `sync-google-calendar` — fetches a user's private/"secret address" ICS
  feed URL (Google Calendar, or any other provider that exports one) and
  returns the events in a given date range as JSON. Exists to work around
  the browser: Google's ICS export endpoint doesn't send CORS headers, so
  the frontend can't fetch it directly — this function does it
  server-to-server instead. One-way, read-only (phone/calendar → app);
  it never writes back to the source calendar. Deploy with
  `supabase functions deploy sync-google-calendar`.

Planned additions, per the project plan:

- `send-quote-email` (Phase 2) — emails a quote PDF to a customer.
- `invoicing-provider` (Phase 5) — calls an external invoicing API (Yesh
  Heshbonit / Green Invoice) to generate an official tax invoice and write
  the result back into `invoices.external_reference` / `external_url`.

Any function that needs the Supabase **service role key** or a third-party
secret belongs here, never in the client apps.
