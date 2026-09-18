import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// One event pulled from the user's synced phone/Google Calendar (see
// SettingsPage's "סנכרון עם יומן Google" card) — one-way, read-only.
// Shared between JobsCalendar (the month grid's blue-dot markers) and the
// dashboard's "today" card, so both read the exact same shape.
export interface CalendarSyncEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

// The synced calendar's ICS feed URL, saved from Settings
// (app_settings.google_calendar_ics_url — same key/value table and read
// access as the other settings there, see SettingsPage.tsx). Pulled out
// as its own hook so every consumer shares one cached query instead of
// each re-fetching it.
export function useGoogleCalendarIcsUrl() {
  return useQuery({
    queryKey: ["app_settings", "google_calendar_ics_url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", "google_calendar_ics_url")
        .maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? data.value : "";
    },
    staleTime: 60_000,
  });
}

// Events from the synced calendar covering [startKey, endKey] — both
// "YYYY-MM-DD" date keys, inclusive on both ends. Calls the
// sync-google-calendar Edge Function, which fetches+parses the ICS feed
// server-side (the browser can't — Google's export endpoint sends no
// CORS headers) and expands recurring events for us. Disabled (returns
// no data, not an error) until a URL is saved.
export function useGoogleCalendarEvents(startKey: string, endKey: string) {
  const { data: icsUrl } = useGoogleCalendarIcsUrl();
  return useQuery({
    queryKey: ["google-calendar-events", icsUrl, startKey, endKey],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ events?: CalendarSyncEvent[]; error?: string }>(
        "sync-google-calendar",
        { body: { icsUrl, start: startKey, end: endKey } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.events ?? [];
    },
    enabled: Boolean(icsUrl),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
