// The money arithmetic behind a quote or an invoice, in one place.
//
// It used to be written out separately in the quote form, in the quote save
// path, and again for invoices — which is exactly how the VAT ended up
// being calculated one way on screen and another way in the database. A
// single function means a change to the rules lands everywhere at once.
//
// Order of operations matters and follows the issued document: line items
// make the subtotal, the discount comes off that, and VAT is charged on
// what's left — never on the pre-discount figure, which would overcharge
// the customer.

export interface DocumentTotalsInput {
  lineItems: Array<{ quantity: number | string; unit_price: number | string }>;
  discount: number | string;
  discountType: "fixed" | "percent";
  includeVat: boolean;
  vatRate: number;
  /**
   * Used as the subtotal when there are no line items at all — an invoice
   * can legitimately be a single typed amount with no itemisation.
   */
  fallbackAmount?: number | string;
}

export interface DocumentTotals {
  subtotal: number;
  discountAmount: number;
  taxable: number;
  taxAmount: number;
  total: number;
}

const num = (v: number | string | undefined | null): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Money is rounded to agorot at each stored step. Without this, a rate like
// 0.18 applied to an odd subtotal carries a sub-agora tail into the stored
// total, and every report built on those numbers inherits it.
const toAgorot = (n: number): number => Math.round(n * 100) / 100;

export function computeDocumentTotals({
  lineItems,
  discount,
  discountType,
  includeVat,
  vatRate,
  fallbackAmount = 0,
}: DocumentTotalsInput): DocumentTotals {
  const subtotal =
    lineItems.length > 0
      ? toAgorot(lineItems.reduce((sum, li) => sum + num(li.quantity) * num(li.unit_price), 0))
      : toAgorot(num(fallbackAmount));

  const rawDiscount = discountType === "percent" ? (subtotal * num(discount)) / 100 : num(discount);
  // A discount can't take the document below zero, and can't be negative
  // (that would be a surcharge wearing a discount's label).
  const discountAmount = toAgorot(Math.min(Math.max(rawDiscount, 0), subtotal));

  const taxable = toAgorot(subtotal - discountAmount);
  const taxAmount = includeVat ? toAgorot(taxable * vatRate) : 0;
  const total = toAgorot(taxable + taxAmount);

  return { subtotal, discountAmount, taxable, taxAmount, total };
}
