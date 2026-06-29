import { useEffect, useMemo, useState } from "react";
import { Typography, Space, Avatar, Button, Dropdown, Tag, message } from "antd";
import { UserOutlined, LogoutOutlined, DownOutlined, BankOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

const pageMap: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Real-time overview",
  },
  "/organization/companies": {
    title: "Organization",
    subtitle: "Manage Companies",
  },
  "/companies": {
    title: "Companies",
    subtitle: "Manage organizations",
  },
  "/teams": {
    title: "Teams",
    subtitle: "Team directory",
  },
  "/departments": {
    title: "Departments",
    subtitle: "Manage departments",
  },
  "/attendance/records": {
    title: "Attendance",
    subtitle: "Clock In / Out Records",
  },
  "/attendance/calendar": {
    title: "Attendance",
    subtitle: "Attendance Calendar",
  },
  "/attendance/report": {
    title: "Attendance",
    subtitle: "Work Hours Report",
  },
  "/attendance/work-hours": {
    title: "Attendance",
    subtitle: "Work Hours Report",
  },
  "/attendance/summary": {
    title: "Attendance",
    subtitle: "Attendance Summary",
  },
  "/attendance": {
    title: "Attendance",
    subtitle: "Clock In / Out Records",
  },
  "/shift/templates": {
    title: "Shift",
    subtitle: "Shift Templates",
  },
  "/shift/assignment": {
    title: "Shift",
    subtitle: "Teams Assignment",
  },
  "/shift/rosters": {
    title: "Shift",
    subtitle: "Rosters",
  },
  "/shift": {
    title: "Shift",
    subtitle: "Shift Management",
  },
  "/leave/apply": {
    title: "Leave",
    subtitle: "Apply Leave",
  },
  "/leave/requests": {
    title: "Leave",
    subtitle: "Requests",
  },
  "/leave/settings": {
    title: "Leave",
    subtitle: "Settings",
  },
  "/leave-requests": {
    title: "Leave",
    subtitle: "Leave Management",
  },
  "/holiday-settings": {
    title: "Holiday Settings",
    subtitle: "Public and Company Holiday Rules",
  },
  "/activity": {
    title: "Screenshot Wall",
    subtitle: "Screenshot Wall",
  },
  "/activity/screenshots": {
    title: "Screenshot Wall",
    subtitle: "Screenshot Wall",
  },
  "/reports": {
    title: "Reports",
    subtitle: "Daily / Weekly / Monthly Reports",
  },
  "/reports/daily": {
    title: "Reports",
    subtitle: "Daily Report",
  },
  "/reports/monthly": {
    title: "Reports",
    subtitle: "Monthly Report",
  },
  "/reports/summary": {
    title: "Reports",
    subtitle: "Summary",
  },
  "/roles": {
    title: "Users & Roles",
    subtitle: "Access and Account Management",
  },
  "/permissions-assignment": {
    title: "Users & Roles",
    subtitle: "Permissions Assignment",
  },
  "/profile": {
    title: "Profile",
    subtitle: "Personal profile and activity",
  },
  "/billing/subscription-plan": {
    title: "Billing",
    subtitle: "Subscription Plan",
  },
  "/billing/payment": {
    title: "Billing",
    subtitle: "Payment",
  },
  "/billing/invoices": {
    title: "Billing",
    subtitle: "Invoices",
  },
  "/billing/usage": {
    title: "Billing",
    subtitle: "Usage (Seats / Limits)",
  },
  "/system/config": {
    title: "System",
    subtitle: "System Config",
  },
  "/system/audit-logs": {
    title: "System",
    subtitle: "Audit Logs",
  },
  "/system/feature-flags": {
    title: "System",
    subtitle: "Feature Flags",
  },
  "/system/platform-overview": {
    title: "System",
    subtitle: "Platform Overview",
  },
};

export default function TopHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const page = useMemo(() => {
    const matched = Object.entries(pageMap).find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
    return matched ? matched[1] : pageMap["/dashboard"];
  }, [location.pathname]);

  const currentUserRaw = localStorage.getItem("xtten_user");
  const currentCompanyId = localStorage.getItem("company_id") || "";
  const currentUser = currentUserRaw ? JSON.parse(currentUserRaw) : null;
  const currentCompanyName = currentUser?.company?.name || "No Company Selected";
  const timezoneLabel = "UTC+08:00";
  const userName = currentUser?.name || currentUser?.username || "-";

  // =========================
  // LOGOUT FUNCTION
  // =========================
  const logout = () => {
    // 清理登录信息
    localStorage.removeItem("xtten_token");
    localStorage.removeItem("xtten_user");
    localStorage.removeItem("company_id");
    localStorage.removeItem("employee_id");

    message.success("Logged out");

    // 强制跳转登录页
    navigate("/");
  };

  const userMenu = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: logout,
    },
  ];

  return (
    <div
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: "1px solid #EEF0F4",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      {/* LEFT */}
      <div>
        <Title level={4} style={{ margin: 0 }}>
          {page.title}
        </Title>
        <Text style={{ fontSize: 12, color: "#94A3B8" }}>
          {page.subtitle}
        </Text>
      </div>

      {/* RIGHT */}
      <Space size={14}>
        <Tag color="blue" icon={<BankOutlined />}>{currentCompanyName}</Tag>
        <Tag>{timezoneLabel}</Tag>
        <Dropdown menu={{ items: userMenu }} trigger={["click"]}>
          <Button icon={<UserOutlined />}>
            {userName} <DownOutlined />
          </Button>
        </Dropdown>
      </Space>
    </div>
  );
}