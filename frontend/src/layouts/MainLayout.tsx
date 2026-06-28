import { Layout } from "antd";
import { Outlet } from "react-router-dom";

import Sidebar from "./Sidebar";
import TopHeader from "./TopHeader";
import Content from "./Content/Content";

export default function MainLayout() {
  return (
    <Layout>
      <Sidebar />

      <Layout style={{ marginLeft: 300 }}>
        <TopHeader />

        <Content>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}