import { useNavigate } from "react-router-dom";
import { Button, Modal } from "@repo/ui";
import { QuoteDocumentView, type QuoteDocumentData } from "./QuoteDocumentView";
import { useQuoteDocumentData } from "../hooks/useQuoteDocumentData";

interface QuoteViewModalProps {
  onClose: () => void;
  /** Base path for the real print route, e.g. "/admin/quotes" or "/portal/quotes". */
  printBasePath: string;
}

// Viewing a SAVED quote: fetches by id, shows it in-page (no new tab),
// with a button that navigates (same tab) to the real print route for
// the actual PDF/print step.
//
// Sharing used to live here too (a footer of "שיתוף"/"שיתוף בוואטסאפ"/
// "שיתוף במייל" buttons), but it moved out to the detail page's own
// toolbar (see QuoteDetailPage) so it's reachable in one click without
// opening this modal first — this component is back to being just a
// preview + the print/PDF route link.
interface SavedQuoteViewModalProps extends QuoteViewModalProps {
  quoteId: string;
}

export function QuoteViewModal({ quoteId, onClose, printBasePath }: SavedQuoteViewModalProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuoteDocumentData(quoteId);

  return (
    <Modal
      open
      onClose={onClose}
      title={data ? `הצעת מחיר ${data.quoteNumberLabel}` : "הצעת מחיר"}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <Button variant="destructive" onClick={onClose}>
            סגירה
          </Button>
          <Button onClick={() => navigate(`${printBasePath}/${quoteId}/print`)} disabled={!data}>
            הורדה / הדפסה כ-PDF
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="p-4 text-muted-foreground">טוען...</p>
      ) : error || !data ? (
        <p className="p-4 text-destructive">לא ניתן לטעון את הצעת המחיר.</p>
      ) : (
        <QuoteDocumentView data={data} />
      )}
    </Modal>
  );
}

interface PreviewQuoteModalProps {
  onClose: () => void;
  data: QuoteDocumentData;
}

// Live preview of an unsaved quote, built straight from the current form
// values — no fetch, since there's no id yet. No print button: printing
// only makes sense once the quote actually exists.
export function QuotePreviewModal({ onClose, data }: PreviewQuoteModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="תצוגה מקדימה"
      maxWidthClassName="max-w-3xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          חזרה לעריכה
        </Button>
      }
    >
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        זו תצוגה מקדימה בלבד — לאחר השמירה ניתן יהיה להדפיס או לשמור כ-PDF.
      </p>
      <QuoteDocumentView data={data} />
    </Modal>
  );
}
