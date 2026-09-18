import type { Invoice } from "@repo/shared";

// What an invoice's money situation actually is right now.
//
// "Overdue" is deliberately derived here rather than stored: a stored flag
// would need something to sweep the table every night and would be wrong in
// between. An invoice is late the moment its due date passes with a balance
// outstanding, and asking that question at render time is always right.
//
// The stored status still matters for the states a date can't tell you —
// cancelled, and "הופקה חשבונית" externally — so both are taken into
// account.

export type InvoiceBalanceState = "paid" | "partial" | "overdue" | "open" | "cancelled";

export interface InvoiceBalance {
  state: InvoiceBalanceState;
  paid: number;
  /** What's still owed. Never negative, even if someone overpaid. */
  balance: number;
  label: string;
  /** Maps onto StatusBadge's existing colour vocabulary. */
  badgeStatus: string;
  daysLate: number;
}

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// A bare "YYYY-MM-DD" parses as UTC midnight, which in Israel reads as the
// previous evening — an invoice due today would look a day late. Building
// the date from its parts keeps it in local time, where the comparison
// belongs.
const parseLocalDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function invoiceBalanceState(invoice: Invoice): InvoiceBalance {
  const paid = Number(invoice.amount_paid ?? 0);
  const amount = Number(invoice.amount ?? 0);
  const balance = Math.max(0, Math.round((amount - paid) * 100) / 100);

  if (invoice.status === "cancelled") {
    return { state: "cancelled", paid, balance: 0, label: "בוטל", badgeStatus: "cancelled", daysLate: 0 };
  }

  // Half an agora of slack, so a rounding residue can't leave an invoice
  // showing as almost-paid forever.
  if (amount > 0 && paid >= amount - 0.005) {
    return { state: "paid", paid, balance: 0, label: "שולם", badgeStatus: "paid", daysLate: 0 };
  }

  const due = invoice.due_date ? parseLocalDate(invoice.due_date) : null;
  const today = startOfToday();
  const daysLate = due ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0;

  if (due && daysLate > 0) {
    return {
      state: "overdue",
      paid,
      balance,
      label: paid > 0 ? `באיחור ${daysLate} ימים · יתרה` : `באיחור ${daysLate} ימים`,
      badgeStatus: "overdue",
      daysLate,
    };
  }

  if (paid > 0) {
    return { state: "partial", paid, balance, label: "שולם חלקית", badgeStatus: "pending", daysLate: 0 };
  }

  return { state: "open", paid, balance, label: "ממתין לתשלום", badgeStatus: "pending", daysLate: 0 };
}
