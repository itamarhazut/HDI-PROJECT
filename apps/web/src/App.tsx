import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthLayout } from "./layouts/AuthLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { CustomerLayout } from "./layouts/CustomerLayout";
import { SignInPage } from "./pages/auth/SignInPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { RoleRedirect } from "./pages/RoleRedirect";
import { NotFoundPage } from "./pages/NotFoundPage";

import { AdminDashboardPage } from "./pages/admin/DashboardPage";
import { CustomersPage } from "./pages/admin/CustomersPage";
import { JobsPage } from "./pages/admin/JobsPage";
import { InventoryPage } from "./pages/admin/InventoryPage";
import { PriceListPage } from "./pages/admin/PriceListPage";
import { QuotesPage } from "./pages/admin/QuotesPage";
import { InvoicesPage } from "./pages/admin/InvoicesPage";
import { DocumentsPage } from "./pages/admin/DocumentsPage";
import { LeadsPage } from "./pages/admin/LeadsPage";

import { CustomerDashboardPage } from "./pages/customer/CustomerDashboardPage";
import { MyJobsPage } from "./pages/customer/MyJobsPage";
import { MyQuotesPage } from "./pages/customer/MyQuotesPage";
import { MyInvoicesPage } from "./pages/customer/MyInvoicesPage";
import { MyDocumentsPage } from "./pages/customer/MyDocumentsPage";

const router = createBrowserRouter([
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
              { path: "jobs", element: <JobsPage /> },
              { path: "inventory", element: <InventoryPage /> },
              { path: "price-list", element: <PriceListPage /> },
              { path: "quotes", element: <QuotesPage /> },
              { path: "invoices", element: <InvoicesPage /> },
              { path: "documents", element: <DocumentsPage /> },
              { path: "leads", element: <LeadsPage /> },
            ],
          },
        ],
      },
      {
        path: "portal",
        element: <CustomerLayout />,
        children: [
          { index: true, element: <CustomerDashboardPage /> },
          { path: "jobs", element: <MyJobsPage /> },
          { path: "quotes", element: <MyQuotesPage /> },
          { path: "invoices", element: <MyInvoicesPage /> },
          { path: "documents", element: <MyDocumentsPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "login", element: <SignInPage /> },
      { path: "signup", element: <SignUpPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
