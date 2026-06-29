import { Button, Menu } from "antd";
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
  const companyName = currentUser?.company?.name || "XTTEN";
  const companyLogo = currentUser?.company?.logo || "";

  const items = [
    {
      key: "/dashboard",
      icon: <DashboardOutlined />,
      label: "Dashboard",
      required: null,
      children: [],
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
      key: "admin",
      icon: <CrownOutlined />,
      label: "System",
      required: "system:admin",
      children: [
        { key: "/admin/system", label: "System Configuration", required: "system:admin" },
        { key: "/admin/audit", label: "Audit Logs", required: "system:admin" },
      ],
    },
    {
      key: "attendance",
      icon: <ClockCircleOutlined />,
      label: "Attendance",
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
      label: "Shift",
      required: "shift:view",
      children: [
        { key: "/shift", label: "Shift Overview", required: "shift:view" },
        { key: "/shift-templates", label: "Shift Templates", required: "shift:view" },
        { key: "/work-groups", label: "Teams", required: "shift:view" },
        { key: "/rosters", label: "Rosters", required: "shift:view" },
      ],
    },
    {
      key: "leave",
      icon: <AuditOutlined />,
      label: "Leave",
      required: "leave:view",
      children: [
        { key: "/leave-requests", label: "Leave Requests", required: "leave:view" },
        { key: "/leave-settings", label: "Leave Settings", required: "leave:view_settings" },
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
      label: "Screenshot Wall",
      required: "activity:view",
      children: [
        { key: "/activity/screenshots", label: "Screenshot Wall", required: "activity:view" },
      ],
    },
    {
      key: "roles_permissions",
      icon: <SafetyCertificateOutlined />,
      label: "Users & Roles",
      required: "roles:view",
      children: [
        { key: "/users", label: "Users", required: "users:view" },
        { key: "/roles", label: "Roles", required: "roles:view" },
        { key: "/roles/assign", label: "Role Assignment", required: "roles:manage" },
      ],
    },
    {
      key: "billing",
      icon: <CreditCardOutlined />,
      label: "Billing",
      required: "billing:view",
      children: [
        { key: "/billing", label: "Billing Home", required: "billing:view" },
        { key: "/billing/subscriptions", label: "Subscriptions", required: "billing:view" },
        { key: "/billing/invoices", label: "Invoices", required: "billing:view" },
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
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {companyLogo ? (
          <img
            src={companyLogo}
            alt="company-logo"
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
          />
        ) : (
          <img
            src="/favicon.svg"
            alt="xtten-logo"
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>XTTEN</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {companyName}
          </span>
        </div>
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

      {/* APP DOWNLOAD - fixed left bottom */}
      {currentUser && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <Button
            block
            icon={<DownloadOutlined />}
            onClick={() => navigate("/agent/download")}
            style={{
              height: 40,
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
              color: "#F8FAFF",
              borderColor: "rgba(255,255,255,0.18)",
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            App Download
          </Button>
        </div>
      )}
    </div>
  );
}