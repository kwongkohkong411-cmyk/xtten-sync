import { Card, Space, Table, Tabs, Tag, Typography } from "antd";
import ShiftTemplates from "../ShiftTemplates";
import WorkGroups from "../WorkGroups";
import Rosters from "../Rosters";

const { Title, Text } = Typography;

const referenceColumns = [
  { title: "Shift Name", dataIndex: "name" },
  { title: "Start Time", dataIndex: "start" },
  { title: "End Time", dataIndex: "end" },
  {
    title: "Cross Day",
    dataIndex: "crossDay",
    render: (v: boolean) => (v ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag>),
  },
  { title: "Break", dataIndex: "break" },
  { title: "Applicable Team", dataIndex: "team" },
];

const referenceData = [
  { key: "morning", name: "Morning Shift", start: "08:00", end: "17:00", crossDay: false, break: "60 min", team: "A Team" },
  { key: "night", name: "Night Shift", start: "20:00", end: "08:00", crossDay: true, break: "90 min", team: "Night Team" },
];

export default function ShiftManagement() {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={3} style={{ marginBottom: 8 }}>Shift Management</Title>
        <Text type="secondary">Manage shift templates, applicable teams, and rosters in one place. Supports cross-day shifts (for example, 20:00 - next day 08:00).</Text>
      </Card>

      <Card title="Shift Structure Reference">
        <Table rowKey="key" columns={referenceColumns} dataSource={referenceData} pagination={false} />
      </Card>

      <Tabs
        defaultActiveKey="templates"
        items={[
          {
            key: "templates",
            label: "Shift Templates",
            children: <ShiftTemplates />,
          },
          {
            key: "groups",
            label: "Applicable Teams",
            children: <WorkGroups />,
          },
          {
            key: "rosters",
            label: "Rosters",
            children: <Rosters />,
          },
        ]}
      />
    </Space>
  );
}
