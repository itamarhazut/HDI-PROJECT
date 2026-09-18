// Hand-written types mirroring supabase/migrations/0001_init.sql.
//
// Once a real Supabase project exists, replace this file's contents with the
// output of:
//   supabase gen types typescript --project-id <ref> > packages/shared/src/types/database.ts
// and re-export the generated `Database` type as before, so app code that
// imports from "@repo/shared" doesn't need to change.
//
// IMPORTANT: every row/insert/update shape below is declared with `type X =
// {...}` (an object type alias), never `interface X {...}`. supabase-js's
// generic Database typing requires each table's Row/Insert/Update to
// structurally satisfy `Record<string, unknown>`, and TypeScript only
// infers that implicit index signature for object type *literals* — a
// plain `interface` never gets one, even if every property is compatible.
// With interfaces here, `SupabaseClient<Database>`'s Schema generic
// silently collapsed to `never` for every `.from()` and `.rpc()` call
// (caught via `FooInterface extends Record<string, unknown>` → false,
// `FooTypeAlias extends Record<string, unknown>` → true, in a scratch
// typecheck). Keep these as `type`, not `interface`.

export type UserRole = "admin" | "customer" | "technician";
export type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type QuoteDiscountType = "fixed" | "percent";
export type InvoiceStatus = "pending" | "marked_invoiced" | "paid" | "overdue" | "cancelled";
export type DocumentStatus = "needed" | "in_progress" | "submitted" | "approved" | "rejected";
export type LeadStatus = "new" | "contacted" | "converted" | "lost";
export type InventoryReason = "job_usage" | "restock" | "adjustment";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  profile_id: string | null;
  name: string;
  /** Name to print on documents (quotes/invoices), when different from the contact name — e.g. a company name. */
  document_name: string | null;
  /** Israeli "עוסק מורשה/פטור" or "ח.פ" business registration number. Kept as text (can have leading zeros). */
  business_id: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  pending_review: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type Job = {
  id: string;
  customer_id: string;
  quote_id: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  assigned_technician_id: string | null;
  address: string | null;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type InventoryItem = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceListItem = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  unit_price: number;
  default_cost: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: string;
  quote_number: number;
  customer_id: string;
  job_id: string | null;
  status: QuoteStatus;
  issued_date: string;
  valid_until: string | null;
  subtotal: number;
  discount: number;
  /** How to read the "discount" column above: a shekel amount, or a percent of the subtotal. */
  discount_type: QuoteDiscountType;
  /** Whether VAT is charged on this quote at all — off for an "עוסק פטור" who isn't allowed to charge VAT. */
  include_vat: boolean;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  /**
   * @deprecated Replaced by the per-line `QuoteLineItem.hide_price` (see
   * migration 0011) — hiding a price is now a per-row choice (masked as
   * "****", columns stay), not a whole-quote toggle that dropped the
   * unit-price/total columns entirely. Column kept in the DB and this type
   * for now; the app no longer reads or writes it.
   */
  hide_line_prices: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
  price_list_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  /** Mask this line's own unit-price/total as "****" on the printed/PDF document — the quantity/description still show, and the quote's overall subtotal/total are unaffected. Per-line (see migration 0011), not a whole-quote setting. */
  hide_price: boolean;
};

// One stock movement. `unit_cost` is what the part cost at the moment of
// the movement, captured by the record_inventory_transaction RPC — job
// costing reads it instead of the item's current cost, so a job's materials
// figure doesn't drift as prices change.
export type InventoryTransaction = {
  id: string;
  inventory_item_id: string;
  job_id: string | null;
  quantity_delta: number;
  reason: InventoryReason;
  unit_cost: number | null;
  created_at: string;
  created_by: string | null;
};

export type Invoice = {
  id: string;
  invoice_number: number;
  customer_id: string;
  job_id: string | null;
  quote_id: string | null;
  status: InvoiceStatus;
  // Nullable — unlike a quote's issued_date, an invoice row can exist
  // before it's actually issued (e.g. auto-created from a job/quote).
  issued_date: string | null;
  // The final total owed, VAT included and discount applied — the one
  // figure everything else (balance, revenue, the customer portal) reads.
  amount: number;
  // The breakdown behind `amount`, mirroring a quote's. Added because an
  // invoice that only stored a total couldn't survive being edited: its
  // amount was recomputed from pre-VAT line items, silently dropping the
  // tax. Older invoices carry subtotal = amount with no VAT split, which
  // is an honest "we don't know", not a claim that they had no VAT.
  subtotal: number;
  discount: number;
  discount_type: "fixed" | "percent";
  include_vat: boolean;
  tax_rate: number;
  tax_amount: number;
  // Payment terms are immediate, so this is normally the issue date; it's
  // a real column so a specific invoice can be given longer terms.
  due_date: string | null;
  // Maintained by a trigger from the invoice_payments ledger — never write
  // it directly.
  amount_paid: number;
  paid_date: string | null;
  // מספר הקצאה, issued by the Tax Authority through the external invoicing
  // system for B2B tax invoices over the threshold (₪5,000 before VAT from
  // June 2026).
  allocation_number: string | null;
  external_provider: string | null;
  external_reference: string | null;
  external_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// One payment received against an invoice. A deposit and the balance are
// two rows, so the history survives — the invoice's amount_paid, paid_date
// and paid/unpaid status are all derived from these by a database trigger.
export type InvoicePayment = {
  id: string;
  invoice_id: string;
  paid_at: string;
  amount: number;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

// A detailed line on an invoice — same shape as QuoteLineItem, and often
// copied verbatim from the linked quote's line items when an invoice is
// created from a completed job (see JobsPage's "צור חשבונית" button).
// Optional: an invoice with no rows here just keeps its plain `amount`
// field, exactly like every invoice created before this feature existed.
export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  price_list_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type ExpenseCategory =
  | "materials"
  | "fuel_vehicle"
  | "tools"
  | "insurance"
  | "marketing"
  | "rent_utilities"
  | "professional_services"
  | "other";

// How money moved, in either direction — used for an expense going out and
// for a payment coming in against an invoice. One definition on purpose, so
// the two lists can't drift apart.
export type PaymentMethod = "cash" | "credit_card" | "bank_transfer" | "check" | "other";

/** @deprecated Use PaymentMethod — kept so existing expense code stays valid. */
export type ExpensePaymentMethod = PaymentMethod;

// A business expense (חומרים, דלק, ביטוח...) — the electrician's own small
// "רו״ח" tracker for money going OUT of the business, separate from
// customer-facing invoices (money coming in). At most one receipt file per
// expense, stored the same way ResourceFile's uploads are (safeStorageFileName
// on the Storage path, original name kept for display).
export type Expense = {
  id: string;
  vendor: string;
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  payment_method: PaymentMethod | null;
  /** Supplier's ח.פ / עוסק number, as it appears on the receipt. */
  supplier_tax_id: string | null;
  /** Input VAT on the receipt (מע״מ תשומות). */
  vat_amount: number;
  /** Fraction of that VAT the business may claim: 1 = all, 0 = none. */
  vat_deductible_rate: number;
  /** Optional link to what the money was spent on, for job profitability. */
  job_id: string | null;
  customer_id: string | null;
  receipt_path: string | null;
  receipt_file_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type DocumentRecord = {
  id: string;
  customer_id: string | null;
  job_id: string | null;
  type: string;
  title: string;
  status: DocumentStatus;
  file_path: string | null;
  due_date: string | null;
  /** When the underlying license/certificate/insurance policy itself
   *  expires and needs renewing — separate from due_date, which is the
   *  deadline to finish the paperwork task. Optional: most document types
   *  (a one-off permit, a submitted form) never expire at all. */
  expiry_date: string | null;
  visible_to_customer: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// A named group inside the "resource library" (e.g. "בדיקות", "טפסים"
// under the "חברת חשמל" section) — free-form notes plus any number of
// attached files (ResourceFile). Deliberately not modeled as "categories
// per authority/company" — just one flat list of categories for now, with
// the "חברת חשמל" heading and its logo hard-coded in the page itself. If a
// second authority (עירייה, רשות הגז...) is ever needed, this table is the
// natural place to add a parent/authority grouping later.
//
// `is_checklist` marks one special category ("בדיקות"): instead of the
// normal editable free-text card (with edit/delete + files), it renders as
// a list of past inspections (see the Inspection type below) plus a
// "התחלת בדיקה חדשה" action — for the electrician's own personal
// record-keeping while on site, not a formal exported document.
// `checklist_state` is legacy (pre-history-list) free-form state and is no
// longer written to; kept only so old rows don't break reading the type.
export type ChecklistItemStatus = "pass" | "fail";

export type ResourceCategory = {
  id: string;
  name: string;
  notes: string | null;
  sort_order: number;
  is_checklist: boolean;
  checklist_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// One inspection visit ("בדיקות") — its own row per visit, so past
// inspections stay in a browsable history instead of a single
// overwritten/reset blob. `items` marks each checklist question's
// תקין/לא תקין state by its stable key (see ChecklistQuestion.id below —
// the questions themselves live in the checklist_questions table);
// `grounding_calc` holds the Zs loop-impedance calc inputs (see
// GroundingCalcState in apps/web/src/lib/inspectionChecklist.ts).
// Not scoped to a resource_categories row — there's only ever the one
// "בדיקות" category that renders this, so no category_id is needed.
export type Inspection = {
  id: string;
  customer_id: string | null;
  address: string | null;
  inspection_date: string;
  electrician_name: string | null;
  electrician_license: string | null;
  /** "1" (חד פאזי) or "3" (תלת פאזי) — combined with connection_amps for a label like "3x63A". */
  connection_phase: string | null;
  connection_amps: number | null;
  subpanel_count: number | null;
  circuits_checked: number | null;
  frequency_years: number | null;
  thermal_test_done: boolean;
  // The value type includes `undefined` on purpose — clearing a mark is
  // done by assigning the key to undefined (JSON.stringify then drops it
  // from the payload supabase-js sends), not by deleting the key in JS.
  items: Record<string, ChecklistItemStatus | undefined>;
  grounding_calc: Record<string, unknown>;
  // The insulation-resistance value read off the tester for the "ערכי
  // הבידוד..." question, plus which unit it was read in (kΩ/MΩ) — see
  // InsulationCalcState in apps/web/src/lib/inspectionChecklist.ts. Just a
  // record of the reading; unlike grounding_calc it doesn't drive an
  // automatic pass/fail.
  insulation_calc: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// One checklist question shown inside an inspection ("בדיקות"). Used to be
// a hardcoded constant (INSPECTION_CHECKLIST_SECTIONS in
// apps/web/src/lib/inspectionChecklist.ts); now editable/deletable from
// that page's UI (the pencil icon next to each question), so the real list
// lives here instead. `id` is the question's stable key — existing
// inspections' `items` (see Inspection above) refer to questions by this
// id, so it's deliberately a normal text primary key seeded to match the
// old hardcoded keys exactly (e.g. "grounding_main"), not a random uuid —
// renaming/reusing an id would silently orphan old marks.
export type ChecklistQuestion = {
  id: string;
  section_title: string;
  label: string;
  /** When true, this question gets an inline calculation sub-panel
   * (currently just the grounding loop-impedance question) and its
   * pass/fail is set automatically from that calc, not by hand. */
  has_calc: boolean;
  /** When true, this question gets a small "value + unit (kΩ/MΩ)" field
   * to record the insulation-resistance reading — just record-keeping,
   * no automatic pass/fail like has_calc above. */
  has_insulation_measurement: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// A single uploaded file attached to a ResourceCategory. Stored in the same
// "documents" storage bucket as DocumentRecord's files (under a
// "resources/<category_id>/..." path), so no new bucket/policy setup was
// needed.
// `slot_id` is only used by the "בדיקות" category's fixed document list
// (see DocumentSlot below) — it links this file to the one named slot it
// fills. Every other category's files leave it null (free-form uploads,
// not tied to a fixed name).
export type ResourceFile = {
  id: string;
  category_id: string;
  file_name: string;
  file_path: string;
  slot_id: string | null;
  created_at: string;
};

// One entry in the "בדיקות" category's fixed-but-editable list of optional
// document names (e.g. "תעודת בודק מוסמך") — shown behind the documents
// icon next to "+ התחלת בדיקה חדשה". Each slot can hold at most one
// uploaded file (a ResourceFile whose slot_id points here).
export type DocumentSlot = {
  id: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  converted_customer_id: string | null;
  /** When to reach out next — separate from created_at, which never moves. */
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type AppSetting = {
  key: string;
  value: unknown;
};

export type MarketingPostPlatform = "facebook" | "instagram" | "other";
export type MarketingPostStatus = "idea" | "draft" | "scheduled" | "published";

// A planned social-media post (פייסבוק/אינסטגרם/אחר) — content planning and
// tracking only, not real auto-posting (that needs a Meta developer account,
// which is a separate, later step). Lives in its own "תוכן שיווקי" tab on
// the leads/marketing page.
export type MarketingPost = {
  id: string;
  platform: MarketingPostPlatform;
  status: MarketingPostStatus;
  title: string;
  content: string | null;
  scheduled_date: string | null;
  published_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// Minimal `Database` shape (subset of what supabase-js's generic typing
// expects), enough to type the client without pulling in a full generated
// file yet. `Tbl<>` fills in the `Relationships` field every table needs
// (we don't model foreign-key relationship metadata by hand — embedded
// `.select("*, customer:customers(*)")` queries will just come back as
// `any` until real generated types replace this file).
type Tbl<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Tbl<Profile, Partial<Profile> & { id: string }, Partial<Profile>>;
      customers: Tbl<Customer, Partial<Customer> & { name: string }, Partial<Customer>>;
      jobs: Tbl<Job, Partial<Job> & { customer_id: string; title: string }, Partial<Job>>;
      inventory_items: Tbl<InventoryItem, Partial<InventoryItem> & { name: string }, Partial<InventoryItem>>;
      inventory_transactions: Tbl<
        InventoryTransaction,
        Partial<InventoryTransaction> & { inventory_item_id: string; quantity_delta: number; reason: InventoryReason },
        Partial<InventoryTransaction>
      >;
      price_list_items: Tbl<PriceListItem, Partial<PriceListItem> & { name: string }, Partial<PriceListItem>>;
      quotes: Tbl<Quote, Partial<Quote> & { customer_id: string }, Partial<Quote>>;
      quote_line_items: Tbl<
        QuoteLineItem,
        Partial<QuoteLineItem> & { quote_id: string; description: string },
        Partial<QuoteLineItem>
      >;
      invoices: Tbl<Invoice, Partial<Invoice> & { customer_id: string }, Partial<Invoice>>;
      invoice_line_items: Tbl<
        InvoiceLineItem,
        Partial<InvoiceLineItem> & { invoice_id: string; description: string },
        Partial<InvoiceLineItem>
      >;
      invoice_payments: Tbl<
        InvoicePayment,
        Partial<InvoicePayment> & { invoice_id: string; amount: number },
        Partial<InvoicePayment>
      >;
      expenses: Tbl<Expense, Partial<Expense> & { vendor: string }, Partial<Expense>>;
      documents: Tbl<DocumentRecord, Partial<DocumentRecord> & { title: string }, Partial<DocumentRecord>>;
      resource_categories: Tbl<ResourceCategory, Partial<ResourceCategory> & { name: string }, Partial<ResourceCategory>>;
      resource_files: Tbl<
        ResourceFile,
        Partial<ResourceFile> & { category_id: string; file_name: string; file_path: string },
        Partial<ResourceFile>
      >;
      leads: Tbl<Lead, Partial<Lead> & { name: string }, Partial<Lead>>;
      inspections: Tbl<Inspection, Partial<Inspection>, Partial<Inspection>>;
      checklist_questions: Tbl<
        ChecklistQuestion,
        Partial<ChecklistQuestion> & { id: string; section_title: string; label: string },
        Partial<ChecklistQuestion>
      >;
      app_settings: Tbl<AppSetting, AppSetting, Partial<AppSetting>>;
      marketing_posts: Tbl<MarketingPost, Partial<MarketingPost> & { title: string }, Partial<MarketingPost>>;
      document_slots: Tbl<DocumentSlot, Partial<DocumentSlot> & { label: string }, Partial<DocumentSlot>>;
    };
    Views: Record<string, never>;
    Functions: {
      link_or_create_customer_for_current_user: {
        Args: { p_phone: string | null; p_full_name: string | null };
        Returns: string;
      };
      record_inventory_transaction: {
        Args: {
          p_inventory_item_id: string;
          p_job_id: string | null;
          p_quantity_delta: number;
          p_reason: InventoryReason;
        };
        Returns: string;
      };
      respond_to_quote: {
        Args: { p_quote_id: string; p_accept: boolean };
        Returns: undefined;
      };
    };
  };
};
