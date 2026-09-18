// Normalizes a loosely-formatted Israeli phone number ("050-1234567",
// "0501234567") into the digits-only international form wa.me expects
// ("972501234567"). Returns null if there's nothing usable to normalize.
// Same logic as the local copies in useQuoteSharing.ts/useInvoiceSharing.ts
// (kept there too rather than migrated, to avoid touching working files
// unrelated to this change) — this copy is for call/WhatsApp buttons that
// aren't part of the document-sharing flow, e.g. a lead's row actions.
export function toWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.startsWith("972")) return digits;
  return digits;
}

// A bare "tel:" href just needs the phone as typed, with whitespace
// trimmed — no country-code rewriting like WhatsApp needs, since the
// device's own dialer already knows how to handle a local number.
export function toTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed ? `tel:${trimmed}` : null;
}
