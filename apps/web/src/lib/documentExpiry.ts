// Whether a document's expiry date (a license, an insurance policy, a
// certificate — anything that needs periodic renewal) is fine, coming up
// soon, or already passed. Derived at render time from the stored date,
// same reasoning as invoiceBalanceState in lib/invoiceStatus.ts: a nightly
// sweep to flag "expiring soon" would always be a little stale, while a
// date comparison on render is never wrong.

export type DocumentExpiryState = "none" | "valid" | "expiring_soon" | "expired";

export interface DocumentExpiryInfo {
  state: DocumentExpiryState;
  /** Negative once expired, null when there's no expiry date at all. */
  daysUntil: number | null;
  label: string;
  /** Maps onto StatusBadge's existing colour vocabulary. */
  badgeStatus: string;
}

// How far ahead "expiring soon" starts flagging — long enough to actually
// have time to renew an insurance policy or book a re-inspection.
const EXPIRING_SOON_WINDOW_DAYS = 30;

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// A bare "YYYY-MM-DD" parses as UTC midnight, which in Israel reads as the
// previous evening — a document expiring today would look already expired.
// Building the date from its parts keeps it in local time.
const parseLocalDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function documentExpiryState(expiryDate: string | null | undefined): DocumentExpiryInfo {
  if (!expiryDate) {
    return { state: "none", daysUntil: null, label: "—", badgeStatus: "outline" };
  }
  const expiry = parseLocalDate(expiryDate);
  if (!expiry) {
    return { state: "none", daysUntil: null, label: "—", badgeStatus: "outline" };
  }

  const daysUntil = Math.round((expiry.getTime() - startOfToday().getTime()) / 86_400_000);

  if (daysUntil < 0) {
    return {
      state: "expired",
      daysUntil,
      label: `פג תוקף לפני ${Math.abs(daysUntil)} ימים`,
      badgeStatus: "expired",
    };
  }

  if (daysUntil <= EXPIRING_SOON_WINDOW_DAYS) {
    return {
      state: "expiring_soon",
      daysUntil,
      label: daysUntil === 0 ? "פג תוקף היום" : `פג תוקף בעוד ${daysUntil} ימים`,
      badgeStatus: "pending",
    };
  }

  return { state: "valid", daysUntil, label: "", badgeStatus: "success" };
}
