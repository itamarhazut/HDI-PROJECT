import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@repo/shared";
import { LogoMark } from "./Logo";
import { formatCurrency, formatDate } from "../lib/format";

// Same fixed business identity used on the quote document — see
// QuoteDocumentView for why this isn't pulled from a settings screen yet.
const BUSINESS_INFO = {
  taxIdLabel: "עוסק פטור",
  taxId: "212183008",
  email: "itamarhazut10@gmail.com",
};

export interface InvoiceDocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoiceDocumentData {
  /** "#1001" for a real invoice. */
  invoiceNumberLabel: string;
  issuedDate: string | null;
  status: InvoiceStatus | string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  lineItems: InvoiceDocumentLineItem[];
  /** The invoice's total — always present, whether or not it has itemized rows. */
  amount: number;
  /**
   * The breakdown behind the total. Invoices only carried a bare total
   * before, so this document always printed "אינו כולל מע״מ" even when VAT
   * had in fact been charged — a customer-facing document saying the wrong
   * thing about tax.
   */
  subtotal?: number;
  discountAmount?: number;
  includeVat?: boolean;
  taxRate?: number;
  taxAmount?: number;
  notes?: string | null;
}

// Presentational invoice document — deliberately the same layout as
// QuoteDocumentView (same header, customer block, line-items table, totals
// and footer style) so an invoice reads as "the same kind of document,
// just an invoice" rather than something unrelated. Used by the real
// print/PDF route (InvoicePrintPage) and the in-page "view" modal
// (InvoiceViewModal) — both fetch a saved invoice by id, so they always
// look identical.
export function InvoiceDocumentView({ data }: { data: InvoiceDocumentData }) {
  const statusLabel = INVOICE_STATUS_LABELS[data.status as InvoiceStatus] ?? data.status;

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
        <h1 className="text-3xl font-bold">חשבונית {data.invoiceNumberLabel}</h1>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      {/* Customer + date */}
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
        </div>
      </div>

      {/* Line items */}
      <div className="mt-6">
        {data.customerAddress && (
          <div className="rounded-t-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            {data.customerAddress}
          </div>
        )}
        {data.lineItems.length > 0 ? (
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
        ) : (
          <div
            className={
              data.customerAddress
                ? "border-b border-border py-3 text-sm text-muted-foreground"
                : "rounded-t-md bg-accent px-4 py-3 text-sm text-accent-foreground"
            }
          >
            תשלום עבור שירותי חשמל
          </div>
        )}
      </div>

      {/* Total */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1.5 text-sm">
          {data.subtotal !== undefined && (data.includeVat || (data.discountAmount ?? 0) > 0) && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">סכום ביניים</span>
                <span>{formatCurrency(data.subtotal)}</span>
              </div>
              {(data.discountAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">הנחה</span>
                  <span>-{formatCurrency(data.discountAmount as number)}</span>
                </div>
              )}
              {data.includeVat && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">מע״מ ({Math.round((data.taxRate ?? 0) * 100)}%)</span>
                  <span>{formatCurrency(data.taxAmount ?? 0)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold">סה״כ לתשלום</span>
            <span className="rounded-md bg-accent px-3 py-1.5 font-bold text-accent-foreground">
              {formatCurrency(data.amount)}
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

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-3 text-center text-xs text-muted-foreground">
        מסמך זה הופק באמצעות מערכת HDI PROJECT · חשבונית {data.invoiceNumberLabel}
      </div>
    </div>
  );
}
