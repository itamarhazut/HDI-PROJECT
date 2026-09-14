import { useQuery } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { ADMIN_NAV_ORDER_SETTINGS_KEY, applyNavOrder } from "./adminNavItems";
import { supabase } from "../lib/supabase";

// The sidebar's item order can be customized from the settings page (the
// gear icon → "סדר פריטי התפריט הראשי"), saved as a plain array of `to`
// paths under this same key — applyNavOrder lays the fixed item list
// (ADMIN_NAV_ITEMS, in adminNavItems.ts) out in that order.
export function AdminLayout() {
  const { data: navOrder } = useQuery({
    queryKey: ["app_settings", ADMIN_NAV_ORDER_SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", ADMIN_NAV_ORDER_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.value) ? (data.value as string[]) : null;
    },
  });

  return <AppShell title="HDI Project" navItems={applyNavOrder(navOrder)} />;
}
