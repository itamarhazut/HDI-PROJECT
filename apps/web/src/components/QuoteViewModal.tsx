import { useNavigate } from "react-router-dom";
import { Button, Modal } from "@repo/ui";
import { QuoteDocumentView, type QuoteDocumentData } from "./QuoteDocumentView";
import { useQuoteDocumentData } from "../hooks/useQuoteDocumentData";
import { useQuoteSharing } from "../hooks/useQuoteSharing";

interface QuoteViewModalProps {
  onClose: () => void;
  /** Base path for the real print route, e.g. "/admin/quotes" or "/portal/quotes". */
  printBasePath: string;
  /** Show sharing actions — only makes sense from the admin side (sending TO a customer). */
  allowShare?: boolean;
}

// Viewing a SAVED quote: fetches by id, shows it in-page (no new tab),
// with a button that navigates (same tab) to the real print route for
// the actual PDF/print step.
interface SavedQuoteViewModalProps extends QuoteViewModalProps {
  quoteId: string;
}

export function QuoteViewModal({ quoteId, onClose, printBasePath, allowShare }: SavedQuoteViewModalProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuoteDocumentData(quoteId);
  const sharing = useQuoteSharing(allowShare ? data : null);

  return (
    <Modal
      open
      onClose={onClose}
      title={data ? `הצעת מחיר ${data.quoteNumberLabel}` : "הצעת מחיר"}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          {allowShare && (
            <>
              <Button variant="outline" onClick={sharing.shareGeneric} disabled={!data || sharing.busy !== null}>
                {sharing.busy === "share" ? "משתף..." : "שיתוף"}
              </Button>
              <Button variant="outline" onClick={sharing.shareEmail} disabled={!data || sharing.busy !== null}>
                {sharing.busy === "email" ? "משתף..." : "שיתוף במייל"}
              </Button>
              <Button variant="outline" onClick={sharing.shareWhatsApp} disabled={!data || sharing.busy !== null}>
                {sharing.busy === "whatsapp" ? "משתף..." : "שיתוף בוואטסאפ"}
              </Button>
            </>
          )}
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
        <>
          {allowShare && (
            <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              כפתורי השיתוף שולחים את קובץ ה-PDF עצמו. בטלפון: נפתח תפריט השיתוף של המכשיר — בחרו את האפליקציה הרצויה
              משם. במחשב: אין תפריט כזה, אז הקובץ יורד אליכם והאפליקציה (וואטסאפ/מייל) נפתחת עם טקסט מוכן — פשוט צרפו
              את הקובץ שירד.
            </p>
          )}
          <div ref={sharing.docRef}>
            <QuoteDocumentView data={data} />
          </div>
        </>
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
