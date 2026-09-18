import { z } from "zod";

// Shared validation schemas used by form code in apps/web (and later
// apps/mobile), plus future CSV-import validation. Kept deliberately
// permissive on optional fields to make Excel/CSV import painless later.

// A "select a related record, or leave empty" field. Plain HTML <select>
// elements always submit a string, so an unset foreign-key picker submits
// "" rather than null/undefined — the schema has to accept that alongside
// a real uuid. Call sites normalize "" to null before writing to Postgres.
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(""));

// An optional number from a plain <input type="number">.
//
// Do NOT write these as `z.coerce.number().optional().nullable()`: an
// untouched number input submits "", and `z.coerce.number()` turns "" into
// 0 — a perfectly valid number, so .optional()/.nullable() never come into
// play and the row is saved with a real 0 instead of "not set". That is how
// every item with a blank "סף להתראת מלאי נמוך" ended up with threshold 0
// (the low-stock alert then only fires at exactly zero stock, i.e. far too
// late) and how a blank cost was stored as "this part is free", which would
// quietly corrupt any margin calculation built on top of it.
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().nullable(),
);

// A required amount, for the same reason in reverse: a blank field must be
// a validation error the user sees, not a silent ₪0.
const requiredAmount = (message: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ required_error: message, invalid_type_error: message }).min(0, message),
  );

export const customerSchema = z.object({
  name: z.string().min(2, "שם חייב להכיל לפחות 2 תווים"),
  document_name: z.string().optional().nullable(),
  business_id: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  mobile_phone: z.string().optional().nullable(),
  email: z.string().email("אימייל לא תקין").optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const inventoryItemSchema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(1, "שם פריט חובה"),
  category: z.string().optional().nullable(),
  unit: z.string().min(1).default("יח׳"),
  quantity_on_hand: z.coerce.number().default(0),
  reorder_threshold: optionalNumber,
  unit_cost: optionalNumber,
  notes: z.string().optional().nullable(),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const priceListItemSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1, "שם פריט חובה"),
  category: z.string().optional().nullable(),
  unit: z.string().min(1).default("יח׳"),
  unit_price: z.coerce.number().min(0),
  default_cost: optionalNumber,
  is_active: z.boolean().default(true),
});
export type PriceListItemInput = z.infer<typeof priceListItemSchema>;

export const quoteLineItemSchema = z.object({
  price_list_item_id: optionalUuid,
  description: z.string().min(1, "תיאור חובה"),
  quantity: z.coerce.number().min(0.01),
  unit_price: z.coerce.number().min(0),
  // Per-line "mask this row's price" toggle — replaces the old whole-quote
  // hide_line_prices (see migration 0011).
  hide_price: z.boolean().default(false),
});
export type QuoteLineItemInput = z.infer<typeof quoteLineItemSchema>;

export const quoteSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  job_id: optionalUuid,
  issued_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  discount: z.coerce.number().min(0).default(0),
  discount_type: z.enum(["fixed", "percent"]).default("fixed"),
  include_vat: z.boolean().default(true),
  notes: z.string().optional().nullable(),
  // @deprecated — replaced by the per-line quoteLineItemSchema.hide_price
  // above (migration 0011). Kept here (with a default) only so older code
  // paths that still happen to read/write it don't break; the form no
  // longer has a control for it.
  hide_line_prices: z.boolean().default(false),
  line_items: z.array(quoteLineItemSchema).min(1, "יש להוסיף לפחות שורה אחת"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const jobSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  quote_id: optionalUuid,
  title: z.string().min(1, "כותרת חובה"),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  assigned_technician_id: optionalUuid,
});
export type JobInput = z.infer<typeof jobSchema>;

export const invoiceLineItemSchema = z.object({
  price_list_item_id: optionalUuid,
  description: z.string().min(1, "תיאור חובה"),
  quantity: z.coerce.number().min(0.01),
  unit_price: z.coerce.number().min(0),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

export const invoiceSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  job_id: optionalUuid,
  quote_id: optionalUuid,
  // The typed amount, used only for an invoice with no itemized rows. Once
  // there are line items the total is computed from them (plus discount and
  // VAT below) instead.
  amount: z.coerce.number().min(0),
  // The same money fields a quote has. Without them an invoice could only
  // store a total, so editing one recomputed that total from its pre-VAT
  // rows and silently dropped the tax.
  discount: z.coerce.number().min(0).default(0),
  discount_type: z.enum(["fixed", "percent"]).default("fixed"),
  include_vat: z.boolean().default(false),
  issued_date: z.string().optional().nullable(),
  // Payment terms are immediate, so this normally matches issued_date; it's
  // editable for the occasional customer given longer terms.
  due_date: z.string().optional().nullable(),
  allocation_number: z.string().optional().nullable(),
  external_provider: z.string().optional().nullable(),
  external_reference: z.string().optional().nullable(),
  external_url: z.string().url().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  line_items: z.array(invoiceLineItemSchema).default([]),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

// One payment received against an invoice. The invoice's balance and its
// paid/unpaid status are derived from these rows by a database trigger, so
// nothing here writes them directly.
export const invoicePaymentSchema = z.object({
  paid_at: z.string().min(1, "תאריך חובה"),
  amount: requiredAmount("סכום חובה"),
  method: z
    .enum(["cash", "credit_card", "bank_transfer", "check", "other"])
    .optional()
    .nullable()
    .or(z.literal("")),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;

export const documentSchema = z.object({
  customer_id: optionalUuid,
  job_id: optionalUuid,
  type: z.string().default("other"),
  title: z.string().min(1, "כותרת חובה"),
  due_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  visible_to_customer: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const resourceCategorySchema = z.object({
  name: z.string().min(1, "שם חובה"),
  notes: z.string().optional().nullable(),
});
export type ResourceCategoryInput = z.infer<typeof resourceCategorySchema>;

export const leadSchema = z.object({
  name: z.string().min(1, "שם חובה"),
  phone: z.string().optional().nullable(),
  email: z.string().email("אימייל לא תקין").optional().nullable().or(z.literal("")),
  source: z.string().optional().nullable(),
  next_follow_up_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const marketingPostSchema = z.object({
  platform: z.enum(["facebook", "instagram", "other"]).default("other"),
  title: z.string().min(1, "כותרת חובה"),
  content: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type MarketingPostInput = z.infer<typeof marketingPostSchema>;

export const expenseSchema = z.object({
  vendor: z.string().min(1, "שם ספק חובה"),
  supplier_tax_id: z.string().optional().nullable(),
  expense_date: z.string().min(1, "תאריך חובה"),
  amount: requiredAmount("סכום חובה"),
  // The VAT shown on the receipt, and the share of it that may actually be
  // claimed back. Kept per-expense because the deductible share genuinely
  // varies (a private car's input VAT isn't deductible at all, a commercial
  // vehicle's generally is) — that's the accountant's call, recorded here
  // rather than guessed in code.
  vat_amount: optionalNumber,
  vat_deductible_rate: z.coerce.number().min(0).max(1).default(1),
  job_id: optionalUuid,
  customer_id: optionalUuid,
  category: z
    .enum([
      "materials",
      "fuel_vehicle",
      "tools",
      "insurance",
      "marketing",
      "rent_utilities",
      "professional_services",
      "other",
    ])
    .default("other"),
  // A plain HTML <select> always submits a string, so "ללא" (no payment
  // method chosen) posts "" — same reasoning as optionalUuid above.
  payment_method: z
    .enum(["cash", "credit_card", "bank_transfer", "check", "other"])
    .optional()
    .nullable()
    .or(z.literal("")),
  notes: z.string().optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const signUpSchema = z.object({
  full_name: z.string().min(2, "שם מלא חובה"),
  email: z.string().email("אימייל לא תקין"),
  phone: z.string().optional().nullable(),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email("אימייל לא תקין"),
  password: z.string().min(1, "סיסמה חובה"),
});
export type SignInInput = z.infer<typeof signInSchema>;
