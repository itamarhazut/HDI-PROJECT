import { z } from "zod";

// Shared validation schemas used by form code in apps/web (and later
// apps/mobile), plus future CSV-import validation. Kept deliberately
// permissive on optional fields to make Excel/CSV import painless later.

// A "select a related record, or leave empty" field. Plain HTML <select>
// elements always submit a string, so an unset foreign-key picker submits
// "" rather than null/undefined — the schema has to accept that alongside
// a real uuid. Call sites normalize "" to null before writing to Postgres.
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(""));

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
  reorder_threshold: z.coerce.number().optional().nullable(),
  unit_cost: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const priceListItemSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1, "שם פריט חובה"),
  category: z.string().optional().nullable(),
  unit: z.string().min(1).default("יח׳"),
  unit_price: z.coerce.number().min(0),
  default_cost: z.coerce.number().optional().nullable(),
  is_active: z.boolean().default(true),
});
export type PriceListItemInput = z.infer<typeof priceListItemSchema>;

export const quoteLineItemSchema = z.object({
  price_list_item_id: optionalUuid,
  description: z.string().min(1, "תיאור חובה"),
  quantity: z.coerce.number().min(0.01),
  unit_price: z.coerce.number().min(0),
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
  // Kept even once line_items has rows (that case recomputes it as their
  // sum before saving) so an invoice with no items at all — every invoice
  // created before this feature existed, and any new one someone chooses
  // not to itemize — still works exactly as before.
  amount: z.coerce.number().min(0),
  issued_date: z.string().optional().nullable(),
  external_provider: z.string().optional().nullable(),
  external_reference: z.string().optional().nullable(),
  external_url: z.string().url().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  line_items: z.array(invoiceLineItemSchema).default([]),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const documentSchema = z.object({
  customer_id: optionalUuid,
  job_id: optionalUuid,
  type: z.string().default("other"),
  title: z.string().min(1, "כותרת חובה"),
  due_date: z.string().optional().nullable(),
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
  expense_date: z.string().min(1, "תאריך חובה"),
  amount: z.coerce.number().min(0),
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
