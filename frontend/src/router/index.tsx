import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login/Login";
import MainLayout from "../layouts/MainLayout";

import Dashboard from "../pages/Dashboard/Dashboard";
import Companies from "../pages/Companies/Companies";
import CompanyDetail from "../pages/Companies/CompanyDetail";
import CompanySettings from "../pages/Companies/CompanySettings";
import MultiTenantConfig from "../pages/Companies/MultiTenantConfig";
import Departments from "../pages/Departments/Departments";
import DepartmentMembers from "../pages/Departments/DepartmentMembers";
import Employees from "../pages/Employees/Employees";
import EmployeeDetails from "../pages/Employees/EmployeeDetails";
import Users from "../pages/Users/Users";
import Roles from "../pages/Roles/Roles";
import WorkGroups from "../pages/WorkGroups";
import ShiftTemplates from "../pages/ShiftTemplates";
import Rosters from "../pages/Rosters";
import ShiftManagement from "../pages/Shift/ShiftManagement";
import Attendance from "../pages/Attendance/Attendance";
import Reports from "../pages/Reports/Reports";
import ActivityMonitoring from "../pages/Activity/ActivityMonitoring";
import ControlPlaneDashboard from "../pages/ControlPlane/ControlPlaneDashboard";
import Leaves from "../pages/Leaves/index";
import HolidaySettings from "../pages/HolidaySettings";
import Permissions from "../pages/Permissions";
import TenantAuditLogs from "../pages/AuditLogs/TenantAuditLogs";
import AgentDownloads from "../pages/Agent/AgentDownloads";

import { getCurrentUser, hasPermission } from "../utils/auth";

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

function PermissionRoute({ children, permission }: { children: ReactNode; permission?: string }) {
  const currentUser = getCurrentUser();
  const devShowAll = localStorage.getItem("xtten_show_all_sidebar") === "true";

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  // Developer bypass: when sidebar Show all is enabled, allow opening target pages
  // to configure features one by one before final RBAC rollout.
  if (devShowAll) {
    return children;
  }

  if (!permission || currentUser.role === "SUPER_ADMIN") {
    return children;
  }

  if (!hasPermission(permission)) {
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/overview" element={<Dashboard />} />
          <Route path="/dashboard/analytics" element={<Dashboard />} />
          <Route path="/dashboard/realtime" element={<Dashboard />} />
          <Route
            path="/companies"
            element={
              <PermissionRoute permission="user:manage">
                <Companies />
              </PermissionRoute>
            }
          />
          <Route
            path="/companies/:id"
            element={
              <PermissionRoute permission="user:manage">
                <CompanyDetail />
              </PermissionRoute>
            }
          />
          <Route
            path="/companies/settings"
            element={
              <PermissionRoute permission="user:manage">
                <CompanySettings />
              </PermissionRoute>
            }
          />
          <Route
            path="/companies/multi-tenant"
            element={
              <PermissionRoute permission="user:manage">
                <MultiTenantConfig />
              </PermissionRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <PermissionRoute permission="user:manage">
                <Departments />
              </PermissionRoute>
            }
          />
          <Route
            path="/departments/members"
            element={
              <PermissionRoute permission="user:manage">
                <DepartmentMembers />
              </PermissionRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <PermissionRoute permission="user:manage">
                <Employees />
              </PermissionRoute>
            }
          />
          <Route
            path="/employees/add"
            element={
              <PermissionRoute permission="user:manage">
                <Employees />
              </PermissionRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <PermissionRoute permission="user:manage">
                <EmployeeDetails />
              </PermissionRoute>
            }
          />
          <Route path="/users" element={<Users />} />
          <Route path="/roles" element={<Roles />} />
          <Route
            path="/shift"
            element={
              <PermissionRoute permission="shift:view">
                <ShiftManagement />
              </PermissionRoute>
            }
          />
          <Route
            path="/work-groups"
            element={
              <PermissionRoute permission="shift:view">
                <WorkGroups />
              </PermissionRoute>
            }
          />
          <Route
            path="/shift-templates"
            element={
              <PermissionRoute permission="shift:view">
                <ShiftTemplates />
              </PermissionRoute>
            }
          />
          <Route
            path="/rosters"
            element={
              <PermissionRoute permission="shift:view">
                <Rosters />
              </PermissionRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <PermissionRoute permission="attendance:view">
                <Attendance />
              </PermissionRoute>
            }
          />
          <Route
            path="/attendance/records"
            element={
              <PermissionRoute permission="attendance:view">
                <Attendance />
              </PermissionRoute>
            }
          />
          <Route
            path="/attendance/calendar"
            element={
              <PermissionRoute permission="attendance:view">
                <Attendance />
              </PermissionRoute>
            }
          />
          <Route
            path="/attendance/report"
            element={
              <PermissionRoute permission="attendance:view">
                <Attendance />
              </PermissionRoute>
            }
          />
          <Route
            path="/leave-requests"
            element={
              <PermissionRoute permission="leave:view">
                <Leaves />
              </PermissionRoute>
            }
          />
          <Route
            path="/holiday-settings"
            element={
              <PermissionRoute permission="holiday:view">
                <HolidaySettings />
              </PermissionRoute>
            }
          />
          <Route
            path="/permissions"
            element={
              <PermissionRoute permission="user:manage">
                <Permissions />
              </PermissionRoute>
            }
          />
          <Route
            path="/agent/download"
            element={
              <PermissionRoute permission="system:admin">
                <AgentDownloads />
              </PermissionRoute>
            }
          />
          <Route
            path="/control-plane"
            element={
              <PermissionRoute permission="system:admin">
                <ControlPlaneDashboard />
              </PermissionRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <PermissionRoute permission="report:view">
                <Reports />
              </PermissionRoute>
            }
          />
          <Route
            path="/reports/daily"
            element={
              <PermissionRoute permission="report:view">
                <Reports />
              </PermissionRoute>
            }
          />
          <Route
            path="/reports/monthly"
            element={
              <PermissionRoute permission="report:view">
                <Reports />
              </PermissionRoute>
            }
          />
          <Route
            path="/reports/export"
            element={
              <PermissionRoute permission="report:export">
                <Reports />
              </PermissionRoute>
            }
          />

          <Route
            path="/activity"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity/live"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="live" />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity/timeline"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="timeline" />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity/screenshots"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="screenshots" />
              </PermissionRoute>
            }
          />

          {/* Backward compatibility for old activity routes */}
          <Route
            path="/activity/app-usage"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="timeline" />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity/website-tracking"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="live" />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity/input-stats"
            element={
              <PermissionRoute permission="activity:view">
                <ActivityMonitoring view="timeline" />
              </PermissionRoute>
            }
          />

          <Route
            path="/roles/assign"
            element={
              <PermissionRoute permission="user:manage">
                <Roles />
              </PermissionRoute>
            }
          />

          <Route
            path="/settings/general"
            element={
              <PermissionRoute permission="system:admin">
                <Navigate to="/companies/settings" replace />
              </PermissionRoute>
            }
          />
          <Route
            path="/settings/notifications"
            element={
              <PermissionRoute permission="system:admin">
                <Navigate to="/companies/settings" replace />
              </PermissionRoute>
            }
          />
          <Route
            path="/settings/api-keys"
            element={
              <PermissionRoute permission="system:admin">
                <Navigate to="/companies/settings" replace />
              </PermissionRoute>
            }
          />

          <Route
            path="/logs/login"
            element={
              <PermissionRoute permission="system:admin">
                <TenantAuditLogs initialScope="CORE" />
              </PermissionRoute>
            }
          />
          <Route
            path="/logs/actions"
            element={
              <PermissionRoute permission="system:admin">
                <TenantAuditLogs initialScope="RUNTIME" />
              </PermissionRoute>
            }
          />

          <Route path="/me/profile" element={<Navigate to="/users" replace />} />
          <Route path="/me/change-password" element={<Navigate to="/users" replace />} />
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