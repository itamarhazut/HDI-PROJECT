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
  phone: string | null;
  email: string | null;
  address: string | null;
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

export type InventoryTransaction = {
  id: string;
  inventory_item_id: string;
  job_id: string | null;
  quantity_delta: number;
  reason: InventoryReason;
  created_at: string;
  created_by: string | null;
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
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
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
};

export type Invoice = {
  id: string;
  invoice_number: number;
  customer_id: string;
  job_id: string | null;
  quote_id: string | null;
  status: InvoiceStatus;
  amount: number;
  issued_date: string | null;
  paid_date: string | null;
  external_provider: string | null;
  external_reference: string | null;
  external_url: string | null;
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
  visible_to_customer: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
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
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type AppSetting = {
  key: string;
  value: unknown;
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
      documents: Tbl<DocumentRecord, Partial<DocumentRecord> & { title: string }, Partial<DocumentRecord>>;
      leads: Tbl<Lead, Partial<Lead> & { name: string }, Partial<Lead>>;
      app_settings: Tbl<AppSetting, AppSetting, Partial<AppSetting>>;
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
    };
  };
};
