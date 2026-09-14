import { strings } from "@repo/shared";
import type { NavItem } from "./AppShell";
import {
  IconBolt,
  IconBox,
  IconClipboardCheck,
  IconDashboard,
  IconFileText,
  IconFolder,
  IconMegaphone,
  IconTag,
  IconUsers,
  IconWallet,
} from "../components/icons";

// The master list of admin sidebar items and their default order — the
// same list the settings page's "סדר פריטי התפריט הראשי" section lets you
// reorder. `to` doubles as the stable key a saved order (app_settings →
// ADMIN_NAV_ORDER_SETTINGS_KEY) refers to, so don't repurpose one for a
// different page later — a leftover old key just gets ignored (see
// applyNavOrder), not confused for a different item.
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: strings.nav.dashboard, icon: IconDashboard, end: true },
  { to: "/admin/customers", label: strings.nav.customers, icon: IconUsers },
  { to: "/admin/jobs", label: strings.nav.jobs, icon: IconClipboardCheck },
  { to: "/admin/inventory", label: strings.nav.inventory, icon: IconBox },
  { to: "/admin/price-list", label: strings.nav.priceList, icon: IconTag },
  // One entry for both — QuotesAndInvoicesPage renders the two lists as
  // tabs, since issuing an invoice is really the next step after a quote's
  // job is done rather than a separate destination.
  { to: "/admin/quotes", label: strings.nav.quotesAndInvoices, icon: IconFileText },
  { to: "/admin/expenses", label: strings.nav.expenses, icon: IconWallet },
  { to: "/admin/documents", label: strings.nav.documents, icon: IconFolder },
  { to: "/admin/resources", label: strings.nav.resourceLibrary, icon: IconBolt },
  { to: "/admin/leads", label: strings.nav.leads, icon: IconMegaphone },
];

export const ADMIN_NAV_ORDER_SETTINGS_KEY = "admin_nav_order";

// Applies a saved order (an array of `to` paths, from app_settings) on top
// of the default list: known items move into that order, and anything not
// mentioned — a nav item added after the order was last saved, or a stale
// path from a renamed route — is appended at the end in its original
// relative order. That way a future new nav item just shows up instead of
// silently vanishing because an old saved order doesn't know about it yet.
export function applyNavOrder(order: string[] | null | undefined): NavItem[] {
  if (!order || order.length === 0) return ADMIN_NAV_ITEMS;
  const remaining = new Map(ADMIN_NAV_ITEMS.map((item) => [item.to, item]));
  const ordered: NavItem[] = [];
  for (const path of order) {
    const item = remaining.get(path);
    if (item) {
      ordered.push(item);
      remaining.delete(path);
    }
  }
  for (const item of ADMIN_NAV_ITEMS) {
    if (remaining.has(item.to)) ordered.push(item);
  }
  return ordered;
}
