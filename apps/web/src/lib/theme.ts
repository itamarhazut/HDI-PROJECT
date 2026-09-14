import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

// A handful of ready-made brand-color presets, picked from the settings
// page's "ערכת צבעים" section. Each one only touches the CSS variables
// that carry the *brand* color (primary buttons, focus rings, the active
// nav-item highlight) — background/card/muted/destructive etc. stay as
// defined in index.css, so switching presets can't accidentally break
// contrast or make errors/success colors ambiguous.
export type ThemePresetId = "indigo" | "blue" | "emerald" | "amber" | "violet";

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  /** A plain hex swatch color for the picker button itself — doesn't need
   * to exactly match the HSL vars below, just needs to look right. */
  swatch: string;
  vars: {
    "--primary": string;
    "--primary-foreground": string;
    "--ring": string;
    "--sidebar-accent": string;
    "--sidebar-accent-foreground": string;
  };
}

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "indigo";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "indigo",
    label: "אינדיגו",
    swatch: "#4f46e5",
    vars: {
      "--primary": "243 72% 58%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "243 72% 58%",
      "--sidebar-accent": "243 70% 95%",
      "--sidebar-accent-foreground": "243 72% 45%",
    },
  },
  {
    id: "blue",
    label: "כחול",
    swatch: "#2563eb",
    vars: {
      "--primary": "217 91% 60%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "217 91% 60%",
      "--sidebar-accent": "217 91% 95%",
      "--sidebar-accent-foreground": "217 91% 40%",
    },
  },
  {
    id: "emerald",
    label: "ירוק",
    swatch: "#059669",
    vars: {
      "--primary": "160 84% 34%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "160 84% 34%",
      "--sidebar-accent": "160 60% 95%",
      "--sidebar-accent-foreground": "160 84% 28%",
    },
  },
  {
    id: "amber",
    label: "כתום",
    swatch: "#d97706",
    vars: {
      "--primary": "32 95% 44%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "32 95% 44%",
      "--sidebar-accent": "38 92% 95%",
      "--sidebar-accent-foreground": "32 95% 35%",
    },
  },
  {
    id: "violet",
    label: "סגול",
    swatch: "#7c3aed",
    vars: {
      "--primary": "262 83% 58%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "262 83% 58%",
      "--sidebar-accent": "262 83% 96%",
      "--sidebar-accent-foreground": "262 83% 42%",
    },
  },
];

function resolvePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS.find((p) => p.id === DEFAULT_THEME_PRESET_ID)!;
}

export function applyThemePreset(id: string | null | undefined): void {
  const preset = resolvePreset(id);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(preset.vars)) {
    root.style.setProperty(name, value);
  }
}

// Reads the saved theme_color setting (app_settings — same key/value table
// the VAT rate lives in) and applies it to the document as soon as it
// loads. Mounted once from AppShell (shared by the admin and customer-
// portal layouts alike), so the chosen brand color follows the business
// everywhere in the app, not just the admin side. Falls back to the
// original indigo whenever nothing's been chosen yet.
export function useAppliedTheme(): ThemePresetId {
  const { data } = useQuery({
    queryKey: ["app_settings", "theme_color"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("key", "theme_color").maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? (data.value as ThemePresetId) : DEFAULT_THEME_PRESET_ID;
    },
  });

  const presetId = data ?? DEFAULT_THEME_PRESET_ID;

  React.useEffect(() => {
    applyThemePreset(presetId);
  }, [presetId]);

  return presetId;
}
