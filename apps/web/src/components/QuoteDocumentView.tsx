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
  /** Mask this row's own unit-price/total as "****" — the columns themselves always stay; this used to be a whole-quote toggle that hid the columns entirely, now it's per-row and only masks the numbers. */
  hidePrice?: boolean;
}

export interface QuoteDocumentData {
  /** "#1001" for a real quote, or a placeholder like "טיוטה — טרם הופקה" for an unsaved preview. */
  quoteNumberLabel: string;
  issuedDate: string | null;
  validUntil: string | null;
  status: QuoteStatus | string;
  customerName: string;
  /** ח.פ / עוסק מורשה registration number — shown under the customer's name when set. */
  customerBusinessId?: string | null;
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
  /** Fixed text shown just above the signature section, the same on every quote (see SettingsPage). */
  footerText?: string | null;
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
export function QuoteDocumentView({
  data,
  copyLabel = "מקור",
  fillPage = false,
}: {
  data: QuoteDocumentData;
  /** "מקור" (original) or "העתק" (copy) — a printed/PDF'd document is marked as one or the other; only the
   * dedicated print route lets the person switch it before printing (see QuotePrintPage). Every other surface
   * (view modal, live preview, shared PDF) just shows the default "מקור". */
  copyLabel?: "מקור" | "העתק";
  /**
   * When true, the document fills a full printed-page height (matching the
   * page proportions elementToPdfBlob/lib/pdf.ts assumes for this same
   * 48rem width) and the signature/footer block is pushed down to the
   * bottom of that page instead of sitting right under the totals — so a
   * short quote still looks like a properly laid-out one-page document
   * instead of ending abruptly partway down. Only meaningful for surfaces
   * that actually represent a full printed page (the print route, and the
   * hidden node rasterized for a shared PDF) — left off for the compact
   * view/preview modals, where forcing a full page's worth of height would
   * just be a lot of empty space inside a small popup.
   */
  fillPage?: boolean;
}) {
  const statusLabel = QUOTE_STATUS_LABELS[data.status as QuoteStatus] ?? data.status;
  // The highlighted accent bar above the line items used to show the
  // customer's address. The business owner asked for that spot to read as
  // "הערות והבהרות" (notes and clarifications) instead — the address moved
  // down into the plain customer-details block below, next to phone/email.
  // The bar itself is now ALWAYS shown (the label alone when there's
  // nothing to add), not just when notes happen to be filled in — an
  // earlier version only rendered it when data.notes was truthy, which had
  // the table's own header row take over the accent styling whenever notes
  // were empty (so clearing a quote's notes visibly "moved" the accent bar
  // down onto the כמות/תיאור/... row). Keeping the bar's presence and the
  // header row's plain styling unconditional avoids that entirely.

  return (
    <div
      className={`mx-auto max-w-3xl bg-card px-10 py-8 text-foreground print:max-w-none${
        fillPage ? " flex flex-col" : ""
      }`}
      // A4 proportions applied to this component's own fixed 48rem (max-w-3xl)
      // width — 297/210 is the A4 height/width ratio. Matches the page-height
      // budget elementToPdfBlob computes for a document rasterized at this
      // same width, so "one full page" here lines up with "one full page"
      // there.
      style={fillPage ? { minHeight: "calc(48rem * 297 / 210)" } : undefined}
    >
      {/* Business identity: name + tax details on one side, mark on the other */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">בס״ד</p>
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
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5 font-medium">{copyLabel}</span>
          {statusLabel}
        </span>
      </div>

      {/* Customer + dates */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3 text-sm">
        <div className="space-y-0.5">
          <p>
            <span className="text-muted-foreground">לכבוד: </span>
            <span className="font-medium">{data.customerName || "—"}</span>
          </p>
          {data.customerBusinessId && <p className="text-muted-foreground">ח.פ / עוסק מורשה: {data.customerBusinessId}</p>}
          {data.customerPhone && <p className="text-muted-foreground">טלפון: {data.customerPhone}</p>}
          {data.customerEmail && <p className="text-muted-foreground">אימייל: {data.customerEmail}</p>}
          {data.customerAddress && <p className="text-muted-foreground">כתובת: {data.customerAddress}</p>}
        </div>
        <div className="space-y-0.5 text-left text-muted-foreground">
          {data.issuedDate && <p>תאריך: {formatDate(data.issuedDate)}</p>}
          {data.validUntil && <p>בתוקף עד: {formatDate(data.validUntil)}</p>}
        </div>
      </div>

      {/* Line items */}
      <div className="mt-6">
        <div className="whitespace-pre-wrap rounded-t-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
          <span>הערות והבהרות: </span>
          {data.notes && <span className="font-normal">{data.notes}</span>}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-right text-xs font-semibold text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">כמות</th>
              <th className="px-3 py-2.5 font-semibold">תיאור</th>
              <th className="px-3 py-2.5 font-semibold">מחיר יחידה</th>
              <th className="px-3 py-2.5 font-semibold">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {data.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-border">
                <td className="px-3 py-2.5">{li.quantity}</td>
                <td className="px-3 py-2.5">{li.description}</td>
                {/* Masking is per-row, not a whole-column toggle — the
                    columns themselves always stay so the table's shape
                    doesn't shift row to row; only the number is replaced. */}
                <td className="px-3 py-2.5">{li.hidePrice ? "****" : formatCurrency(li.unit_price)}</td>
                <td className="px-3 py-2.5 font-medium">{li.hidePrice ? "****" : formatCurrency(li.line_total)}</td>
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

      {/* Fixed footer text (set once in Settings, appears on every quote) */}
      {data.footerText && (
        <div className="mt-6 whitespace-pre-wrap border-t border-border pt-4 text-xs text-muted-foreground">
          {data.footerText}
        </div>
      )}

      {/* Approval / signature — when fillPage is on, `mt-auto` (instead of
          the plain mt-8 spacing) pushes this block, and the footer line
          right after it, down to the bottom of the page: any leftover
          space above (a short quote with few line items) becomes margin
          here instead of leaving the document looking like it just stops
          partway down. `mt-auto` only does anything because the root div
          above is a flex column when fillPage is set — without that it's
          a no-op and this falls back to its normal in-flow position. */}
      <div className={fillPage ? "mt-auto border-t border-border pt-5" : "mt-8 border-t border-border pt-5"}>
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
