import { strings } from "@repo/shared";
import { AppShell, type NavItem } from "./AppShell";
import { IconClipboardCheck, IconDashboard, IconFileText, IconFolder, IconReceipt } from "../components/icons";

const navItems: NavItem[] = [
  { to: "/portal", label: strings.nav.dashboard, icon: IconDashboard, end: true },
  { to: "/portal/jobs", label: strings.nav.myJobs, icon: IconClipboardCheck },
  { to: "/portal/quotes", label: strings.nav.myQuotes, icon: IconFileText },
  { to: "/portal/invoices", label: strings.nav.myInvoices, icon: IconReceipt },
  { to: "/portal/documents", label: strings.nav.myDocuments, icon: IconFolder },
];

export function CustomerLayout() {
  return <AppShell title="HDI Project" navItems={navItems} />;
}
