import * as React from "react";
import { useToast } from "@repo/ui";
import { formatCurrency } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { canShareFiles, elementToPdfBlob, saveOrDownloadBlob, trySaveFilePicker } from "../lib/pdf";
import type { InvoiceDocumentData } from "../components/InvoiceDocumentView";

// Mirrors useQuoteSharing exactly — see there for the reasoning behind
// each step (the file-picker-before-render timing, the native-share vs.
// desktop-download split, etc.). Only the wording and the shape of the
// shared data differ.
function buildShareText(data: InvoiceDocumentData) {
  return [`חשבונית ${data.invoiceNumberLabel} - HDI Project`, `לקוח: ${data.customerName}`, `סה״כ: ${formatCurrency(data.amount)}`].join(
    "\n"
  );
}

function toWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.startsWith("972")) return digits;
  return digits;
}

function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function invoicePdfFileName(data: InvoiceDocumentData) {
  const customer = sanitizeFileNamePart(data.customerName || "לקוח");
  const number = data.invoiceNumberLabel.replace(/^#/, "");
  return `חשבונית - ${customer} (${number}).pdf`;
}

export function useInvoiceSharing(data: InvoiceDocumentData | null) {
  const toast = useToast();
  const docRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState<"share" | "whatsapp" | "email" | null>(null);

  const runShare = (
    key: "share" | "whatsapp" | "email",
    afterSave: (outcome: "saved" | "downloaded") => void,
    options?: { allowNativeShareSheet?: boolean }
  ) =>
    async () => {
      if (!data) return;
      setBusy(key);
      try {
        const fileName = invoicePdfFileName(data);
        const allowNativeShareSheet = options?.allowNativeShareSheet ?? true;

        // See useQuoteSharing for the full reasoning: the generic "שיתוף"
        // button uses the native share sheet when the browser supports
        // it; the WhatsApp/Email buttons always set
        // allowNativeShareSheet: false so they save/download the file and
        // open their channel directly instead of a generic app picker.
        const probeFile = new File([], fileName, { type: "application/pdf" });
        const nativeShareLikely = allowNativeShareSheet && canShareFiles([probeFile]);

        const handle = nativeShareLikely ? null : await trySaveFilePicker(fileName);

        if (!docRef.current) throw new Error("המסמך עדיין לא מוכן.");
        const blob = await elementToPdfBlob(docRef.current);

        if (nativeShareLikely) {
          const file = new File([blob], fileName, { type: "application/pdf" });
          if (canShareFiles([file])) {
            await navigator.share({ files: [file] });
            return;
          }
        }

        const outcome = await saveOrDownloadBlob(blob, fileName, handle);
        afterSave(outcome);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        toast({ title: "השיתוף נכשל", description: getErrorMessage(err), variant: "error" });
      } finally {
        setBusy(null);
      }
    };

  const shareGeneric = runShare("share", (outcome) => {
    toast({
      title: "שיתוף ישיר זמין רק בטלפון",
      description:
        outcome === "saved" ? "קובץ ה-PDF נשמר — אפשר לצרף אותו בכל אפליקציה." : "קובץ ה-PDF ירד — אפשר לצרף אותו ידנית בכל אפליקציה.",
    });
  });

  const shareWhatsApp = runShare(
    "whatsapp",
    (outcome) => {
      if (data) {
        const phone = toWhatsAppPhone(data.customerPhone);
        window.open(`https://wa.me/${phone ?? ""}?text=${encodeURIComponent(buildShareText(data))}`, "_blank", "noopener,noreferrer");
      }
      toast({
        title: outcome === "saved" ? "קובץ ה-PDF נשמר" : "קובץ ה-PDF ירד",
        description: "וואטסאפ נפתח עם טקסט מוכן — צרפו את הקובץ שנשמר/ירד להודעה.",
      });
    },
    { allowNativeShareSheet: false }
  );

  const shareEmail = runShare(
    "email",
    (outcome) => {
      if (data) {
        const subject = `חשבונית ${data.invoiceNumberLabel} - HDI Project`;
        const body = buildShareText(data);
        const to = data.customerEmail ?? "";
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
      toast({
        title: outcome === "saved" ? "קובץ ה-PDF נשמר" : "קובץ ה-PDF ירד",
        description: "תוכנת המייל נפתחה עם טקסט מוכן — צרפו את הקובץ שנשמר/ירד ידנית.",
      });
    },
    { allowNativeShareSheet: false }
  );

  return { docRef, busy, shareGeneric, shareWhatsApp, shareEmail };
}
