// The "/browser" subpath is required: the package's exports map has no bare
// entry point, so `from "write-excel-file"` fails to resolve at build time.
import writeXlsxFile from "write-excel-file/browser";

// Exporting a table as a real Excel file.
//
// This replaced a CSV export for one concrete reason: CSV carries no column
// widths, so Excel opened the expense report with the date column at its
// default width and showed every date as "#####". The data was fine — that
// is just Excel's way of saying "too narrow" — but it meant widening the
// column by hand on every single export, on a report produced every VAT
// period.
//
// A real .xlsx also lets the file arrive at the accountant the way it
// should: dates as dates (sortable and filterable, not text), amounts as
// numbers with two decimals, a bold header row that stays put when
// scrolling.

export type XlsxCellValue = string | number | Date | null | undefined;

export interface XlsxColumn {
  header: string;
  /** Width in characters, roughly. Chosen per column so nothing shows "#####". */
  width: number;
  /** Controls the cell type, which is what makes sorting and totals work. */
  type?: "text" | "number" | "date" | "currency";
}

const HEADER_STYLE = {
  fontWeight: "bold" as const,
  backgroundColor: "#EFF2F6",
  align: "right" as const,
};

// Two decimals with a thousands separator. Deliberately not a ₪ currency
// format: the accountant's own template usually applies its own, and a
// bare number is the easier thing for them to re-format.
const NUMBER_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd/mm/yyyy";

function cellFor(value: XlsxCellValue, type: XlsxColumn["type"]) {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }
  switch (type) {
    case "date": {
      const date = value instanceof Date ? value : parseLocalDate(String(value));
      return date ? { type: Date, value: date, format: DATE_FORMAT } : { value: String(value) };
    }
    case "number":
    case "currency": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? { type: Number, value: n, format: NUMBER_FORMAT } : { value: String(value) };
    }
    default:
      return { type: String, value: String(value) };
  }
}

// "YYYY-MM-DD" built in local time. new Date("2026-09-01") is parsed as UTC
// midnight, which in Israel is the evening before — enough to move an
// expense into the wrong reporting period in the exported file.
function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function downloadXlsx(
  fileName: string,
  columns: XlsxColumn[],
  rows: XlsxCellValue[][]
): Promise<void> {
  const sheet = [
    columns.map((c) => ({ ...HEADER_STYLE, value: c.header, type: String })),
    ...rows.map((row) => row.map((value, i) => cellFor(value, columns[i]?.type))),
  ];

  // The browser build hands back an object to turn into a Blob rather than
  // a Blob itself.
  const result = await writeXlsxFile(sheet as never, {
    columns: columns.map((c) => ({ width: c.width })),
    // Keeps the header visible while scrolling a long period's expenses.
    stickyRowsCount: 1,
  });

  const blob = typeof (result as { toBlob?: () => Promise<Blob> })?.toBlob === "function"
    ? await (result as { toBlob: () => Promise<Blob> }).toBlob()
    : (result as unknown as Blob);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Freed on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
