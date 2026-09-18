import { useNavigate } from "react-router-dom";
import { Button, Modal } from "@repo/ui";
import { InvoiceDocumentView } from "./InvoiceDocumentView";
import { useInvoiceDocumentData } from "../hooks/useInvoiceDocumentData";

interface InvoiceViewModalProps {
  invoiceId: string;
  onClose: () => void;
  /** Base path for the real print route, e.g. "/admin/invoices". */
  printBasePath: string;
}

// Mirrors QuoteViewModal exactly — viewing a saved invoice in-page, with a
// button to the real print route for the actual PDF/print step.
//
// Sharing used to live here too, but it moved out to the detail page's
// own toolbar (see InvoiceDetailPage) so it's reachable in one click
// without opening this modal first.
export function InvoiceViewModal({ invoiceId, onClose, printBasePath }: InvoiceViewModalProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useInvoiceDocumentData(invoiceId);

  return (
    <Modal
      open
      onClose={onClose}
      title={data ? `חשבונית ${data.invoiceNumberLabel}` : "חשבונית"}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <Button variant="destructive" onClick={onClose}>
            סגירה
          </Button>
          <Button onClick={() => navigate(`${printBasePath}/${invoiceId}/print`)} disabled={!data}>
            הורדה / הדפסה כ-PDF
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="p-4 text-muted-foreground">טוען...</p>
      ) : error || !data ? (
        <p className="p-4 text-destructive">לא ניתן לטעון את החשבונית.</p>
      ) : (
        <InvoiceDocumentView data={data} />
      )}
    </Modal>
  );
}
