import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// Fixed text shown at the bottom of every quote document, just above the
// signature section (e.g. standard terms/conditions) — edited once on
// SettingsPage and read here by every surface that renders a quote
// (useQuoteDocumentData for a saved quote, QuotesPage's live preview/
// share). Same app_settings key/value table as the VAT rate and the
// Google Calendar ICS URL (see useVatRate.ts) — this is just another
// single stored value. An empty/missing setting means "no footer text",
// same as a quote with no notes.
export const QUOTE_FOOTER_TEXT_SETTINGS_KEY = "quote_footer_text";

export function useQuoteFooterText() {
  const query = useQuery({
    queryKey: ["app_settings", QUOTE_FOOTER_TEXT_SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", QUOTE_FOOTER_TEXT_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? data.value : "";
    },
    staleTime: 5 * 60_000,
  });

  return { footerText: query.data ?? "", isLoading: query.isLoading };
}
