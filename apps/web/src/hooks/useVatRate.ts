import { useQuery } from "@tanstack/react-query";
import { DEFAULT_VAT_RATE } from "@repo/shared";
import { supabase } from "../lib/supabase";

// The one place the VAT rate is read from.
//
// Before this hook existed the rate came from two different sources: the
// save path read app_settings.vat_rate, while the quote form's on-screen
// totals, its preview and the shared PDF used the DEFAULT_VAT_RATE constant
// directly. When the two disagreed — and they did, the database was seeded
// at 0.17 while the constant said 0.18 — the customer was shown one total
// and a different one was stored. Everything now reads this hook, so that
// can't drift again.
//
// DEFAULT_VAT_RATE stays as the fallback for a database with no row yet
// (and as the value new projects get seeded with), never as a second
// opinion about an existing one.
export const VAT_RATE_SETTINGS_KEY = "vat_rate";

// app_settings.value is jsonb, so the rate can legitimately come back as a
// JSON number (0.18) or as a JSON string ("0.18") depending on how the row
// was written — the settings screen writes a number, but the original seed
// and any hand-edit in the Supabase dashboard could produce either. Accept
// both, and refuse anything that isn't a sane rate rather than silently
// computing VAT from garbage.
export function parseVatRate(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0 || n >= 1) return null;
  return n;
}

export function useVatRate() {
  const query = useQuery({
    queryKey: ["app_settings", VAT_RATE_SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", VAT_RATE_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseVatRate(data?.value);
    },
    staleTime: 5 * 60_000,
  });

  // Callers get a usable number immediately (before the query resolves, and
  // if the setting is missing or malformed) instead of having to handle
  // undefined everywhere money is calculated.
  return { vatRate: query.data ?? DEFAULT_VAT_RATE, isLoading: query.isLoading };
}

// How much of the input VAT on a vehicle or fuel expense may be claimed
// back, as a fraction.
//
// This is a setting rather than a constant because the answer depends on
// the vehicle, not on the software: input VAT on a private passenger car
// isn't deductible at all, while a commercial vehicle's generally is. The
// business owner sets it once with their accountant and every fuel/vehicle
// expense then defaults to it.
export const VEHICLE_VAT_RATE_SETTINGS_KEY = "vehicle_vat_deductible_rate";

export function useVehicleVatDeductibleRate() {
  const query = useQuery({
    queryKey: ["app_settings", VEHICLE_VAT_RATE_SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", VEHICLE_VAT_RATE_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value;
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
    },
    staleTime: 5 * 60_000,
  });

  return { vehicleVatRate: query.data ?? 1 };
}
