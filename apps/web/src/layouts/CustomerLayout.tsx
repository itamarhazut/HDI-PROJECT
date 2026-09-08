import { strings } from "@repo/shared";
import { AppShell, type NavItem } from "./AppShell";

const navItems: NavItem[] = [
  { to: "/portal", label: strings.nav.dashboard },
  { to: "/portal/jobs", label: strings.nav.myJobs },
  { to: "/portal/quotes", label: strings.nav.myQuotes },
  { to: "/portal/invoices", label: strings.nav.myInvoices },
  { to: "/portal/documents", label: strings.nav.myDocuments },
];

export function CustomerLayout() {
  return <AppShell title="אזור אישי" navItems={navItems} />;
}
