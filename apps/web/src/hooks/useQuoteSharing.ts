import * as React from "react";
import { useToast } from "@repo/ui";
import { formatCurrency, formatDate } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { canShareFiles, elementToPdfBlob, saveOrDownloadBlob, trySaveFilePicker } from "../lib/pdf";
import type { QuoteDocumentData } from "../components/QuoteDocumentView";

function buildShareText(data: QuoteDocumentData) {
  const lines = [
    `הצעת מחיר ${data.quoteNumberLabel} - HDI Project`,
    `לקוח: ${data.customerName}`,
    `סה״כ: ${formatCurrency(data.total)}`,
  ];
  if (data.validUntil) lines.push(`בתוקף עד: ${formatDate(data.validUntil)}`);
  return lines.join("\n");
}

// Normalizes a loosely-formatted Israeli phone number ("050-1234567", "05012345
// 67") into the digits-only international form wa.me expects ("9725012345
// 67"). Returns null if there's nothing usable to normalize.
function toWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.startsWith("972")) return digits;
  return digits;
}

// Strips only the characters that are actually illegal in a Windows/macOS
// file name; keeps everything else (Hebrew included) intact. The previous
// version used `/[^\w-]+/g` to "sanitize" the name — but JavaScript's `\w`
// only matches ASCII letters/digits/underscore, so every Hebrew character
// got treated as "unsafe" and replaced with "_", turning any Hebrew
// customer name into a string of underscores. That's the garbled filename
// bug — nothing to do with WhatsApp itself.
function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quotePdfFileName(data: QuoteDocumentData) {
  const customer = sanitizeFileNamePart(data.customerName || "לקוח");
  const number = data.quoteNumberLabel.replace(/^#/, "");
  return `הצעת מחיר - ${customer} (${number}).pdf`;
}

// Shared "share this quote" logic, used both by the saved-quote view modal
// (fetches a saved quote) and live from the edit form (built straight from
// in-memory form values, no save required first). `docRef` must be
// attached to whatever element visually IS the quote document — a
// <QuoteDocumentView> — since that's what gets rasterized into the shared
// PDF (it doesn't have to be visible on screen; see QuoteForm for a
// hidden-but-rendered usage).
//
// IMPORTANT, honest limitation: no website can jump straight into a
// specific app (WhatsApp, Mail...) with a file already attached — only
// the phone's own native share sheet can hand a real file to another app,
// and only the person's own tap picks which app. So on a phone, all three
// actions below open the exact same share sheet; the "WhatsApp"/"Email"
// buttons only set the wording, not which app opens — same technical
// action, different button for whichever the person usually reaches for.
// On desktop (no such share sheet exists), each falls back to downloading
// the PDF plus opening that channel with a text summary, so it's one
// manual attach away from done.
export function useQuoteSharing(data: QuoteDocumentData | null) {
  const toast = useToast();
  const docRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState<"share" | "whatsapp" | "email" | null>(null);

  const runShare = (key: "share" | "whatsapp" | "email", afterSave: (outcome: "saved" | "downloaded") => void) =>
    async () => {
      if (!data) return;
      setBusy(key);
      try {
        const fileName = quotePdfFileName(data);

        // Decide up front, with a cheap zero-byte probe file, whether this
        // browser can hand a real file to the native share sheet (mobile)
        // or whether we're going to need the desktop "Save As" fallback —
        // deciding this needs no PDF content, just the name/type.
        const probeFile = new File([], fileName, { type: "application/pdf" });
        const nativeShareLikely = canShareFiles([probeFile]);

        // On the desktop fallback path, open the native "Save As" dialog
        // RIGHT NOW, before the slow PDF render below — not after. That
        // dialog only works within a short window of real user activation
        // from the click that triggered this handler; a multi-second
        // html2canvas render in between was silently burning through that
        // window, so the picker call was failing every time and quietly
        // falling back to the old method that mangles Hebrew file names.
        // If the person cancels this dialog, stop here — no point
        // rendering a PDF nobody asked to keep.
        const handle = nativeShareLikely ? null : await trySaveFilePicker(fileName);

        if (!docRef.current) throw new Error("המסמך עדיין לא מוכן.");
        const blob = await elementToPdfBlob(docRef.current);

        if (nativeShareLikely) {
          const file = new File([blob], fileName, { type: "application/pdf" });
          if (canShareFiles([file])) {
            // Only `files` — no `text`/`title`. Passing a `text` here used
            // to make WhatsApp send it as its own separate message ahead
            // of the file, which wasn't wanted: just the file, nothing else.
            await navigator.share({ files: [file] });
            return;
          }
        }

        const outcome = await saveOrDownloadBlob(blob, fileName, handle);
        afterSave(outcome);
      } catch (err) {
        // AbortError = the person closed the native share sheet, or
        // cancelled the "save as" dialog, without picking/saving anything —
        // not a real failure, nothing to report.
        if (err instanceof Error && err.name === "AbortError") return;
        toast({ title: "השיתוף נכשל", description: getErrorMessage(err), variant: "error" });
      } finally {
        setBusy(null);
      }
    };

  const shareGeneric = runShare("share", (outcome) => {
    toast({
      title: "שיתוף ישיר זמין רק בטלפון",
      description: outcome === "saved" ? "קובץ ה-PDF נשמר — אפשר לצרף אותו בכל אפליקציה." : "קובץ ה-PDF ירד — אפשר לצרף אותו ידנית בכל אפליקציה.",
    });
  });

  const shareWhatsApp = runShare("whatsapp", (outcome) => {
    if (data) {
      const phone = toWhatsAppPhone(data.customerPhone);
      window.open(`https://wa.me/${phone ?? ""}?text=${encodeURIComponent(buildShareText(data))}`, "_blank", "noopener,noreferrer");
    }
    toast({
      title: outcome === "saved" ? "קובץ ה-PDF נשמר" : "קובץ ה-PDF ירד",
      description: "וואטסאפ נפתח עם טקסט מוכן — צרפו את הקובץ שנשמר ידנית להודעה.",
    });
  });

  const shareEmail = runShare("email", (outcome) => {
    if (data) {
      const subject = `הצעת מחיר ${data.quoteNumberLabel} - HDI Project`;
      const body = buildShareText(data);
      const to = data.customerEmail ?? "";
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    toast({
      title: outcome === "saved" ? "קובץ ה-PDF נשמר" : "קובץ ה-PDF ירד",
      description: "תוכנת המייל נפתחה עם טקסט מוכן — צרפו את הקובץ שנשמר ידנית.",
    });
  });

  return { docRef, busy, shareGeneric, shareWhatsApp, shareEmail };
}
