import {
  Card,
  Col,
  Row,
  Statistic,
  Typography,
  Table,
  Tag,
} from "antd";
import {
  BankOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

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
    },
    {
      title: "Activity",
      dataIndex: "action",
    },
    {
      title: "Time",
      dataIndex: "time",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "success" ? "green" : "blue"}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[20, 20]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Companies"
              value={1}
              prefix={<BankOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Employees"
              value={0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Online Now"
              value={0}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="Attendance Today"
              value={0}
              suffix="%"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
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

      <Card
        bordered={false}
        title="Recent Activities"
        style={{ marginTop: 20 }}
      >
        <Table
          columns={columns}
          dataSource={recentActivities}
          pagination={false}
        />
      </Card>
    </div>
  );
}