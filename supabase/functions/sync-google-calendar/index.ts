// Reads a public/"secret address" iCal (.ics) feed URL — the kind Google
// Calendar (also Apple/iCloud, Outlook) generates from calendar settings
// with no OAuth or developer account needed — and returns the events in a
// given date range as JSON. This exists purely to get around the browser:
// Google's ICS export endpoint doesn't send CORS headers, so the app's own
// frontend can't fetch it directly; this function fetches it server-to-
// server (no CORS involved) and hands back parsed events instead.
//
// One-way, read-only: this never writes back to the user's calendar, it
// only reads it. Request body: { icsUrl: string, start?: ISO string, end?:
// ISO string }. Response: { events: Array<{ id, title, start, end, allDay
// }> } or { error: string }.
//
// ical.js is pulled in at deploy time via Deno's npm: specifier — Edge
// Functions run on Supabase's own Deno runtime, separate from the
// apps/web pnpm workspace, so this needs no local `pnpm install`.
import ICAL from "npm:ical.js@2.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Per-event safety valve for recurring rules with no COUNT/UNTIL (e.g. "every
// day, forever") — 20,000 occurrences covers over 50 years of a daily
// recurrence, far beyond anything a real calendar entry needs, while still
// finishing in well under a second (measured against a worst-case 1970-
// origin daily event in testing).
const MAX_OCCURRENCES_PER_EVENT = 20000;
// Overall wall-clock budget across every recurring event in the feed, in
// case a feed contains several such pathological rules at once.
const MAX_TOTAL_MS = 8000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "יש לשלוח בקשת POST" }, 405);

  let body: { icsUrl?: unknown; start?: unknown; end?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "גוף הבקשה אינו JSON תקין" }, 400);
  }

  const icsUrl = body.icsUrl;
  if (typeof icsUrl !== "string" || icsUrl.length === 0) {
    return json({ error: "icsUrl חסר" }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(icsUrl);
  } catch {
    return json({ error: "כתובת היומן אינה תקינה" }, 400);
  }
  // https-only — also rules out file://, data:// and similar local-access
  // schemes some URL parsers still accept.
  if (parsedUrl.protocol !== "https:") {
    return json({ error: "רק כתובות https נתמכות" }, 400);
  }

  let icsText: string;
  try {
    const icsRes = await fetch(parsedUrl.toString(), {
      headers: { "User-Agent": "HDI-Calendar-Sync/1.0 (+one-way ICS reader)" },
    });
    if (!icsRes.ok) {
      return json({ error: `הבאת היומן נכשלה (קוד ${icsRes.status}) — ודא שהכתובת עדיין תקפה` }, 502);
    }
    icsText = await icsRes.text();
  } catch (err) {
    return json({ error: `לא ניתן להגיע לכתובת היומן: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}` }, 502);
  }

  const rangeStart = typeof body.start === "string" && body.start ? new Date(body.start) : new Date();
  let rangeEnd =
    typeof body.end === "string" && body.end ? new Date(body.end) : new Date(rangeStart.getTime() + 1000 * 60 * 60 * 24 * 62);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return json({ error: "טווח תאריכים לא תקין" }, 400);
  }
  // A bare "YYYY-MM-DD" end date (no time component) parses to UTC
  // midnight of that date — which would cut off every event later that
  // same day, including the common case of a caller asking for a single
  // day (start === end, e.g. the dashboard's "today" card) getting back
  // nothing at all. Callers send inclusive calendar-date keys (see
  // JobsCalendar's gridEndKey and useGoogleCalendarEvents), so extend a
  // bare end date to the end of that UTC day.
  if (typeof body.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.end)) {
    rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  try {
    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    const icalRangeStart = ICAL.Time.fromJSDate(rangeStart, true);
    const icalRangeEnd = ICAL.Time.fromJSDate(rangeEnd, true);

    const events: Array<{ id: string; title: string; start: string; end: string; allDay: boolean }> = [];
    const budgetStart = Date.now();

    for (const vevent of vevents) {
      if (Date.now() - budgetStart > MAX_TOTAL_MS) break;

      // deno-lint-ignore no-explicit-any
      const event = new (ICAL as any).Event(vevent);
      const summary: string = event.summary || "(ללא כותרת)";
      const allDay: boolean = event.startDate.isDate;

      if (event.isRecurring()) {
        const iterator = event.iterator();
        // deno-lint-ignore no-explicit-any
        let next: any;
        let guard = 0;
        while ((next = iterator.next()) && guard < MAX_OCCURRENCES_PER_EVENT) {
          guard++;
          if (next.compare(icalRangeEnd) > 0) break;
          if (next.compare(icalRangeStart) < 0) continue;
          const details = event.getOccurrenceDetails(next);
          events.push({
            id: `${event.uid}-${next.toString()}`,
            title: summary,
            start: details.startDate.toJSDate().toISOString(),
            end: details.endDate.toJSDate().toISOString(),
            allDay,
          });
        }
      } else {
        const evStart = event.startDate;
        const evEnd = event.endDate ?? event.startDate;
        if (evStart.compare(icalRangeEnd) > 0 || evEnd.compare(icalRangeStart) < 0) continue;
        events.push({
          id: event.uid || `${summary}-${evStart.toString()}`,
          title: summary,
          start: evStart.toJSDate().toISOString(),
          end: evEnd.toJSDate().toISOString(),
          allDay,
        });
      }
    }

    return json({ events }, 200);
  } catch (err) {
    return json({ error: `שגיאה בפענוח קובץ היומן: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}` }, 500);
  }
});
