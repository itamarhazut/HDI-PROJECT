import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Renders a DOM element to a PDF Blob by rasterizing it as an image first
// (via html2canvas), rather than asking a PDF library to lay out and embed
// real text. This sidesteps a real problem: PDF text-embedding libraries
// (jsPDF included) don't natively support Hebrew shaping/bidi/RTL — text
// often comes out reversed, disconnected, or in the wrong font. The browser
// already renders our Hebrew document correctly on screen, so this just
// takes a "screenshot" of it and places that image into the PDF page.
// Trade-off: the resulting PDF's text isn't selectable/searchable — worth
// it for a customer-facing document where visual correctness matters most.
// How many source pixels to rasterize per on-screen CSS pixel. Picked so the
// final image is ~2000px wide regardless of the element's actual on-screen
// width (which varies — it's rendered off-screen at its natural width, not
// forced to any particular size). 2000px across an A4-width page works out
// to roughly 240 DPI, sharp enough that the document doesn't look fuzzy when
// viewed at full size or printed. Clamped so a narrow element doesn't get
// blown up absurdly, and a huge one doesn't produce a multi-tens-of-MB file.
const TARGET_RASTER_WIDTH_PX = 2000;

export async function elementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const scale = Math.min(4, Math.max(2, TARGET_RASTER_WIDTH_PX / element.offsetWidth));
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;

  // A short document (e.g. a one-line quote) can end up JUST over one A4
  // page — a few points of overflow from margins/rounding — which used to
  // spill a near-empty second page with only the signature line and footer
  // on it. If the overflow is small (under 6%), it's imperceptible to
  // squeeze the image to fit exactly one page instead of spawning another.
  // IMPORTANT: this must only fire when the content actually overflows
  // (imgHeight > pageHeight) — an earlier version applied it whenever
  // imgHeight was merely "at or under" the tolerance, which also matched
  // ordinary SHORT documents and force-stretched them to fill the entire
  // page, making everything look artificially tall and unnatural.
  const OVERFLOW_TOLERANCE = 1.06;
  if (imgHeight > pageHeight && imgHeight <= pageHeight * OVERFLOW_TOLERANCE) {
    imgHeight = pageHeight;
  }

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}

// True only when the browser can actually hand these specific files to the
// native OS share sheet — not just that `navigator.share` exists, since
// some browsers implement a text-only version of the Web Share API (no
// `canShare`, or `canShare` without file support). In practice this is
// "yes" on mobile Chrome/Safari and "no" on desktop browsers today.
export function canShareFiles(files: File[]): boolean {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  return typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files });
}

// Downloads a Blob to the user's device via a throwaway <a download> link —
// the classic fallback, but a real limitation: Chromium has a known bug
// where a non-ASCII (Hebrew included) `download` attribute value can come
// out mangled/mojibake'd in the actual saved file name — confirmed both in
// testing here and in a real share the person did. There is no reliable
// client-side fix for that specific bug, which is why `saveOrDownloadBlob`
// below tries the modern File System Access API first, where a Unicode
// `suggestedName` is a first-class, spec'd feature rather than a attribute
// string the browser has to guess how to decode.
function downloadBlobClassic(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FileSystemWritableStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableStream>;
}
type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
};

const SAVE_PICKER_TIMEOUT_MS = 90_000;

// Opens the native "Save As" dialog and returns a handle to write to later,
// or null if that's not possible here (API missing, or it failed for a
// reason other than the person cancelling).
//
// CRITICAL ORDERING NOTE: this must be called BEFORE any slow async work
// (like rendering the document to a PDF), not after. showSaveFilePicker
// only works during "user activation" — a short window right after a real
// click. The previous version called this AFTER building the PDF (a
// multi-hundred-millisecond-to-several-second html2canvas render at high
// resolution), which in practice was long enough for that activation
// window to close in real browsers; the call then silently failed and fell
// back to the classic `<a download>` trick every single time — which is
// the exact method with the known Hebrew-filename-mangling bug. So the
// caller now opens the picker FIRST (spending the fresh click) and only
// builds the PDF afterward, once a save location is already secured.
//
// Throws (propagates) an AbortError if the person cancels the dialog — the
// caller should treat that as "nothing to do" and skip building the PDF
// entirely, rather than doing that work for nothing.
export async function trySaveFilePicker(fileName: string): Promise<FileSystemFileHandleLike | null> {
  const w = window as WindowWithSaveFilePicker;
  if (typeof w.showSaveFilePicker !== "function") return null;
  try {
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), SAVE_PICKER_TIMEOUT_MS));
    const picked = await Promise.race([
      w.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      }),
      timeout,
    ]);
    return picked === "timeout" ? null : picked;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Any other failure (e.g. permission policy blocks it in this
    // context, or the activation window already closed) — the caller
    // falls back to the classic download.
    return null;
  }
}

export async function writeToHandle(handle: FileSystemFileHandleLike, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Saves a Blob to disk with a correctly-Unicode-named file wherever
// possible: writes to `handle` if one was already secured via
// trySaveFilePicker, otherwise falls back to the classic `<a download>`
// trick (which can mangle non-ASCII file names, but is the only option
// left when the File System Access API isn't available at all).
export async function saveOrDownloadBlob(
  blob: Blob,
  fileName: string,
  handle: FileSystemFileHandleLike | null,
): Promise<"saved" | "downloaded"> {
  if (handle) {
    await writeToHandle(handle, blob);
    return "saved";
  }
  downloadBlobClassic(blob, fileName);
  return "downloaded";
}
