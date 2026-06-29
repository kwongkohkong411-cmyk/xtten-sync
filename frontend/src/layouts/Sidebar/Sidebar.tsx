import { Menu } from "antd";
import React, { useState, useEffect } from "react";
import {
  DashboardOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  AuditOutlined,
  BarChartOutlined,
  ExportOutlined,
  SafetyCertificateOutlined,
  FundViewOutlined,
  DownloadOutlined,
  GlobalOutlined,
  CreditCardOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { hasPermission, getCurrentUser } from "../../utils/auth";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const currentUser = getCurrentUser();

  const items = [
    {
      key: "/dashboard",
      icon: <DashboardOutlined />,
      label: "Dashboard",
      required: null,
      children: [
        { key: "/dashboard/overview", label: "Overview", required: null },
        { key: "/dashboard/analytics", label: "Analytics", required: null },
        { key: "/dashboard/realtime", label: "Real-time Status", required: null },
      ],
    },
    {
      key: "organization",
      icon: <GlobalOutlined />,
      label: "Organization",
      required: "organization:view",
      children: [
        { key: "/organization", label: "Organization Settings", required: "organization:view" },
        { key: "/organization/companies", label: "Manage Companies", required: "organization:view" },
      ],
    },
    {
      key: "billing",
      icon: <CreditCardOutlined />,
      label: "Billing",
      required: "billing:view",
      children: [
        { key: "/billing", label: "Billing Overview", required: "billing:view" },
        { key: "/billing/subscriptions", label: "Subscriptions", required: "billing:view" },
        { key: "/billing/invoices", label: "Invoices", required: "billing:view" },
      ],
    },
    {
      key: "admin",
      icon: <CrownOutlined />,
      label: "Super Admin",
      required: "system:admin",
      children: [
        { key: "/admin/system", label: "System Configuration", required: "system:admin" },
        { key: "/admin/audit", label: "Audit Logs", required: "system:admin" },
      ],
    },
    {
      key: "attendance",
      icon: <ClockCircleOutlined />,
      label: "Attendance 打卡考勤",
      required: "attendance:view",
      children: [
        { key: "/attendance/records", label: "Clock In/Out Records", required: "attendance:view" },
        { key: "/attendance/calendar", label: "Attendance Calendar", required: "attendance:view" },
        { key: "/attendance/report", label: "Work Hours Report", required: "attendance:view" },
      ],
    },
    {
      key: "shift",
      icon: <CalendarOutlined />,
      label: "Shift 班次管理",
      required: "shift:view",
      children: [
        { key: "/shift", label: "Shift Overview", required: "shift:view" },
        { key: "/shift-templates", label: "Shift Templates", required: "shift:view" },
        { key: "/work-groups", label: "Work Groups", required: "shift:view" },
        { key: "/rosters", label: "Rosters", required: "shift:view" },
      ],
    },
    {
      key: "leave",
      icon: <AuditOutlined />,
      label: "Leave 请假审批",
      required: "leave:view",
      children: [
        { key: "/leave-requests", label: "Leave Requests", required: "leave:view" },
        { key: "/holiday-settings", label: "Holiday Settings", required: "holiday:view" },
      ],
    },
    {
      key: "reports",
      icon: <BarChartOutlined />,
      label: "Reports",
      required: "report:view",
      children: [
        { key: "/reports/daily", label: "Daily Report", required: "report:view" },
        { key: "/reports/monthly", label: "Monthly Report", required: "report:view" },
        { key: "/reports/export", label: "Export", icon: <ExportOutlined />, required: "report:export" },
      ],
    },
    {
      key: "activity",
      icon: <FundViewOutlined />,
      label: "Activity Monitoring 监控",
      required: "activity:view",
      children: [
        { key: "/activity/live", label: "Activity Live View", required: "activity:view" },
        { key: "/activity/timeline", label: "Employee Timeline", required: "activity:view" },
        { key: "/activity/screenshots", label: "Screenshot Wall", required: "activity:view" },
      ],
    },
    {
      key: "roles_permissions",
      icon: <SafetyCertificateOutlined />,
      label: "Users / Roles 管理",
      required: "roles:view",
      children: [
        { key: "/users", label: "Users", required: "users:view" },
        { key: "/roles", label: "Roles", required: "roles:view" },
        { key: "/roles/assign", label: "Role Assignment", required: "roles:manage" },
      ],
    },
  ];

  const visibleItems = items
    .map((item) => {
      // filter children
      if (item.children && item.children.length) {
        const visibleChildren = item.children.filter((child) => {
          if (child.required === null) return true;
          return hasPermission(child.required as string);
        });

        if (visibleChildren.length === 0) return null;

        return { ...item, children: visibleChildren };
      }

      // no children
      if (item.required === null) return item;
      if (hasPermission(item.required as string)) return item;
      return null;
    })
    .filter(Boolean) as any[];

  // derive selected and open keys
  const pathname = location.pathname;
  const allKeys = visibleItems.flatMap((it) => (it.children ? it.children.map((c: any) => c.key) : it.key));
  const exactMatch = allKeys.find((k) => typeof k === 'string' && pathname === k) as string | undefined;
  const prefixMatch = allKeys.find((k) => {
    if (typeof k !== 'string') return false;
    if (k.includes('/:')) {
      const base = k.split('/:')[0];
      return pathname.startsWith(base);
    }
    return pathname.startsWith(k + '/');
  }) as string | undefined;
  const selectedKey = exactMatch || prefixMatch;

  const derivedOpenKeys = visibleItems
    .filter((it) => it.children && it.children.some((c: any) => c.key === selectedKey))
    .map((it) => it.key as string);

  useEffect(() => {
    if (derivedOpenKeys.length > 0) {
      setOpenKeys((prev) => Array.from(new Set([...prev, ...derivedOpenKeys])));
    }
  }, [pathname, selectedKey]);

  function handleMenuClick(key: string) {
    if (key === "/logout") {
      localStorage.removeItem("xtten_token");
      localStorage.removeItem("xtten_user");
      localStorage.removeItem("employee_id");
      localStorage.removeItem("company_id");
      navigate("/");
      return;
    }

    navigate(key);
  }

  return (
    <div
      className="xtten-sidebar"
      style={{
        width: 300,
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        background: "linear-gradient(180deg,#1E0038,#12001F,#070012)",
        padding: 16,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 20,
        }}
      >
        XTTEN Sync
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 12 }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          onClick={({ key }) => handleMenuClick(String(key))}
          items={visibleItems}
          style={{ background: "transparent", border: "none" }}
        />
      </div>

      {/* Agent Download Center - Fixed at bottom */}
      {currentUser && hasPermission("system:admin") && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 12,
            paddingBottom: 4,
          }}
          onClick={() => handleMenuClick("/agent/download")}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 4,
              cursor: "pointer",
              color: pathname === "/agent/download" ? "#1890ff" : "rgba(255,255,255,0.65)",
              transition: "all 0.3s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLDivElement).style.color = "#1890ff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
              (e.currentTarget as HTMLDivElement).style.color = pathname === "/agent/download" ? "#1890ff" : "rgba(255,255,255,0.65)";
            }}
          >
            <DownloadOutlined style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14 }}>Agent Download Center</span>
          </div>
        </div>
      )}
    </div>
  );
}