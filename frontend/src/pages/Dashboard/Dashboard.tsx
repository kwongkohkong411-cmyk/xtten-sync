import { Card, Col, Row, Table, Tag, Typography } from "antd";
import {
  BankOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatsCard from "../../components/StatsCard/StatsCard";

const recentActivities = [
  {
    key: "1",
    user: "Admin",
    action: "Created company XTTEN HQ",
    time: "Just now",
    status: "success",
  },
  {
    key: "2",
    user: "System",
    action: "Company module initialized",
    time: "Today",
    status: "info",
  },
];

export default function Dashboard() {
  const columns = [
    {
      title: "User",
      dataIndex: "user",
      key: "user",
    },
    {
      title: "Activity",
      dataIndex: "action",
      key: "action",
    },
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "success" ? "green" : "blue"}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your organization"
      />

      <Row gutter={[20, 20]}>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard title="Companies" value={1} prefix={<BankOutlined />} />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatsCard title="Employees" value={0} prefix={<TeamOutlined />} />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Online Now"
            value={0}
            prefix={<CheckCircleOutlined />}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Attendance Today"
            value={0}
            suffix="%"
            prefix={<ClockCircleOutlined />}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={16}>
          <Card bordered={false} title="Attendance Overview">
            <div
              style={{
                height: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                background: "#f8fafc",
                borderRadius: 12,
              }}
            >
              Chart will be added later
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card bordered={false} title="Today Summary">
            <Typography.Paragraph>
              Total companies: <b>1</b>
            </Typography.Paragraph>

            <Typography.Paragraph>
              Total employees: <b>0</b>
            </Typography.Paragraph>

            <Typography.Paragraph>
              Online employees: <b>0</b>
            </Typography.Paragraph>

            <Typography.Paragraph>
              Attendance rate: <b>0%</b>
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} title="Recent Activities" style={{ marginTop: 20 }}>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={recentActivities}
          pagination={false}
        />
      </Card>
    </div>
  );
}