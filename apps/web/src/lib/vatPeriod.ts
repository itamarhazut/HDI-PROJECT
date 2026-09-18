// Reporting periods for VAT.
//
// VAT in Israel is reported either monthly or every two months, and the
// bi-monthly periods are fixed to the calendar: Jan-Feb, Mar-Apr, May-Jun,
// Jul-Aug, Sep-Oct, Nov-Dec. The expense screen defaults to whichever
// period today falls in, so "what do I hand in this time" is the view you
// land on rather than something to assemble by hand.

export type VatPeriodPresetId =
  | "this_month"
  | "last_month"
  | "this_bimonthly"
  | "last_bimonthly"
  | "this_year"
  | "custom";

export interface DateRange {
  /** Inclusive "YYYY-MM-DD". */
  from: string;
  /** Inclusive "YYYY-MM-DD". */
  to: string;
  label: string;
}

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

// Local-time formatting, deliberately not toISOString(): that converts to
// UTC first, which in Israel can shift a date to the previous day and drop
// the first expense of a period out of its own report.
const key = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const lastDayOfMonth = (year: number, monthIndex: number): number => new Date(year, monthIndex + 1, 0).getDate();

const monthRange = (year: number, monthIndex: number): DateRange => ({
  from: key(year, monthIndex, 1),
  to: key(year, monthIndex, lastDayOfMonth(year, monthIndex)),
  label: `${HEBREW_MONTHS[monthIndex]} ${year}`,
});

// Bi-monthly periods start on the even month index (0 = Jan, 2 = Mar, ...).
const bimonthlyRange = (year: number, startMonthIndex: number): DateRange => {
  const endMonthIndex = startMonthIndex + 1;
  return {
    from: key(year, startMonthIndex, 1),
    to: key(year, endMonthIndex, lastDayOfMonth(year, endMonthIndex)),
    label: `${HEBREW_MONTHS[startMonthIndex]}–${HEBREW_MONTHS[endMonthIndex]} ${year}`,
  };
};

export function vatPeriodRange(preset: VatPeriodPresetId, today = new Date()): DateRange | null {
  const y = today.getFullYear();
  const m = today.getMonth();

  switch (preset) {
    case "this_month":
      return monthRange(y, m);
    case "last_month":
      return m === 0 ? monthRange(y - 1, 11) : monthRange(y, m - 1);
    case "this_bimonthly":
      return bimonthlyRange(y, m - (m % 2));
    case "last_bimonthly": {
      const start = m - (m % 2) - 2;
      return start < 0 ? bimonthlyRange(y - 1, 10) : bimonthlyRange(y, start);
    }
    case "this_year":
      return { from: key(y, 0, 1), to: key(y, 11, 31), label: `שנת ${y}` };
    case "custom":
      return null;
  }
}

export const VAT_PERIOD_PRESET_LABELS: Record<VatPeriodPresetId, string> = {
  this_bimonthly: "תקופה דו-חודשית נוכחית",
  last_bimonthly: "תקופה דו-חודשית קודמת",
  this_month: "החודש",
  last_month: "החודש שעבר",
  this_year: "השנה",
  custom: "טווח מותאם",
};
