# Edge Functions

Empty for now (Phase 0). Planned additions, per the project plan:

- `send-quote-email` (Phase 2) — emails a quote PDF to a customer.
- `invoicing-provider` (Phase 5) — calls an external invoicing API (Yesh
  Heshbonit / Green Invoice) to generate an official tax invoice and write
  the result back into `invoices.external_reference` / `external_url`.

Any function that needs the Supabase **service role key** or a third-party
secret belongs here, never in the client apps.
