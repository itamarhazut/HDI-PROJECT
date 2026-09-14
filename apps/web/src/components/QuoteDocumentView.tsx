import { QUOTE_STATUS_LABELS, type QuoteDiscountType, type QuoteStatus } from "@repo/shared";
import { LogoMark } from "./Logo";
import { formatCurrency, formatDate } from "../lib/format";

// The issuing business's own identity — shown on every quote so it reads
// as a real business document instead of just the app's own branding.
// There's no "business profile" settings screen yet, so this is a plain
// constant confirmed directly with the business owner; if these details
// ever change (or should become editable from the UI), update here.
const BUSINESS_INFO = {
  taxIdLabel: "עוסק פטור",
  taxId: "212183008",
  email: "itamarhazut10@gmail.com",
};

export interface QuoteDocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteDocumentData {
  /** "#1001" for a real quote, or a placeholder like "טיוטה — טרם הופקה" for an unsaved preview. */
  quoteNumberLabel: string;
  issuedDate: string | null;
  validUntil: string | null;
  status: QuoteStatus | string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  lineItems: QuoteDocumentLineItem[];
  subtotal: number;
  /** Discount amount in shekels — already converted from a percentage if discountType is "percent". */
  discount: number;
  discountType: QuoteDiscountType;
  /** The raw percent number entered (e.g. 10 for 10%) — only meaningful when discountType is "percent". */
  discountPercent?: number | null;
  /** Whether this quote charges VAT at all — false for an "עוסק פטור" business. */
  includeVat: boolean;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
}

// Presentational quote document — the same layout is used by the real
// print/PDF route (QuotePrintPage, fetches a saved quote by id), the
// in-page "view" modal (also a saved quote, just shown without leaving
// the list page), the live "preview" modal in the quote form (built
// straight from in-memory, not-yet-saved form values), and the hidden
// node captured into an actual PDF file for sharing (see useQuoteSharing).
// Keeping the rendering in one place means all four always look identical.
// Deliberately plain and light — modeled directly on a real invoice the
// business owner sent as the visual reference. Earlier drafts used heavy
// full-width colored bands, filled gray cards, and zebra-striped tables;
// the owner said it looked "too big and cluttered" next to the reference,
// which uses color sparingly (one accent tone) and lets whitespace and
// plain text carry almost everything.
export function QuoteDocumentView({ data }: { data: QuoteDocumentData }) {
  const statusLabel = QUOTE_STATUS_LABELS[data.status as QuoteStatus] ?? data.status;

  return (
    <div className="mx-auto max-w-3xl bg-card px-10 py-8 text-foreground print:max-w-none">
      {/* Business identity: name + tax details on one side, mark on the other */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-bold tracking-tight">HDI PROJECT</p>
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <p>
              {BUSINESS_INFO.taxIdLabel}: {BUSINESS_INFO.taxId}
            </p>
            <p>{BUSINESS_INFO.email}</p>
          </div>
        </div>
        <LogoMark className="h-14 w-14 shrink-0" />
      </div>

      {/* Title */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">הצעת מחיר {data.quoteNumberLabel}</h1>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      {/* Customer + dates */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3 text-sm">
        <div className="space-y-0.5">
          <p>
            <span className="text-muted-foreground">לכבוד: </span>
            <span className="font-medium">{data.customerName || "—"}</span>
          </p>
          {data.customerPhone && <p className="text-muted-foreground">{data.customerPhone}</p>}
          {data.customerEmail && <p className="text-muted-foreground">{data.customerEmail}</p>}
        </div>
        <div className="space-y-0.5 text-left text-muted-foreground">
          {data.issuedDate && <p>תאריך: {formatDate(data.issuedDate)}</p>}
          {data.validUntil && <p>בתוקף עד: {formatDate(data.validUntil)}</p>}
        </div>
      </div>

      {/* Line items */}
      <div className="mt-6">
        {data.customerAddress && (
          <div className="rounded-t-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            {data.customerAddress}
          </div>
        )}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr
              className={
                data.customerAddress
                  ? "border-b border-border text-right text-xs font-semibold text-muted-foreground"
                  : "rounded-t-md bg-accent text-right text-accent-foreground"
              }
            >
              <th className="px-3 py-2.5 font-semibold">תיאור</th>
              <th className="px-3 py-2.5 font-semibold">כמות</th>
              <th className="px-3 py-2.5 font-semibold">מחיר יחידה</th>
              <th className="px-3 py-2.5 font-semibold">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {data.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-border">
                <td className="px-3 py-2.5">{li.description}</td>
                <td className="px-3 py-2.5">{li.quantity}</td>
                <td className="px-3 py-2.5">{formatCurrency(li.unit_price)}</td>
                <td className="px-3 py-2.5 font-medium">{formatCurrency(li.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">סכום ביניים</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
          {data.includeVat && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">מע״מ ({Math.round(data.taxRate * 100)}%)</span>
              <span>{formatCurrency(data.taxAmount)}</span>
            </div>
          )}
          {data.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                הנחה{data.discountType === "percent" && data.discountPercent ? ` (${data.discountPercent}%)` : ""}
              </span>
              <span>-{formatCurrency(data.discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold">סה״כ לתשלום</span>
            <span className="rounded-md bg-accent px-3 py-1.5 font-bold text-accent-foreground">
              {formatCurrency(data.total)}
            </span>
          </div>
          {!data.includeVat && <p className="text-left text-xs text-muted-foreground">* אינו כולל מע״מ (עוסק פטור)</p>}
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="mt-6 border-t border-border pt-4 text-sm">
          <p className="mb-1 font-medium text-muted-foreground">הערות</p>
          <p className="whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {/* Approval / signature */}
      <div className="mt-8 border-t border-border pt-5">
        <p className="mb-4 text-sm font-semibold">אישור הצעת המחיר</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm sm:grid-cols-4">
          <div>
            <div className="h-6 border-b-2 border-accent" />
            <p className="mt-1.5 text-xs text-muted-foreground">שם</p>
          </div>
          <div>
            <div className="h-6 border-b-2 border-accent" />
            <p className="mt-1.5 text-xs text-muted-foreground">תאריך</p>
          </div>
          <div className="col-span-2">
            <div className="h-6 border-b-2 border-accent" />
            <p className="mt-1.5 text-xs text-muted-foreground">חתימה</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-3 text-center text-xs text-muted-foreground">
        מסמך זה הופק באמצעות מערכת HDI PROJECT · הצעת מחיר {data.quoteNumberLabel}
      </div>
    </div>
  );
}
