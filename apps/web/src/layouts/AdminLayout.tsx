import { strings } from "@repo/shared";
import { AppShell, type NavItem } from "./AppShell";
import {
  IconBox,
  IconClipboardCheck,
  IconDashboard,
  IconFileText,
  IconFolder,
  IconMegaphone,
  IconReceipt,
  IconTag,
  IconUsers,
} from "../components/icons";

const navItems: NavItem[] = [
  { to: "/admin", label: strings.nav.dashboard, icon: IconDashboard, end: true },
  { to: "/admin/customers", label: strings.nav.customers, icon: IconUsers },
  { to: "/admin/jobs", label: strings.nav.jobs, icon: IconClipboardCheck },
  { to: "/admin/inventory", label: strings.nav.inventory, icon: IconBox },
  { to: "/admin/price-list", label: strings.nav.priceList, icon: IconTag },
  { to: "/admin/quotes", label: strings.nav.quotes, icon: IconFileText },
  { to: "/admin/invoices", label: strings.nav.invoices, icon: IconReceipt },
  { to: "/admin/documents", label: strings.nav.documents, icon: IconFolder },
  { to: "/admin/leads", label: strings.nav.leads, icon: IconMegaphone },
];

export function AdminLayout() {
  return <AppShell title="HDI Project" navItems={navItems} />;
}
