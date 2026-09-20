import { createHashRouter, RouterProvider } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthLayout } from "./layouts/AuthLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { CustomerLayout } from "./layouts/CustomerLayout";
import { SignInPage } from "./pages/auth/SignInPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { RoleRedirect } from "./pages/RoleRedirect";
import { NotFoundPage } from "./pages/NotFoundPage";
import { QuotePrintPage } from "./pages/QuotePrintPage";
import { InvoicePrintPage } from "./pages/InvoicePrintPage";

import { AdminDashboardPage } from "./pages/admin/DashboardPage";
import { CustomersPage } from "./pages/admin/CustomersPage";
import { CustomerDetailPage } from "./pages/admin/CustomerDetailPage";
import { JobsPage } from "./pages/admin/JobsPage";
import { JobDetailPage } from "./pages/admin/JobDetailPage";
import { InventoryPage } from "./pages/admin/InventoryPage";
import { InventoryItemDetailPage } from "./pages/admin/InventoryItemDetailPage";
import { PriceListPage } from "./pages/admin/PriceListPage";
import { PriceListItemDetailPage } from "./pages/admin/PriceListItemDetailPage";
import { QuotesAndInvoicesPage } from "./pages/admin/QuotesAndInvoicesPage";
import { QuoteDetailPage } from "./pages/admin/QuoteDetailPage";
import { InvoiceDetailPage } from "./pages/admin/InvoiceDetailPage";
import { ExpensesPage } from "./pages/admin/ExpensesPage";
import { ExpenseDetailPage } from "./pages/admin/ExpenseDetailPage";
import { DocumentsPage } from "./pages/admin/DocumentsPage";
import { DocumentDetailPage } from "./pages/admin/DocumentDetailPage";
import { ResourceLibraryPage } from "./pages/admin/ResourceLibraryPage";
import { ResourceCategoryDetailPage } from "./pages/admin/ResourceCategoryDetailPage";
import { LeadsPage } from "./pages/admin/LeadsPage";
import { SettingsPage } from "./pages/admin/SettingsPage";

import { CustomerDashboardPage } from "./pages/customer/CustomerDashboardPage";
import { MyJobsPage } from "./pages/customer/MyJobsPage";
import { MyQuotesPage } from "./pages/customer/MyQuotesPage";
import { MyInvoicesPage } from "./pages/customer/MyInvoicesPage";
import { MyDocumentsPage } from "./pages/customer/MyDocumentsPage";

// A hash router (URLs like /#/admin/customers instead of /admin/customers)
// works identically whether this SPA is served from a normal web host, run
// through `vite dev`, or loaded via file:// inside the Electron desktop
// shell (apps/desktop) — a plain browser router needs server-side rewrite
// rules that file:// has no equivalent of, so navigating past the first
// page load would 404 inside the packaged desktop app.

// Supabase's password-recovery redirect does NOT reliably preserve the
// "#/reset-password" fragment we pass as redirectTo (see
// ForgotPasswordPage.tsx) — confirmed in production (2026-09-20): the
// server-side verify→redirect step lands the browser on the bare origin
// with the one-time code as a REAL query parameter and no hash path at all
// (e.g. "https://.../?code=xxx"), which our HashRouter reads as an empty
// route and — via RequireAuth's unauthenticated redirect — sends the user
// to "#/login" instead, silently discarding the code. To work around this
// (rather than depending on Supabase changing that behavior), we check the
// real, pre-hash query string ourselves, once, before the router is even
// created, and rewrite the URL into our own hash route so ResetPasswordPage
// still gets the code via its normal useSearchParams() call.
if (typeof window !== "undefined") {
  const topLevelParams = new URLSearchParams(window.location.search);
  const recoveryCode = topLevelParams.get("code");
  if (recoveryCode && !window.location.hash.startsWith("#/reset-password")) {
    const rewrittenUrl = `${window.location.pathname}#/reset-password?code=${encodeURIComponent(recoveryCode)}`;
    window.history.replaceState(null, "", rewrittenUrl);
  }
}

const router = createHashRouter([
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { index: true, element: <RoleRedirect /> },
      {
        path: "admin",
        element: <RequireAuth allowedRoles={["admin"]} />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: "customers", element: <CustomersPage /> },
              { path: "customers/:id", element: <CustomerDetailPage /> },
              { path: "jobs", element: <JobsPage /> },
              { path: "jobs/:id", element: <JobDetailPage /> },
              { path: "inventory", element: <InventoryPage /> },
              { path: "inventory/:id", element: <InventoryItemDetailPage /> },
              { path: "price-list", element: <PriceListPage /> },
              { path: "price-list/:id", element: <PriceListItemDetailPage /> },
              { path: "quotes", element: <QuotesAndInvoicesPage /> },
              { path: "quotes/:id", element: <QuoteDetailPage /> },
              { path: "invoices/:id", element: <InvoiceDetailPage /> },
              { path: "expenses", element: <ExpensesPage /> },
              { path: "expenses/:id", element: <ExpenseDetailPage /> },
              { path: "documents", element: <DocumentsPage /> },
              { path: "documents/:id", element: <DocumentDetailPage /> },
              { path: "resources", element: <ResourceLibraryPage /> },
              { path: "resources/:categoryId", element: <ResourceCategoryDetailPage /> },
              { path: "leads", element: <LeadsPage /> },
              { path: "settings", element: <SettingsPage /> },
            ],
          },
          // Outside AdminLayout on purpose — a print/PDF view has no
          // sidebar chrome, just the document itself.
          { path: "quotes/:id/print", element: <QuotePrintPage /> },
          { path: "invoices/:id/print", element: <InvoicePrintPage /> },
        ],
      },
      {
        path: "portal",
        children: [
          {
            element: <CustomerLayout />,
            children: [
              { index: true, element: <CustomerDashboardPage /> },
              { path: "jobs", element: <MyJobsPage /> },
              { path: "quotes", element: <MyQuotesPage /> },
              { path: "invoices", element: <MyInvoicesPage /> },
              { path: "documents", element: <MyDocumentsPage /> },
            ],
          },
          { path: "quotes/:id/print", element: <QuotePrintPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "login", element: <SignInPage /> },
      { path: "signup", element: <SignUpPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
