import { z } from "zod";

// Shared validation schemas used by form code in apps/web (and later
// apps/mobile), plus future CSV-import validation. Kept deliberately
// permissive on optional fields to make Excel/CSV import painless later.

export const customerSchema = z.object({
  name: z.string().min(2, "שם חייב להכיל לפחות 2 תווים"),
  phone: z.string().optional().nullable(),
  email: z.string().email("אימייל לא תקין").optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
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
  price_list_item_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1, "תיאור חובה"),
  quantity: z.coerce.number().min(0.01),
  unit_price: z.coerce.number().min(0),
});
export type QuoteLineItemInput = z.infer<typeof quoteLineItemSchema>;

export const quoteSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  job_id: z.string().uuid().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  line_items: z.array(quoteLineItemSchema).min(1, "יש להוסיף לפחות שורה אחת"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const jobSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  quote_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "כותרת חובה"),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  assigned_technician_id: z.string().uuid().optional().nullable(),
});
export type JobInput = z.infer<typeof jobSchema>;

export const invoiceSchema = z.object({
  customer_id: z.string().uuid("יש לבחור לקוח"),
  job_id: z.string().uuid().optional().nullable(),
  quote_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().min(0),
  issued_date: z.string().optional().nullable(),
  external_provider: z.string().optional().nullable(),
  external_reference: z.string().optional().nullable(),
  external_url: z.string().url().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const documentSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  job_id: z.string().uuid().optional().nullable(),
  type: z.string().default("other"),
  title: z.string().min(1, "כותרת חובה"),
  due_date: z.string().optional().nullable(),
  visible_to_customer: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const leadSchema = z.object({
  name: z.string().min(1, "שם חובה"),
  phone: z.string().optional().nullable(),
  email: z.string().email("אימייל לא תקין").optional().nullable().or(z.literal("")),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type LeadInput = z.infer<typeof leadSchema>;

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
