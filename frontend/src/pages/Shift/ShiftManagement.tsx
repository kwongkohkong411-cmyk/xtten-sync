import { Card, Space, Table, Tabs, Tag, Typography } from "antd";
import ShiftTemplates from "../ShiftTemplates";
import WorkGroups from "../WorkGroups";
import Rosters from "../Rosters";

const { Title, Text } = Typography;

const referenceColumns = [
  { title: "班次名称", dataIndex: "name" },
  { title: "开始时间", dataIndex: "start" },
  { title: "结束时间", dataIndex: "end" },
  {
    title: "是否跨日",
    dataIndex: "crossDay",
    render: (v: boolean) => (v ? <Tag color="purple">是</Tag> : <Tag>否</Tag>),
  },
  { title: "休息时间", dataIndex: "break" },
  { title: "适用团队", dataIndex: "team" },
];

const referenceData = [
  { key: "morning", name: "早班", start: "08:00", end: "17:00", crossDay: false, break: "60 min", team: "A Team" },
  { key: "night", name: "晚班", start: "20:00", end: "08:00", crossDay: true, break: "90 min", team: "Night Team" },
];

export default function ShiftManagement() {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={3} style={{ marginBottom: 8 }}>Shift 班次管理</Title>
        <Text type="secondary">统一管理班次模板、适用团队和排班。支持跨日班次（例如 20:00 - 次日 08:00）。</Text>
      </Card>

      <Card title="班次结构参考（MVP）">
        <Table rowKey="key" columns={referenceColumns} dataSource={referenceData} pagination={false} />
      </Card>

      <Card title="端到端流程">
        <Text>
          {"班次设置 (Shift Templates / Work Groups / Rosters) -> 员工打卡 (Attendance) -> 跨日工时计算 (后端事件聚合) -> 报表展示与导出 (Reports)"}
        </Text>
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
