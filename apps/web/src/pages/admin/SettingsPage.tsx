import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { strings } from "@repo/shared";
import { Card, CardContent, cn, useToast } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { IconChevronDown, IconSettings } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { THEME_PRESETS, DEFAULT_THEME_PRESET_ID, type ThemePresetId } from "../../lib/theme";
import { ADMIN_NAV_ORDER_SETTINGS_KEY, applyNavOrder } from "../../layouts/adminNavItems";

// General, system-wide settings — reachable from the small gear icon next
// to the user's name at the bottom of the sidebar (not a regular nav item,
// since it's opened rarely): brand color, the main sidebar's item order,
// and the resource-library category order. More settings can be added as
// their own Card here later.
export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: themeColor } = useQuery({
    queryKey: ["app_settings", "theme_color"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("key", "theme_color").maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? (data.value as ThemePresetId) : DEFAULT_THEME_PRESET_ID;
    },
  });

  // No "שמירה" button for this section on purpose — clicking a swatch
  // applies (and saves) it immediately, the same way the rest of this app
  // avoids an extra confirmation step for something this low-risk and
  // instantly reversible (just click another swatch).
  const setThemeColor = useMutation({
    mutationFn: async (presetId: ThemePresetId) => {
      const { error } = await supabase.from("app_settings").upsert({ key: "theme_color", value: presetId });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app_settings", "theme_color"] }),
    onError: (err) => toast({ title: "שינוי ערכת הצבעים נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // The main sidebar's item order (לוח בקרה, לקוחות, עבודות...) — saved as
  // one array of `to` paths under this key, applied on top of the fixed
  // item list by applyNavOrder. AdminLayout reads the exact same setting
  // to actually render the sidebar in this order.
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

  const setNavOrder = useMutation({
    mutationFn: async (order: string[]) => {
      const { error } = await supabase.from("app_settings").upsert({ key: ADMIN_NAV_ORDER_SETTINGS_KEY, value: order });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app_settings", ADMIN_NAV_ORDER_SETTINGS_KEY] }),
    onError: (err) => toast({ title: "שינוי סדר התפריט נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const orderedNavItems = applyNavOrder(navOrder);

  function moveNavItem(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= orderedNavItems.length) return;
    const next = [...orderedNavItems];
    const [item] = next.splice(index, 1);
    next.splice(swapIndex, 0, item);
    setNavOrder.mutate(next.map((navItem) => navItem.to));
  }

  const { data: categories } = useQuery({
    queryKey: ["resource_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reordering swaps sort_order with the neighboring row rather than
  // renumbering the whole list — simpler, and every category still ends up
  // with a distinct, correctly-ordered value after enough clicks even if
  // some old rows happened to share a sort_order to begin with.
  const moveCategory = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const list = categories ?? [];
      const idx = list.findIndex((c) => c.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
      const a = list[idx];
      const b = list[swapIdx];
      const { error: err1 } = await supabase.from("resource_categories").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (err1) throw err1;
      const { error: err2 } = await supabase.from("resource_categories").update({ sort_order: a.sort_order }).eq("id", b.id);
      if (err2) throw err2;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resource_categories"] }),
    onError: (err) => toast({ title: "שינוי הסדר נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const categoryList = categories ?? [];
  const activeThemeId = themeColor ?? DEFAULT_THEME_PRESET_ID;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.settings}
        description="הגדרות כלליות של המערכת."
        icon={IconSettings}
        color="bg-slate-500"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">ערכת צבעים</p>
            <p className="text-xs text-muted-foreground">בחירה מתעדכנת בכל המערכת באופן מיידי.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {THEME_PRESETS.map((preset) => {
              const active = activeThemeId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setThemeColor.mutate(preset.id)}
                  disabled={setThemeColor.isPending}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors disabled:opacity-60",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                  )}
                >
                  <span
                    className="h-8 w-8 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.swatch }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">סדר פריטי התפריט הראשי</p>
            <p className="text-xs text-muted-foreground">
              קובע את הסדר שבו לוח הבקרה, לקוחות, עבודות וכל שאר הפריטים מופיעים בסרגל הצד.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {orderedNavItems.map((navItem, i) => {
              const Icon = navItem.icon;
              return (
                <li key={navItem.to} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {navItem.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="הזזה מעלה"
                      disabled={i === 0 || setNavOrder.isPending}
                      onClick={() => moveNavItem(i, "up")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="הזזה מטה"
                      disabled={i === orderedNavItems.length - 1 || setNavOrder.isPending}
                      onClick={() => moveNavItem(i, "down")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">סדר הקטגוריות בספריית המשאבים (חברת חשמל)</p>
            <p className="text-xs text-muted-foreground">
              קובע את הסדר שבו הקטגוריות מוצגות בתוך "חברת חשמל" — הזזה בחיצים.
            </p>
          </div>
          {categoryList.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קטגוריות עדיין.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {categoryList.map((category, i) => (
                <li key={category.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">{category.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="הזזה מעלה"
                      disabled={i === 0 || moveCategory.isPending}
                      onClick={() => moveCategory.mutate({ id: category.id, direction: "up" })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="הזזה מטה"
                      disabled={i === categoryList.length - 1 || moveCategory.isPending}
                      onClick={() => moveCategory.mutate({ id: category.id, direction: "down" })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
