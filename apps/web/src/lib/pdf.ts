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
// final image is ~2600px wide regardless of the element's actual on-screen
// width (which varies — it's rendered off-screen at its natural width, not
// forced to any particular size). 2600px across an A4-width page works out
// to roughly 310 DPI — noticeably crisper than the previous 2000px/240 DPI,
// which was fine on screen but visibly soft on a printed page. Clamped so a
// narrow element doesn't get blown up absurdly, and a huge one doesn't
// produce a multi-tens-of-MB file.
const TARGET_RASTER_WIDTH_PX = 2600;

export async function elementToPdfBlob(
  element: HTMLElement,
  options?: {
    /** Selector for "safe to cut the page here" elements — see the row-boundary comment below. Defaults to "tr". */
    pageBreakSelector?: string;
  },
): Promise<Blob> {
  const scale = Math.min(4, Math.max(2, TARGET_RASTER_WIDTH_PX / element.offsetWidth));

  // Every element that's safe to end a page on (by default, every table
  // row), measured in CSS pixels relative to `element`'s own top edge —
  // collected BEFORE rasterizing, since this needs real layout positions,
  // not pixels in an image. When a document needs a genuine second page,
  // the old code always cut at a fixed page-height increment, which could
  // land in the middle of a line-item row — visually, a row's text sliced
  // clean in half between page 1 and page 2. That's exactly what adding a
  // few extra line items to a quote used to trigger. Below, every page
  // break snaps to the nearest one of these boundaries at or before the
  // natural cutoff instead.
  const pageBreakSelector = options?.pageBreakSelector ?? "tr";
  const containerTop = element.getBoundingClientRect().top;
  const rowBreaksCssPx = Array.from(element.querySelectorAll<HTMLElement>(pageBreakSelector))
    .map((row) => row.getBoundingClientRect().bottom - containerTop)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  // pt (PDF page units) per canvas pixel — uniform in both axes, so the
  // same factor converts a canvas-px row boundary into a pt-space cutoff.
  const ptPerCanvasPx = imgWidth / canvas.width;
  let fullImgHeightPt = canvas.height * ptPerCanvasPx;

  // A short document (e.g. a one-line quote) can end up JUST over one A4
  // page — a few points of overflow from margins/rounding — which used to
  // spill a near-empty second page with only the signature line and footer
  // on it. If the overflow is small (under 6%), it's imperceptible to
  // squeeze the image to fit exactly one page instead of spawning another.
  // IMPORTANT: this must only fire when the content actually overflows
  // (fullImgHeightPt > pageHeight) — an earlier version applied it whenever
  // it was merely "at or under" the tolerance, which also matched ordinary
  // SHORT documents and force-stretched them to fill the entire page,
  // making everything look artificially tall and unnatural.
  const OVERFLOW_TOLERANCE = 1.06;
  const squeezeToOnePage = fullImgHeightPt > pageHeight && fullImgHeightPt <= pageHeight * OVERFLOW_TOLERANCE;
  if (squeezeToOnePage) {
    fullImgHeightPt = pageHeight;
  }

  // Row boundaries, converted from CSS px (measured on the live element,
  // pre-rasterize) to canvas px (the actual rasterized image's coordinate
  // space) — derived from the canvas's own dimensions rather than trusting
  // `scale` verbatim, in case html2canvas's real output differs slightly.
  const canvasPxPerCssPx = canvas.width / element.offsetWidth;
  const rowBreaksCanvasPx = rowBreaksCssPx.map((y) => y * canvasPxPerCssPx);

  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = canvas.width;
  const ctx = scratchCanvas.getContext("2d");
  if (!ctx) throw new Error("קנבס דו-ממדי אינו נתמך בדפדפן זה.");

  // Crops [startPx, endPx) out of the full rasterized canvas (in canvas
  // px) onto its own page, instead of placing the whole image shifted up
  // by an ever-growing offset (the old trick, which only works when every
  // page is exactly `pageHeight` tall). Cropping lets each page be exactly
  // as tall as its own slice — necessary once slices no longer all match
  // the same fixed height.
  const addSlice = (startPx: number, endPx: number, isFirstPage: boolean) => {
    const slicePx = Math.max(1, Math.round(endPx - startPx));
    scratchCanvas.height = slicePx;
    ctx.clearRect(0, 0, scratchCanvas.width, slicePx);
    ctx.drawImage(canvas, 0, startPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    const sliceHeightPt = slicePx * ptPerCanvasPx;
    if (!isFirstPage) pdf.addPage();
    pdf.addImage(scratchCanvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, sliceHeightPt);
  };

  if (fullImgHeightPt <= pageHeight) {
    // Fits on one page (including the squeeze-to-fit case above) — a
    // single slice of the whole thing, no row-boundary snapping needed.
    addSlice(0, canvas.height, true);
  } else {
    const pageHeightCanvasPx = pageHeight / ptPerCanvasPx;
    let cursorPx = 0;
    let firstPage = true;
    while (cursorPx < canvas.height - 0.5) {
      const naiveEndPx = cursorPx + pageHeightCanvasPx;
      let endPx: number;
      if (naiveEndPx >= canvas.height) {
        endPx = canvas.height;
      } else {
        // The last row boundary that's past the current cursor and still
        // within this page's budget — as long as one exists. A single row
        // taller than a full page (a huge notes block, say) has no such
        // boundary, so it falls back to the naive fixed-height cut rather
        // than looping forever on the same position.
        const candidates = rowBreaksCanvasPx.filter((y) => y > cursorPx + 1 && y <= naiveEndPx);
        // Safe: just checked candidates.length > 0, so the last index exists.
        endPx = candidates.length > 0 ? candidates[candidates.length - 1]! : naiveEndPx;
      }
      addSlice(cursorPx, endPx, firstPage);
      cursorPx = endPx;
      firstPage = false;
    }
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
