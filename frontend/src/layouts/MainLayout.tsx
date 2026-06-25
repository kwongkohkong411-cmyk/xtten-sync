import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="dark">
        <div
          style={{
            color: "#fff",
            textAlign: "center",
            fontSize: 22,
            padding: 20,
            fontWeight: "bold",
          }}
        >
          XTTEN Sync
        </div>

        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={["1"]}
          items={[
            {
              key: "1",
              icon: <DashboardOutlined />,
              label: "Dashboard",
            },
            {
              key: "2",
              icon: <TeamOutlined />,
              label: "Employees",
            },
            {
              key: "3",
              icon: <ClockCircleOutlined />,
              label: "Attendance",
            },
            {
              key: "4",
              icon: <BarChartOutlined />,
              label: "Reports",
            },
            {
              key: "5",
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
            fontSize: 20,
            fontWeight: "bold",
          }}
        >
          Dashboard
        </Header>

        <Content
          style={{
            margin: 20,
            background: "#fff",
            borderRadius: 10,
            padding: 20,
          }}
        >
          Welcome to XTTEN Sync 🚀
        </Content>
      </Layout>
    </Layout>
  );
}