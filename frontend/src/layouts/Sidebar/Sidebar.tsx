import { Button, Divider, Menu, Modal, Space, Tag, Typography, message } from "antd";
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
import { getAgentReleases, openAgentDownload, type AgentArtifact, type AgentReleasesResponse } from "../../api/agent";

const { Text } = Typography;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [releases, setReleases] = useState<AgentReleasesResponse | null>(null);

  const currentUser = getCurrentUser();
  const companyName = currentUser?.company?.name || "XTTEN";
  const companyLogo = currentUser?.company?.logo || "";

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
        { key: "/work-groups", label: "Work Groups", required: "shift:view" },
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

  async function openDownloadPanel() {
    setDownloadOpen(true);
    if (releases || downloadLoading) return;

    setDownloadLoading(true);
    try {
      const res = await getAgentReleases();
      setReleases(res.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to load agent download info");
    } finally {
      setDownloadLoading(false);
    }
  }

  const windowsArtifacts = releases?.platforms?.windows?.artifacts || [];
  const firstAvailableWindows = windowsArtifacts.find((item: AgentArtifact) => item.available);

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
            onClick={() => void openDownloadPanel()}
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
            APP DOWNLOAD
          </Button>
        </div>
      )}

      <Modal
        title="APP DOWNLOAD"
        open={downloadOpen}
        onCancel={() => setDownloadOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <Text strong>Current Version: </Text>
            <Tag color="blue">{releases?.version || "Not available"}</Tag>
          </div>

          <Divider style={{ margin: "4px 0" }} />

          <div>
            <Text strong>Windows Agent</Text>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {downloadLoading ? (
                <Tag>Loading...</Tag>
              ) : windowsArtifacts.length === 0 ? (
                <Tag color="gold">Coming Soon</Tag>
              ) : (
                windowsArtifacts.map((artifact: AgentArtifact) => (
                  <Button
                    key={`win-${artifact.format}`}
                    type={artifact.available ? "primary" : "default"}
                    disabled={!artifact.available}
                    onClick={() => {
                      if (!artifact.available) return;
                      openAgentDownload("windows", artifact.format);
                    }}
                  >
                    {artifact.available
                      ? `Download ${artifact.format.toUpperCase()}`
                      : `${artifact.format.toUpperCase()} Not available`}
                  </Button>
                ))
              )}
            </div>
            {!downloadLoading && !firstAvailableWindows && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Coming Soon / Not available</Text>
              </div>
            )}
          </div>
        </Space>
      </Modal>
    </div>
  );
}