// Extracts a human-readable message from anything a mutation can throw.
//
// Supabase's client rejects with plain PostgrestError-shaped objects
// ({ message, details, hint, code }) — not real `Error` instances — so
// the `err instanceof Error ? err.message : undefined` check used across
// every page's onError handler always evaluated to `undefined` for a
// real database error. That silently swallowed the actual reason a save
// failed: the toast showed only its generic title ("שמירת ... נכשלה")
// with no explanation, even though Supabase had a perfectly good message
// (e.g. "column quotes.discount_type does not exist"). This checks for a
// `message` string on any object, not just on actual Error instances, so
// that real error text reaches the user.
export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof err === "string" && err) return err;
  return undefined;
}
