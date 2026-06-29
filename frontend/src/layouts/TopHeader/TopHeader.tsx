import { useEffect, useMemo, useState } from "react";
import { Typography, Space, Avatar, Button, Tag, message } from "antd";
import { UserOutlined, LogoutOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

const pageMap: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Real-time overview",
  },
  "/companies": {
    title: "Companies",
    subtitle: "Manage organizations",
  },
  "/departments": {
    title: "Departments",
    subtitle: "Manage departments",
  },
  "/attendance": {
    title: "Attendance",
    subtitle: "打卡考勤",
  },
  "/shift": {
    title: "Shift",
    subtitle: "班次管理",
  },
  "/leave-requests": {
    title: "Leave",
    subtitle: "请假审批",
  },
  "/holiday-settings": {
    title: "Holiday Settings",
    subtitle: "国家/公司假期规则",
  },
  "/activity": {
    title: "Activity Monitoring",
    subtitle: "实时行为监控",
  },
  "/reports": {
    title: "Reports",
    subtitle: "日报/周报/月报",
  },
  "/roles": {
    title: "Users / Roles",
    subtitle: "权限与账号管理",
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
  const currentCompanyId = localStorage.getItem("company_id") || "-";
  const currentUser = currentUserRaw ? JSON.parse(currentUserRaw) : null;
  const currentCompanyName = currentUser?.company?.name || currentCompanyId;
  const beijingTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

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
        <Tag color="blue">Company: {currentCompanyName}</Tag>
        <Tag color="geekblue" icon={<UserOutlined />}>{currentUser?.name || currentUser?.username || "-"}</Tag>
        <Tag icon={<ClockCircleOutlined />}>北京时间 {beijingTime}</Tag>
        <Button icon={<LogoutOutlined />} onClick={logout}>Logout</Button>
      </Space>
    </div>
  );
}