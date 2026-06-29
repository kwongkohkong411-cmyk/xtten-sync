import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login/Login";
import MainLayout from "../layouts/MainLayout";

import Companies from "../pages/Companies/Companies";
import CompanyDetail from "../pages/Companies/CompanyDetail";
import CompanySettings from "../pages/Companies/CompanySettings";
import MultiTenantConfig from "../pages/Companies/MultiTenantConfig";
import Departments from "../pages/Departments/Departments";
import DepartmentMembers from "../pages/Departments/DepartmentMembers";
import Employees from "../pages/Employees/Employees";
import EmployeeDetails from "../pages/Employees/EmployeeDetails";
import Roles from "../pages/Roles/Roles";
import Attendance from "../pages/Attendance/Attendance";
import Reports from "../pages/Reports/Reports";
import ActivityMonitoring from "../pages/Activity/ActivityMonitoring";
import ControlPlaneDashboard from "../pages/ControlPlane/ControlPlaneDashboard";
import Leaves from "../pages/Leaves/index";
import HolidaySettings from "../pages/HolidaySettings";
import Permissions from "../pages/Permissions";
import TenantAuditLogs from "../pages/AuditLogs/TenantAuditLogs";
import AgentDownloads from "../pages/Agent/AgentDownloads";
import Users from "../pages/Users/Users";

import { getCurrentUser, hasPermission } from "../utils/auth";
import { canAccessAudience, getAppShellRoutes, type NavAudience } from "../navigation/appShellConfig";

const appShellRoutes = getAppShellRoutes();

function hasFullSession() {
  const token = localStorage.getItem("xtten_token");
  const user = localStorage.getItem("xtten_user");
  const employeeId = localStorage.getItem("employee_id");
  return !!(token && user && employeeId);
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!hasFullSession()) {
    localStorage.removeItem("xtten_token");
    localStorage.removeItem("xtten_user");
    localStorage.removeItem("employee_id");
    return <Navigate to="/" replace />;
  }

  return children;
}

function AccessRoute({
  children,
  permission,
  audience = "all",
}: {
  children: ReactNode;
  permission?: string | null;
  audience?: NavAudience;
}) {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (!canAccessAudience(currentUser, audience)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function Router() {
  const isLoggedIn = hasFullSession();

  return (
    <BrowserRouter>
      <Routes>

        {/* =========================
            LOGIN
        ========================= */}
        <Route
          path="/"
          element={
            isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : <Login />
          }
        />

        {/* =========================
            PROTECTED ROUTES
        ========================= */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {appShellRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <AccessRoute permission={route.required} audience={route.audience}>
                  {route.element}
                </AccessRoute>
              }
            />
          ))}

          <Route
            path="/companies"
            element={
              <AccessRoute permission="organization:view">
                <Companies />
              </AccessRoute>
            }
          />
          <Route
            path="/companies/:id"
            element={
              <AccessRoute permission="organization:view">
                <CompanyDetail />
              </AccessRoute>
            }
          />
          <Route
            path="/companies/settings"
            element={
              <AccessRoute permission="organization:view">
                <CompanySettings />
              </AccessRoute>
            }
          />
          <Route
            path="/companies/multi-tenant"
            element={
              <AccessRoute permission="organization:view">
                <MultiTenantConfig />
              </AccessRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <AccessRoute permission="teams:view">
                <Departments />
              </AccessRoute>
            }
          />
          <Route
            path="/departments/members"
            element={
              <AccessRoute permission="teams:view">
                <DepartmentMembers />
              </AccessRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <AccessRoute permission="users:view">
                <Employees />
              </AccessRoute>
            }
          />
          <Route
            path="/employees/add"
            element={
              <AccessRoute permission="users:create">
                <Employees />
              </AccessRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <AccessRoute permission="users:view">
                <EmployeeDetails />
              </AccessRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <AccessRoute permission="attendance:view">
                <Attendance />
              </AccessRoute>
            }
          />
          <Route
            path="/attendance/records"
            element={
              <AccessRoute permission="attendance:view">
                <Attendance />
              </AccessRoute>
            }
          />
          <Route
            path="/leave-requests"
            element={
              <AccessRoute permission="leave:view">
                <Leaves />
              </AccessRoute>
            }
          />
          <Route
            path="/leave-settings"
            element={
              <AccessRoute permission="leave:view_settings">
                <Leaves />
              </AccessRoute>
            }
          />
          <Route
            path="/holiday-settings"
            element={
              <AccessRoute permission="holiday:view">
                <HolidaySettings />
              </AccessRoute>
            }
          />
          <Route
            path="/permissions"
            element={
              <AccessRoute permission="roles:view">
                <Permissions />
              </AccessRoute>
            }
          />
          <Route
            path="/agent/download"
            element={
              <AccessRoute permission="system:admin" audience="superAdmin">
                <AgentDownloads />
              </AccessRoute>
            }
          />
          <Route
            path="/control-plane"
            element={
              <AccessRoute permission="system:admin" audience="superAdmin">
                <ControlPlaneDashboard />
              </AccessRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <AccessRoute permission="report:view">
                <Reports />
              </AccessRoute>
            }
          />

          <Route
            path="/activity"
            element={
              <AccessRoute permission="activity:view">
                <ActivityMonitoring view="screenshots" />
              </AccessRoute>
            }
          />

          <Route
            path="/roles/assign"
            element={
              <AccessRoute permission="roles:manage">
                <Roles />
              </AccessRoute>
            }
          />

          <Route
            path="/logs/login"
            element={
              <AccessRoute permission="system:admin" audience="superAdmin">
                <TenantAuditLogs initialScope="CORE" />
              </AccessRoute>
            }
          />
          <Route
            path="/logs/actions"
            element={
              <AccessRoute permission="system:admin" audience="superAdmin">
                <TenantAuditLogs initialScope="RUNTIME" />
              </AccessRoute>
            }
          />

          <Route
            path="/me/profile"
            element={
              <AccessRoute permission="profile:view">
                <Navigate to="/profile" replace />
              </AccessRoute>
            }
          />
          <Route
            path="/me/change-password"
            element={
              <AccessRoute permission="profile:view">
                <Navigate to="/profile" replace />
              </AccessRoute>
            }
          />
        </Route>

        {/* =========================
            404 fallback
        ========================= */}
        <Route
          path="*"
          element={
            isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/" replace />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}