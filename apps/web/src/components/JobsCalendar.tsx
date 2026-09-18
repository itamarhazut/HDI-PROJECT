import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HDate, Locale, gematriya, HebrewCalendar, flags as hebcalFlags, type Event as HebcalEvent } from "@hebcal/core";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { JOB_STATUS_LABELS, type JobStatus } from "@repo/shared";
import { StatusBadge } from "./StatusBadge";
import { supabase } from "../lib/supabase";
import { useGoogleCalendarIcsUrl, useGoogleCalendarEvents, type CalendarSyncEvent } from "../hooks/useGoogleCalendarSync";

interface CalendarJob {
  id: string;
  title: string;
  status: JobStatus;
  scheduled_date: string;
  customerName: string;
}

interface CalendarHoliday {
  name: string;
  groupKey: string;
}

type CalendarMode = "gregorian" | "hebrew";

// Sunday-first week, matching the Israeli convention — the array is in
// chronological order (Sunday..Saturday); rendered inside the app's RTL
// layout this lines up right-to-left with Sunday on the right, exactly
// like a physical Hebrew wall calendar.
const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKeyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Hebrew-calendar day number/month name AND holiday data for a Gregorian
// date, via @hebcal/core — the same calendar-calculation engine behind
// hebcal.com, not a hand-rolled approximation.
const gregorianMonthYearFormatter = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });
const gregorianShortMonthFormatter = new Intl.DateTimeFormat("he-IL", { month: "short" });
const dayLongFormatter = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" });

// Hebrew-year month numbers run Tishrei(7)..Elul(6) *chronologically*
// within one numbered Hebrew year — Nisan(1) through Elul(6) come right
// after Adar/Adar II, still under the same year number, and the year only
// increments again at the next Tishrei. Leap years insert Adar I(12) +
// Adar II(13) between Sh'vat(11) and Nisan(1). This walks that order so
// "next/previous Hebrew month" always lands on the chronologically
// adjacent month, leap years included — verified against
// HDate(...).greg() across a full leap year in a sandbox check.
function chronologicalHebrewMonthOrder(year: number): number[] {
  const order = [7, 8, 9, 10, 11, 12];
  if (HDate.monthsInYear(year) === 13) order.push(13);
  order.push(1, 2, 3, 4, 5, 6);
  return order;
}

function nextHebrewMonth(month: number, year: number): { month: number; year: number } {
  const order = chronologicalHebrewMonthOrder(year);
  const idx = order.indexOf(month);
  if (idx === order.length - 1) return { month: 7, year: year + 1 };
  // Safe: idx+1 is within bounds whenever idx isn't the last index, just checked above.
  return { month: order[idx + 1] ?? 7, year };
}

function prevHebrewMonth(month: number, year: number): { month: number; year: number } {
  const order = chronologicalHebrewMonthOrder(year);
  const idx = order.indexOf(month);
  if (idx === 0) return { month: 6, year: year - 1 };
  // Safe: idx-1 is within bounds whenever idx isn't 0, just checked above.
  return { month: order[idx - 1] ?? 6, year };
}

function hebrewMonthYearLabel(month: number, year: number): string {
  const hd = new HDate(1, month, year);
  const monthHe = Locale.hebrewStripNikkud(Locale.gettext(hd.getMonthName(), "he"));
  const yearHe = Locale.hebrewStripNikkud(gematriya(year));
  return `${monthHe} ${yearHe}`;
}

// A tiny handful of "holiday" entries hebcal also generates aren't really
// what most people mean by "חגים עבריים" (Hebrew holidays) — a custom
// pre-Rosh-Hashana midnight-selichot marker, an obscure animal-tithe new
// year, a local Tunisian-Jewish custom day. Filtered out by name so they
// don't clutter the calendar.
const EXCLUDED_HOLIDAY_NAMES = new Set(["סליחות", "ראש השנה למעשר בהמה", "חג הבנות"]);

// hebcal also returns a long tail of Israeli *civic* commemoration days
// (Hebrew Language Day, Family Day, Herzl Day, Jabotinsky Day, Ben-Gurion
// Day, the Rabin memorial, the pre-Aliyah-Day school observance) — real
// dates on the Israeli calendar, but not Jewish/religious holidays and not
// days that affect a business's schedule. hebcal flags these with both
// IL_ONLY and MODERN_HOLIDAY and nothing else (unlike the four
// nationally-significant days — Yom HaShoah/HaZikaron/HaAtzmaut/
// Yerushalayim — which carry MODERN_HOLIDAY alone), so that exact
// combination is what gets filtered out here.
// hebcal's own Hebrew rendering appends the Hebrew year to exactly one
// holiday name — the first day of Rosh Hashana specifically, since it's
// the day the Hebrew year actually changes (e.g. "ראש השנה 5787") — every
// other holiday, including day two of Rosh Hashana itself, renders
// without a year. Left in, that shows up as plain Arabic digits sitting
// inside an otherwise all-Hebrew-letters label, which reads as a typo
// rather than a year; stripped here so every holiday name displays the
// same way (the Hebrew year is already shown separately, in Hebrew
// letters, next to the month title).
function formatHolidayName(ev: HebcalEvent): string {
  return Locale.hebrewStripNikkud(ev.render("he")).replace(/\s+\d{3,4}$/, "");
}

function isRelevantHoliday(ev: HebcalEvent): boolean {
  const nameHe = Locale.hebrewStripNikkud(ev.render("he"));
  if (EXCLUDED_HOLIDAY_NAMES.has(nameHe)) return false;
  const f = ev.getFlags();
  const isMinorCivicDay =
    (f & hebcalFlags.IL_ONLY) !== 0 &&
    (f & hebcalFlags.MODERN_HOLIDAY) !== 0 &&
    (f &
      (hebcalFlags.CHAG |
        hebcalFlags.MAJOR_FAST |
        hebcalFlags.MINOR_FAST |
        hebcalFlags.CHOL_HAMOED |
        hebcalFlags.MINOR_HOLIDAY)) ===
      0;
  return !isMinorCivicDay;
}

// One dashboard-widget-sized month calendar with two modes, toggled by
// the "לועזי / עברי" buttons in the header. In Gregorian mode (the
// default) the grid follows the Gregorian month and each day's big bold
// number is the Gregorian date, with the Hebrew date shown small below
// it. In Hebrew mode the grid instead follows one full Hebrew month
// (Hebrew day numbers big and bold, Gregorian date shown small below),
// and the ‹ / היום / › controls step by Hebrew month instead of
// Gregorian month. Either way, the title shows both calendars — the
// active one bold, the other small next to it — and when a Gregorian
// month spans a Hebrew month boundary (or vice versa), only the one that
// covers the *majority* of the visible month's days is named, rather
// than listing both.
// Jobs scheduled on a given day show as a small count badge. Hebrew
// holidays are highlighted directly on their day cells — the holiday's
// name replaces the small secondary line on that cell, on a rose
// background; clicking a day lists the jobs (and the holiday, if any)
// that fall on it below the grid.
// If a Google Calendar sync URL is saved in Settings, that calendar's
// events for the visible range are overlaid too (one-way, read-only —
// see SettingsPage's "סנכרון עם יומן Google" card and the
// sync-google-calendar Edge Function): a small blue dot marks a day with
// synced events, and clicking the day lists them below the grid.
export function JobsCalendar() {
  const today = React.useMemo(() => new Date(), []);
  const todayHDate = React.useMemo(() => new HDate(today), [today]);

  const [mode, setMode] = React.useState<CalendarMode>("gregorian");
  const [viewMonth, setViewMonth] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewHebrewMonth, setViewHebrewMonth] = React.useState(() => ({
    month: todayHDate.getMonth(),
    year: todayHDate.getFullYear(),
  }));
  const [selectedDateKey, setSelectedDateKey] = React.useState(() => toDateKey(today));

  // The actual (unpadded) days of the Gregorian month currently set in
  // `viewMonth`, and of the Hebrew month currently set in
  // `viewHebrewMonth` — used only to work out, independently of which
  // mode is on screen right now, which single month of the *other*
  // calendar covers most of those days. Kept separate from the display
  // grid below (which follows whichever mode is active) so switching
  // modes always has an accurate "closest" month to land on.
  const gregorianMonthDays = React.useMemo(() => {
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1));
  }, [viewMonth]);

  const hebrewMonthDays = React.useMemo(() => {
    const daysInMonth = HDate.daysInMonth(viewHebrewMonth.month, viewHebrewMonth.year);
    return Array.from({ length: daysInMonth }, (_, i) => new HDate(i + 1, viewHebrewMonth.month, viewHebrewMonth.year));
  }, [viewHebrewMonth]);

  const majorityHebrewOfGregorianView = React.useMemo(() => {
    const counts = new Map<string, { count: number; month: number; year: number }>();
    gregorianMonthDays.forEach((d) => {
      const hd = new HDate(d);
      const key = `${hd.getMonth()}-${hd.getFullYear()}`;
      const entry = counts.get(key) ?? { count: 0, month: hd.getMonth(), year: hd.getFullYear() };
      entry.count += 1;
      counts.set(key, entry);
    });
    let best: { count: number; month: number; year: number } | null = null;
    counts.forEach((v) => {
      if (!best || v.count > best.count) best = v;
    });
    return best ?? { count: 0, month: todayHDate.getMonth(), year: todayHDate.getFullYear() };
  }, [gregorianMonthDays, todayHDate]);

  const majorityGregorianOfHebrewView = React.useMemo(() => {
    const counts = new Map<string, { count: number; date: Date }>();
    hebrewMonthDays.forEach((hd) => {
      const d = hd.greg();
      const key = `${d.getMonth()}-${d.getFullYear()}`;
      const entry = counts.get(key) ?? { count: 0, date: d };
      entry.count += 1;
      counts.set(key, entry);
    });
    let best: { count: number; date: Date } | null = null;
    counts.forEach((v) => {
      if (!best || v.count > best.count) best = v;
    });
    return best ?? { count: 0, date: today };
  }, [hebrewMonthDays, today]);

  function handleSetMode(next: CalendarMode) {
    if (next === mode) return;
    if (next === "hebrew") {
      setViewHebrewMonth({ month: majorityHebrewOfGregorianView.month, year: majorityHebrewOfGregorianView.year });
    } else {
      const d = majorityGregorianOfHebrewView.date;
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setMode(next);
  }

  const primaryMonthLabel =
    mode === "gregorian" ? gregorianMonthYearFormatter.format(viewMonth) : hebrewMonthYearLabel(viewHebrewMonth.month, viewHebrewMonth.year);
  const secondaryMonthLabel =
    mode === "gregorian"
      ? hebrewMonthYearLabel(majorityHebrewOfGregorianView.month, majorityHebrewOfGregorianView.year)
      : gregorianMonthYearFormatter.format(majorityGregorianOfHebrewView.date);

  // The grid always covers full weeks and always follows whichever
  // calendar is active — the Gregorian month's 1st, or the Hebrew
  // month's 1st converted to its Gregorian equivalent — so it can spill
  // a few days into the previous/next month either way. The job query
  // range is padded to match, otherwise a job on a spillover day
  // wouldn't show its marker. 42 cells (6 full weeks) always fits a
  // Hebrew month too: the longest is 30 days, and the largest possible
  // leading pad (to the previous Sunday) is 6 days, well under 42.
  const monthStartDate = React.useMemo(
    () => (mode === "gregorian" ? viewMonth : new HDate(1, viewHebrewMonth.month, viewHebrewMonth.year).greg()),
    [mode, viewMonth, viewHebrewMonth]
  );
  const gridDays = React.useMemo(() => {
    const start = new Date(monthStartDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monthStartDate]);
  // Safe: gridDays always has exactly 42 entries (built via Array.from({length: 42}) above).
  const gridStartKey = toDateKey(gridDays[0]!);
  const gridEndKey = toDateKey(gridDays[gridDays.length - 1]!);

  const hdByDay = React.useMemo(() => gridDays.map((d) => new HDate(d)), [gridDays]);

  // Precomputed per-day Hebrew-date info, so the "show month name only
  // when it changes" logic just compares this array to itself instead of
  // reformatting on every render. Used as the small secondary line in
  // Gregorian mode, and as the big bold primary number in Hebrew mode.
  const hebrewByDay = React.useMemo(() => {
    let prevMonth: string | null = null;
    return hdByDay.map((hd) => {
      const monthKey = hd.getMonthName();
      const showMonth = monthKey !== prevMonth;
      prevMonth = monthKey;
      const monthHe = Locale.hebrewStripNikkud(Locale.gettext(monthKey, "he"));
      return { day: gematriya(hd.getDate()), month: monthHe, showMonth };
    });
  }, [hdByDay]);

  // Mirror of hebrewByDay for the Gregorian date — used as the small
  // secondary line in Hebrew mode.
  const gregorianByDay = React.useMemo(() => {
    let prevMonth: number | null = null;
    return gridDays.map((d) => {
      const monthIdx = d.getMonth();
      const showMonth = monthIdx !== prevMonth;
      prevMonth = monthIdx;
      return { day: String(d.getDate()), month: gregorianShortMonthFormatter.format(d), showMonth };
    });
  }, [gridDays]);

  // Hebrew holidays covering the visible grid — a pure local calculation
  // (same @hebcal/core engine as the date math above), no network
  // involved, so it's computed directly rather than through React Query.
  // `il: true` uses the Israeli observance calendar (one-day Yom Tov
  // Sheni etc.), matching an Israeli business's actual working calendar.
  const holidayEvents = React.useMemo(() => {
    const events = HebrewCalendar.calendar({
      start: gridDays[0],
      end: gridDays[gridDays.length - 1],
      il: true,
      noRoshChodesh: true,
      noSpecialShabbat: true,
    });
    return events.filter(isRelevantHoliday);
  }, [gridDays]);

  const holidaysByDate = React.useMemo(() => {
    const map = new Map<string, CalendarHoliday[]>();
    holidayEvents.forEach((ev) => {
      const key = toDateKey(ev.getDate().greg());
      const list = map.get(key) ?? [];
      list.push({ name: formatHolidayName(ev), groupKey: ev.basename() });
      map.set(key, list);
    });
    return map;
  }, [holidayEvents]);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["dashboard-calendar-jobs", gridStartKey, gridEndKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, status, scheduled_date, customers(name)")
        .gte("scheduled_date", gridStartKey)
        .lte("scheduled_date", gridEndKey);
      if (error) throw error;
      // Embedded `customers(name)` selects come back untyped (see the
      // Relationships: [] note in packages/shared/types/database.ts) —
      // mirrors the same narrowing DashboardPage's own upcomingJobs query
      // already does.
      return ((data ?? []) as unknown as Array<{
        id: string;
        title: string;
        status: JobStatus;
        scheduled_date: string;
        customers: { name: string } | null;
      }>).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        scheduled_date: j.scheduled_date,
        customerName: j.customers?.name ?? "—",
      }));
    },
  });

  const jobsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    (jobs ?? []).forEach((j) => {
      const list = map.get(j.scheduled_date) ?? [];
      list.push(j);
      map.set(j.scheduled_date, list);
    });
    return map;
  }, [jobs]);

  // The synced phone/Google Calendar's ICS feed URL, and the events for
  // the same visible grid range as the jobs query above — shared hook
  // (see useGoogleCalendarSync.ts) so the dashboard's "today" card reads
  // from the exact same cache/logic instead of duplicating it. Only when
  // a URL is saved does this actually call the sync-google-calendar Edge
  // Function.
  const { data: googleIcsUrl } = useGoogleCalendarIcsUrl();
  const { data: syncEvents } = useGoogleCalendarEvents(gridStartKey, gridEndKey);

  const syncEventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarSyncEvent[]>();
    (syncEvents ?? []).forEach((ev) => {
      // Both plain-datetime and all-day events come back as ISO instants;
      // converting to a local Date and keying by local day matches how
      // every other date in this component (jobs, holidays) is keyed.
      const key = toDateKey(new Date(ev.start));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    });
    return map;
  }, [syncEvents]);

  const syncEventTimeFormatter = React.useMemo(() => new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }), []);

  const selectedJobs = jobsByDate.get(selectedDateKey) ?? [];
  const selectedHolidays = holidaysByDate.get(selectedDateKey) ?? [];
  const selectedSyncEvents = syncEventsByDate.get(selectedDateKey) ?? [];

  const goPrev = () => {
    if (mode === "gregorian") setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    else setViewHebrewMonth((cur) => prevHebrewMonth(cur.month, cur.year));
  };
  const goNext = () => {
    if (mode === "gregorian") setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    else setViewHebrewMonth((cur) => nextHebrewMonth(cur.month, cur.year));
  };
  const goToday = () => {
    if (mode === "gregorian") setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    else setViewHebrewMonth({ month: todayHDate.getMonth(), year: todayHDate.getFullYear() });
    setSelectedDateKey(toDateKey(today));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">יומן עבודות (עברי/לועזי)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant={mode === "gregorian" ? "default" : "outline"} size="sm" onClick={() => handleSetMode("gregorian")}>
              לועזי
            </Button>
            <Button type="button" variant={mode === "hebrew" ? "default" : "outline"} size="sm" onClick={() => handleSetMode("hebrew")}>
              עברי
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" aria-label="הקודם" onClick={goPrev}>
              ‹
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={goToday}>
              היום
            </Button>
            <Button type="button" variant="outline" size="sm" aria-label="הבא" onClick={goNext}>
              ›
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            {primaryMonthLabel}
            {secondaryMonthLabel && <span className="font-normal text-muted-foreground"> · {secondaryMonthLabel}</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {mode === "gregorian"
              ? "המספר הגדול בכל יום הוא התאריך הלועזי, ומתחתיו התאריך העברי (באותיות)"
              : "המספר הגדול בכל יום הוא התאריך העברי (באותיות), ומתחתיו התאריך הלועזי"}
            {" — ובימי חג מוצג שם החג במקום השורה הקטנה, על רקע ורוד."}
            {googleIcsUrl ? " נקודה כחולה מסמנת יום עם אירוע מהיומן המסונכרן." : ""}
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((d, i) => {
            const key = toDateKey(d);
            // Safe: hdByDay/hebrewByDay/gregorianByDay are all mapped 1:1 from
            // gridDays, so index i is always in range for all three.
            const hd = hdByDay[i]!;
            const inMonth =
              mode === "gregorian"
                ? d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear()
                : hd.getMonth() === viewHebrewMonth.month && hd.getFullYear() === viewHebrewMonth.year;
            const isToday = sameDay(d, today);
            const isSelected = key === selectedDateKey;
            const dayJobs = jobsByDate.get(key) ?? [];
            const dayHolidays = holidaysByDate.get(key) ?? [];
            const daySyncEvents = syncEventsByDate.get(key) ?? [];
            const isHoliday = dayHolidays.length > 0;
            const hebrew = hebrewByDay[i]!;
            const greg = gregorianByDay[i]!;

            const primaryText = mode === "gregorian" ? String(d.getDate()) : hebrew.day;
            const secondaryDefaultText =
              mode === "gregorian" ? (hebrew.showMonth ? hebrew.month : hebrew.day) : greg.showMonth ? greg.month : greg.day;
            const secondaryText = isHoliday ? dayHolidays.map((h) => h.name).join(" / ") : secondaryDefaultText;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDateKey(key)}
                title={isHoliday ? dayHolidays.map((h) => h.name).join(", ") : undefined}
                className={[
                  "flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-xs transition-colors",
                  inMonth ? "" : "opacity-35",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : isToday
                      ? "border-primary/40 hover:bg-accent"
                      : isHoliday
                        ? "border-rose-200 bg-rose-50/70 hover:bg-rose-100/70"
                        : "border-transparent hover:bg-accent",
                ].join(" ")}
              >
                <span className={isToday ? "font-bold text-primary" : "font-medium"}>{primaryText}</span>
                <span
                  className={[
                    "block w-full truncate px-0.5 text-center text-[10px] leading-tight",
                    isHoliday ? "font-semibold text-rose-700" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {secondaryText}
                </span>
                {(dayJobs.length > 0 || daySyncEvents.length > 0) && (
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {dayJobs.length > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                        {dayJobs.length}
                      </span>
                    )}
                    {daySyncEvents.length > 0 && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-sky-500"
                        title={`${daySyncEvents.length} אירועים מהיומן המסונכרן`}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              עבודות ב-{dayLongFormatter.format(dateKeyToDate(selectedDateKey))}
            </p>
            {selectedHolidays.map((h) => (
              <span
                key={h.name}
                className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
              >
                {h.name}
              </span>
            ))}
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">טוען...</p>
          ) : selectedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עבודות מתוזמנות ביום זה.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-sm">
                  <span>
                    {job.title} <span className="text-muted-foreground">— {job.customerName}</span>
                  </span>
                  <StatusBadge status={job.status} label={JOB_STATUS_LABELS[job.status] ?? job.status} />
                </div>
              ))}
            </div>
          )}
          {selectedSyncEvents.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-2">
              <p className="text-xs font-medium text-muted-foreground">אירועים מהיומן המסונכרן</p>
              {selectedSyncEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                  <span>{ev.title}</span>
                  {!ev.allDay && (
                    <span className="text-xs text-muted-foreground">{syncEventTimeFormatter.format(new Date(ev.start))}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <Link to="/admin/jobs" className="text-xs text-primary underline">
            לכל העבודות ←
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
