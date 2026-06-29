import { useEffect, useMemo, useState } from "react";
import { Card, Col, DatePicker, Row, Space, Statistic, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { getDailyReport } from "../../api/reports";
import { getLiveActivity, getScreenshots } from "../../api/activity";

const { Title, Text } = Typography;

type DashboardRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  teamName: string;
  status: string;
  currentApp: string;
  workingHours: string;
  idleMinutes: number;
  lastScreenshotAt: string;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(dayjs());
  const [daily, setDaily] = useState<any>(null);
  const [live, setLive] = useState<any[]>([]);
  const [shots, setShots] = useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const target = date.format("YYYY-MM-DD");
        const [dailyRes, liveRes, shotRes] = await Promise.all([
          getDailyReport({ date: target }),
          getLiveActivity({ date: target, limit: 300 }),
          getScreenshots({ date: target, limit: 500 }),
        ]);

        setDaily(dailyRes.data || null);
        setLive(Array.isArray(liveRes.data?.items) ? liveRes.data.items : []);
        setShots(Array.isArray(shotRes.data?.screenshots) ? shotRes.data.screenshots : []);
      } catch (error: any) {
        message.error(error?.response?.data?.message || "Failed to load dashboard data");
        setDaily(null);
        setLive([]);
        setShots([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [date.valueOf()]);

  const liveByEmployee = useMemo(() => {
    const map = new Map<string, { appName: string; idleMinutes: number; lastSeenAt: string }>();
    for (const item of live) {
      const employeeId = String(item?.employeeId || "");
      if (!employeeId) continue;
      const at = String(item?.at || item?.createdAt || new Date().toISOString());
      const current = map.get(employeeId);
      if (current && new Date(current.lastSeenAt).getTime() > new Date(at).getTime()) continue;

      map.set(employeeId, {
        appName: String(item?.data?.appName || "-"),
        idleMinutes: Number(item?.data?.idleSec ?? item?.data?.idleSeconds ?? 0) / 60,
        lastSeenAt: at,
      });
    }
    return map;
  }, [live]);

  const screenshotByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    for (const shot of shots) {
      const employeeId = String(shot?.employeeId || "");
      if (!employeeId || map.has(employeeId)) continue;
      map.set(employeeId, String(shot?.capturedAt || ""));
    }
    return map;
  }, [shots]);

  const tableRows = useMemo<DashboardRow[]>(() => {
    const rows = Array.isArray(daily?.rows) ? daily.rows : [];
    return rows.map((row: any, idx: number) => {
      const liveData = liveByEmployee.get(String(row.employeeId));
      const idleMinutes = Number(liveData?.idleMinutes || 0);
      return {
        key: String(row.employeeId || idx),
        employeeId: String(row.employeeId || ""),
        employeeName: String(row.name || row.username || row.employeeId || "-"),
        teamName: String(row.teamName || 'N/A'),
        status: String(row.status || "-"),
        currentApp: String(liveData?.appName || "-"),
        workingHours: String(row.totalHoursDuration || (row.totalHoursDecimal != null ? Number(row.totalHoursDecimal).toFixed(2) : "-")),
        idleMinutes,
        lastScreenshotAt: String(screenshotByEmployee.get(String(row.employeeId)) || ""),
      };
    });
  }, [daily, liveByEmployee, screenshotByEmployee]);

  const statusSummary = daily?.statusSummary || {};
  const totalEmployees = Number(daily?.totalEmployees || 0);
  const onlineCount = liveByEmployee.size;
  const offlineCount = Math.max(totalEmployees - onlineCount, 0);
  const idleCount = tableRows.filter((row) => row.idleMinutes >= 5).length;
  const workingCount = Math.max(onlineCount - idleCount, 0);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <div>
            <Title level={3} style={{ marginBottom: 6 }}>Dashboard</Title>
            <Text type="secondary">Today's overview and real-time employee status</Text>
          </div>
          <DatePicker value={date} onChange={(v) => setDate(v || dayjs())} />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Attendance" value={totalEmployees} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Present" value={Number(daily?.present || 0)} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Late" value={Number(statusSummary.late || 0)} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Leave" value={Number(statusSummary.leave || 0)} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Absent" value={Number(daily?.absent || 0)} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Working" value={workingCount} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Idle" value={idleCount} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title="Offline" value={offlineCount} valueStyle={{ fontSize: 34, fontWeight: 700 }} /></Card>
        </Col>
      </Row>

      <Card title="Real-time Employee Status" loading={loading}>
        <Table
          rowKey="key"
          dataSource={tableRows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Employee", dataIndex: "employeeName" },
            { title: 'Team', dataIndex: 'teamName' },
            {
              title: "Status",
              dataIndex: "status",
              render: (v: string) => <Tag color={v === "LATE" ? "orange" : v === "LEAVE" ? "blue" : v === "ON_TIME" ? "green" : "default"}>{v}</Tag>,
            },
            { title: "Current App", dataIndex: "currentApp" },
            {
              title: "Working Hours",
              dataIndex: "workingHours",
            },
            {
              title: "Idle",
              dataIndex: "idleMinutes",
              render: (v: number) => `${Math.round(v)} min`,
            },
            {
              title: "Last Screenshot",
              dataIndex: "lastScreenshotAt",
              render: (v: string) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-"),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
