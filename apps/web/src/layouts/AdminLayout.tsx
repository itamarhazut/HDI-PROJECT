import { strings } from "@repo/shared";
import { AppShell, type NavItem } from "./AppShell";

const navItems: NavItem[] = [
  { to: "/admin", label: strings.nav.dashboard },
  { to: "/admin/customers", label: strings.nav.customers },
  { to: "/admin/jobs", label: strings.nav.jobs },
  { to: "/admin/inventory", label: strings.nav.inventory },
  { to: "/admin/price-list", label: strings.nav.priceList },
  { to: "/admin/quotes", label: strings.nav.quotes },
  { to: "/admin/invoices", label: strings.nav.invoices },
  { to: "/admin/documents", label: strings.nav.documents },
  { to: "/admin/leads", label: strings.nav.leads },
];

export function AdminLayout() {
  return <AppShell title="HDI Project" navItems={navItems} />;
}
