import { Layout, Menu, Typography, Avatar, Dropdown, Space, Button } from "antd";
import {
  DashboardOutlined,
  BankOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Sider, Content } = Layout;

const pageInfo: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Overview of your organization",
  },
  "/companies": {
    title: "Companies",
    subtitle: "Manage your companies and organizations",
  },
  "/employees": {
    title: "Employees",
    subtitle: "Manage all employees",
  },
  "/attendance": {
    title: "Attendance",
    subtitle: "Track attendance and working hours",
  },
  "/reports": {
    title: "Reports",
    subtitle: "View analytics and export reports",
  },
  "/settings": {
    title: "Settings",
    subtitle: "System configuration",
  },
};

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage = pageInfo[location.pathname] || pageInfo["/dashboard"];

  const handleLogout = () => {
    localStorage.removeItem("xtten_token");
    navigate("/");
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={280}
        theme="dark"
        style={{
          background: "#020617",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 28,
            fontWeight: 800,
            padding: "32px 28px",
            letterSpacing: 0.5,
          }}
        >
          XTTEN Sync
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          style={{
            background: "#020617",
            borderRight: 0,
            fontSize: 16,
          }}
          items={[
            {
              key: "/dashboard",
              icon: <DashboardOutlined />,
              label: "Dashboard",
            },
            {
              key: "/companies",
              icon: <BankOutlined />,
              label: "Companies",
            },
            {
              key: "/employees",
              icon: <TeamOutlined />,
              label: "Employees",
            },
            {
              key: "/attendance",
              icon: <ClockCircleOutlined />,
              label: "Attendance",
            },
            {
              key: "/reports",
              icon: <BarChartOutlined />,
              label: "Reports",
            },
            {
              key: "/settings",
              icon: <SettingOutlined />,
              label: "Settings",
            },
          ]}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: "#fff",
            height: 88,
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {currentPage.title}
            </Typography.Title>

            <Typography.Text type="secondary">
              {currentPage.subtitle}
            </Typography.Text>
          </div>

          <Space size="large">
            <Button shape="circle" icon={<BellOutlined />} />

            <Dropdown
              menu={{
                items: [
                  {
                    key: "profile",
                    icon: <UserOutlined />,
                    label: "Profile",
                  },
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "Logout",
                    danger: true,
                    onClick: handleLogout,
                  },
                ],
              }}
            >
              <Space style={{ cursor: "pointer" }}>
                <Avatar icon={<UserOutlined />} />
                <span>Admin</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            padding: 32,
            background: "#f5f7fb",
            minHeight: "calc(100vh - 88px)",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}