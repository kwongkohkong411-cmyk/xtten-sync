import type { ReactNode } from "react";
import {
  DashboardOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  AuditOutlined,
  BarChartOutlined,
  FundViewOutlined,
  CreditCardOutlined,
  CrownOutlined,
} from "@ant-design/icons";

import type { CurrentUser } from "../utils/auth";
import { hasPermission, isSuperAdminOwner } from "../utils/auth";

import Dashboard from "../pages/Dashboard/Dashboard";
import Companies from "../pages/Companies/Companies";
import WorkGroups from "../pages/WorkGroups";
import Attendance from "../pages/Attendance/Attendance";
import ShiftTemplates from "../pages/ShiftTemplates";
import ShiftManagement from "../pages/Shift/ShiftManagement";
import Rosters from "../pages/Rosters";
import Leaves from "../pages/Leaves";
import Reports from "../pages/Reports/Reports";
import Users from "../pages/Users/Users";
import Roles from "../pages/Roles/Roles";
import Profile from "../pages/Profile/Profile";
import ActivityMonitoring from "../pages/Activity/ActivityMonitoring";
import TenantAuditLogs from "../pages/AuditLogs/TenantAuditLogs";
import ControlPlaneDashboard from "../pages/ControlPlane/ControlPlaneDashboard";
import BillingPage from "../pages/Billing/BillingPage";
import SystemPage from "../pages/System/SystemPage";

export type NavAudience = "all" | "companyAdmin" | "superAdmin" | "screenshotWall";

type AppRoute = {
  path: string;
  label: string;
  required?: string | null;
  audience?: NavAudience;
  element: ReactNode;
};

type AppSection = {
  key: string;
  label: string;
  icon: ReactNode;
  required?: string | null;
  audience?: NavAudience;
  route?: AppRoute;
  children?: AppRoute[];
};

export type VisibleMenuSection = {
  key: string;
  label: string;
  icon: ReactNode;
  route?: AppRoute;
  children: AppRoute[];
};

const APP_SHELL_SECTIONS: AppSection[] = [
  {
    key: "dashboard",
    label: "DASHBOARD",
    icon: <DashboardOutlined />,
    children: [
      {
        path: "/dashboard",
        label: "Overview",
        element: <Dashboard />,
      },
    ],
  },
  {
    key: "organization",
    label: "ORGANIZATION",
    icon: <GlobalOutlined />,
    required: "organization:view",
    children: [
      {
        path: "/organization/companies",
        label: "Manage Companies",
        required: "organization:view",
        element: <Companies />,
      },
    ],
  },
  {
    key: "teams",
    label: "TEAMS",
    icon: <SafetyCertificateOutlined />,
    required: "shift:view",
    children: [
      {
        path: "/teams",
        label: "Teams",
        required: "shift:view",
        element: <WorkGroups />,
      },
    ],
  },
  {
    key: "attendance",
    label: "ATTENDANCE",
    icon: <ClockCircleOutlined />,
    children: [
      {
        path: "/attendance/records",
        label: "Attendance Records",
        required: "attendance:view",
        element: <Attendance />,
      },
      {
        path: "/attendance/calendar",
        label: "Attendance Calendar",
        required: "attendance:view_calendar",
        element: <Attendance />,
      },
      {
        path: "/attendance/work-hours",
        label: "Attendance Records",
        required: "attendance:view",
        element: <Attendance />,
      },
      {
        path: "/attendance/summary",
        label: "Attendance Summary",
        required: "attendance:view",
        element: <Attendance />,
      },
    ],
  },
  {
    key: "shift",
    label: "SHIFT",
    icon: <CalendarOutlined />,
    required: "shift:view",
    children: [
      {
        path: "/shift/templates",
        label: "Shift Templates",
        required: "shift:view",
        element: <ShiftTemplates />,
      },
      {
        path: "/shift/assignment",
        label: "Teams Assignment",
        required: "shift:view",
        element: <ShiftManagement />,
      },
      {
        path: "/shift/rosters",
        label: "Rosters",
        required: "shift:view",
        element: <Rosters />,
      },
    ],
  },
  {
    key: "leave",
    label: "LEAVE",
    icon: <AuditOutlined />,
    required: "leave:view",
    children: [
      {
        path: "/leave/apply",
        label: "Apply Leave",
        required: "leave:view",
        element: <Leaves />,
      },
      {
        path: "/leave/requests",
        label: "Requests",
        required: "leave:view",
        element: <Leaves />,
      },
      {
        path: "/leave/settings",
        label: "Settings",
        required: "leave:view_settings",
        element: <Leaves />,
      },
    ],
  },
  {
    key: "reports",
    label: "REPORTS",
    icon: <BarChartOutlined />,
    required: "report:view",
    children: [
      {
        path: "/reports/daily",
        label: "Daily Report",
        required: "report:view",
        element: <Reports />,
      },
      {
        path: "/reports/monthly",
        label: "Monthly Report",
        required: "report:view",
        element: <Reports />,
      },
      {
        path: "/reports/summary",
        label: "Summary",
        required: "report:view",
        element: <Reports />,
      },
    ],
  },
  {
    key: "users-roles",
    label: "USERS & ROLES",
    icon: <SafetyCertificateOutlined />,
    children: [
      {
        path: "/users",
        label: "Users",
        required: "users:view",
        element: <Users />,
      },
      {
        path: "/roles",
        label: "Roles",
        required: "roles:view",
        element: <Roles />,
      },
      {
        path: "/permissions-assignment",
        label: "Permissions Assignment",
        required: "roles:manage",
        element: <Roles />,
      },
      {
        path: "/profile",
        label: "Profile",
        required: "profile:view",
        element: <Profile />,
      },
    ],
  },
  {
    key: "screenshot-wall",
    label: "SCREENSHOT WALL",
    icon: <FundViewOutlined />,
    required: "screenshot:view",
    audience: "screenshotWall",
    route: {
      path: "/activity/screenshots",
      label: "Screenshot Wall",
      required: "screenshot:view",
      audience: "screenshotWall",
      element: <ActivityMonitoring />,
    },
  },
  {
    key: "billing",
    label: "BILLING",
    icon: <CreditCardOutlined />,
    required: "billing:view",
    audience: "companyAdmin",
    children: [
      {
        path: "/billing/subscription-plan",
        label: "Subscription Plan",
        required: "billing:view",
        audience: "companyAdmin",
        element: <BillingPage title="Subscription Plan" description="Manage plan tier, renewal window, and subscription status." />,
      },
      {
        path: "/billing/payment",
        label: "Payment",
        required: "billing:view",
        audience: "companyAdmin",
        element: <BillingPage title="Payment" description="Manage billing method, payment channel, and settlement records." />,
      },
      {
        path: "/billing/invoices",
        label: "Invoices",
        required: "billing:view",
        audience: "companyAdmin",
        element: <BillingPage title="Invoices" description="Review invoice history, status, and downloadable statements." />,
      },
      {
        path: "/billing/usage",
        label: "Usage (Seats / Limits)",
        required: "billing:view",
        audience: "companyAdmin",
        element: <BillingPage title="Usage (Seats / Limits)" description="Track seat usage and tenant limits against current subscription." />,
      },
    ],
  },
  {
    key: "system",
    label: "SYSTEM",
    icon: <CrownOutlined />,
    required: "system:admin",
    audience: "superAdmin",
    children: [
      {
        path: "/system/config",
        label: "System Config",
        required: "system:admin",
        audience: "superAdmin",
        element: <SystemPage title="System Config" description="Platform-level configuration for runtime governance and policy control." />,
      },
      {
        path: "/system/audit-logs",
        label: "Audit Logs",
        required: "system:admin",
        audience: "superAdmin",
        element: <TenantAuditLogs initialScope="RUNTIME" />,
      },
      {
        path: "/system/feature-flags",
        label: "Feature Flags",
        required: "system:admin",
        audience: "superAdmin",
        element: <SystemPage title="Feature Flags" description="Manage staged release switches and safety rollouts." />,
      },
      {
        path: "/system/platform-overview",
        label: "Platform Overview",
        required: "system:admin",
        audience: "superAdmin",
        element: <ControlPlaneDashboard />,
      },
    ],
  },
];

function isCompanyAdmin(user: CurrentUser | null): boolean {
  return (user?.role || "").toUpperCase() === "COMPANY_ADMIN";
}

function isTeamLead(user: CurrentUser | null): boolean {
  return (user?.role || "").toUpperCase() === "TEAM_LEAD";
}

export function canAccessAudience(user: CurrentUser | null, audience: NavAudience = "all"): boolean {
  if (audience === "all") return true;
  if (!user) return false;
  if (audience === "superAdmin") return isSuperAdminOwner(user);
  if (audience === "companyAdmin") return isCompanyAdmin(user) && !isSuperAdminOwner(user);
  if (audience === "screenshotWall") {
    return isSuperAdminOwner(user) || isCompanyAdmin(user) || isTeamLead(user);
  }
  return false;
}

export function canAccessNavRoute(user: CurrentUser | null, route: Pick<AppRoute, "required" | "audience">): boolean {
  if (!canAccessAudience(user, route.audience || "all")) return false;
  if (!route.required) return true;
  return hasPermission(route.required);
}

export function getVisibleMenuSections(user: CurrentUser | null): VisibleMenuSection[] {
  return APP_SHELL_SECTIONS.map((section) => {
    const sectionAudience = section.audience || "all";
    const sectionRequired = section.required || null;

    if (section.route) {
      const route = {
        ...section.route,
        audience: section.route.audience || sectionAudience,
        required: section.route.required || sectionRequired,
      };
      if (!canAccessNavRoute(user, route)) return null;
      return {
        key: section.key,
        label: section.label,
        icon: section.icon,
        route,
        children: [],
      };
    }

    const children = (section.children || [])
      .map((child) => ({
        ...child,
        audience: child.audience || sectionAudience,
        required: child.required || sectionRequired,
      }))
      .filter((child) => canAccessNavRoute(user, child));

    if (children.length === 0) return null;

    return {
      key: section.key,
      label: section.label,
      icon: section.icon,
      children,
    };
  }).filter(Boolean) as VisibleMenuSection[];
}

export type AppShellRoute = {
  path: string;
  required?: string | null;
  audience?: NavAudience;
  element: ReactNode;
};

export function getAppShellRoutes(): AppShellRoute[] {
  const routes: AppShellRoute[] = [];

  APP_SHELL_SECTIONS.forEach((section) => {
    const sectionAudience = section.audience || "all";
    const sectionRequired = section.required || null;

    if (section.route) {
      routes.push({
        path: section.route.path,
        required: section.route.required || sectionRequired,
        audience: section.route.audience || sectionAudience,
        element: section.route.element,
      });
      return;
    }

    (section.children || []).forEach((child) => {
      routes.push({
        path: child.path,
        required: child.required || sectionRequired,
        audience: child.audience || sectionAudience,
        element: child.element,
      });
    });
  });

  return routes;
}
