import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, DatePicker, Input, Row, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { downloadDayReport, downloadMonthReport, getDailyReport, getMonthlyReport } from "../../api/reports";
import { getRosters } from "../../api/rosters";
import { getEmployees } from "../../api/employees";
import { getLiveActivity } from "../../api/activity";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function statusColor(status: string) {
  if (status === "ON_TIME") return "green";
  if (status === "LATE") return "orange";
  if (status === "LEAVE") return "blue";
  if (status === "HOLIDAY") return "cyan";
  if (status === "MISSING") return "default";
  return "red";
}

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf("month"), dayjs().endOf("day")]);
  const [team, setTeam] = useState<string | undefined>(undefined);
  const [employee, setEmployee] = useState<string | undefined>(undefined);
  const [shift, setShift] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState<"DAILY" | "MONTHLY">("DAILY");
  const [daily, setDaily] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [rosters, setRosters] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dailyLive, setDailyLive] = useState<any[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [dailyRes, monthRes, rosterRes, employeeRes, liveRes] = await Promise.all([
          getDailyReport({ date: dateRange[1].format("YYYY-MM-DD") }),
          getMonthlyReport({ month: dateRange[1].format("YYYY-MM") }),
          getRosters(),
          getEmployees(),
          getLiveActivity({ date: dateRange[1].format("YYYY-MM-DD"), limit: 500 }),
        ]);
        setDaily(dailyRes.data || null);
        setMonthly(monthRes.data || null);
        setRosters(Array.isArray(rosterRes.data) ? rosterRes.data : []);
        setEmployees(Array.isArray(employeeRes.data) ? employeeRes.data : []);
        setDailyLive(Array.isArray(liveRes.data?.items) ? liveRes.data.items : []);
      } catch (error: any) {
        message.error(error?.response?.data?.message || "Failed to load reports");
        setDaily(null);
        setMonthly(null);
        setRosters([]);
        setEmployees([]);
        setDailyLive([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [dateRange[0].valueOf(), dateRange[1].valueOf()]);

  useEffect(() => {
    const runMonthlySummary = async () => {
      if (reportType !== "MONTHLY") {
        setMonthlyRows([]);
        return;
      }

      const monthStart = dateRange[1].startOf("month");
      const monthEnd = dateRange[1].endOf("month");
      const days = monthEnd.date();

      try {
        const dayRequests = [];
        for (let i = 0; i < days; i += 1) {
          const day = monthStart.add(i, "day").format("YYYY-MM-DD");
          dayRequests.push(getDailyReport({ date: day }));
        }

        const dayResponses = await Promise.all(dayRequests);
        const agg = new Map<string, any>();

        for (const res of dayResponses) {
          const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
          for (const row of rows) {
            const key = String(row.employeeId || "");
            if (!key) continue;

            const current = agg.get(key) || {
              key,
              employeeId: key,
              name: row.name || row.username || key,
              totalDays: 0,
              present: 0,
              absent: 0,
              late: 0,
              leave: 0,
              holiday: 0,
              workingHours: 0,
              otHours: 0,
            };

            current.totalDays += 1;
            if (row.status === "ON_TIME" || row.status === "LATE") current.present += 1;
            if (row.status === "ABSENT" || row.status === "MISSING") current.absent += 1;
            if (row.status === "LATE") current.late += 1;
            if (row.status === "LEAVE") current.leave += 1;
            if (row.status === "HOLIDAY") current.holiday += 1;
            current.workingHours += Number(row.totalHoursDecimal || 0);
            current.otHours += Math.max(Number(row.totalHoursDecimal || 0) - 9, 0);
            agg.set(key, current);
          }
        }

        setMonthlyRows(Array.from(agg.values()));
      } catch {
        setMonthlyRows([]);
      }
    };

    runMonthlySummary();
  }, [reportType, dateRange]);

  const summary = useMemo(() => {
    const status = reportType === "DAILY" ? daily?.statusSummary || {} : monthly?.statusTotals || {};
    const attendanceRate =
      reportType === "DAILY"
        ? Number(daily?.attendanceRate || 0)
        : Number(monthly?.averageAttendanceRate || 0);
    const present = reportType === "DAILY" ? Number(daily?.present || 0) : Number(status.onTime || 0) + Number(status.late || 0);
    const absent = reportType === "DAILY" ? Number(daily?.absent || 0) : Number(status.absent || 0) + Number(status.missing || 0);

    return {
      total: Number((reportType === "DAILY" ? daily?.totalEmployees : monthly?.totalEmployees) || 0),
      present,
      absent,
      late: Number(status.late || 0),
      onTime: Number(status.onTime || 0),
      leave: Number(status.leave || 0),
      attendanceRate,
    };
  }, [daily, monthly, reportType]);

  const rosterByEmployeeMonth = useMemo(() => {
    const map = new Map<string, { teamName: string; shiftName: string }>();
    for (const roster of rosters) {
      const month = String(roster?.month || "");
      const employeeId = String(roster?.employeeId || "");
      if (!month || !employeeId) continue;
      map.set(`${employeeId}:${month}`, {
        teamName: roster?.workGroup?.name || "-",
        shiftName: roster?.shift?.name || "-",
      });
    }
    return map;
  }, [rosters]);

  const teamOptions = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const roster of rosters) {
      const name = String(roster?.workGroup?.name || "").trim();
      if (!name) continue;
      uniq.set(name, name);
    }
    return Array.from(uniq.values()).map((name) => ({ label: name, value: name }));
  }, [rosters]);

  const shiftOptions = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const roster of rosters) {
      const name = String(roster?.shift?.name || "").trim();
      if (!name) continue;
      uniq.set(name, name);
    }
    return Array.from(uniq.values()).map((name) => ({ label: name, value: name }));
  }, [rosters]);

  const employeeOptions = useMemo(() => {
    return employees.map((item) => ({
      label: item?.name || item?.employeeNo || item?.id,
      value: item?.id,
    }));
  }, [employees]);

  const detailRows = useMemo(() => {
    const rows = Array.isArray(daily?.rows) ? daily.rows : [];
    const keyword = search.trim().toLowerCase();

    const idleByEmployee = new Map<string, number>();
    for (const item of dailyLive) {
      const employeeId = String(item?.employeeId || "");
      if (!employeeId) continue;
      const idleSec = Number(item?.data?.idleSec ?? item?.data?.idleSeconds ?? 0);
      const prev = idleByEmployee.get(employeeId) || 0;
      if (idleSec > prev) idleByEmployee.set(employeeId, idleSec);
    }

    return rows
      .map((row: any) => {
        const month = dayjs(row?.workDate || dateRange[1]).format("YYYY-MM");
        const roster = rosterByEmployeeMonth.get(`${row.employeeId}:${month}`);
        return {
          ...row,
          teamName: roster?.teamName || "-",
          shiftName: roster?.shiftName || "-",
          idleMinutes: Math.round((idleByEmployee.get(String(row.employeeId)) || 0) / 60),
          isLate: row?.status === "LATE",
          isHoliday: row?.status === "HOLIDAY",
          otHours: Math.max(Number(row?.totalHoursDecimal || 0) - 9, 0),
        };
      })
      .filter((row: any) => {
        if (team && String(row?.teamName || "") !== team) return false;
        if (employee && String(row?.employeeId || "") !== employee) return false;
        if (shift && String(row?.shiftName || "") !== shift) return false;
        if (!keyword) return true;
        return (
          String(row?.name || "").toLowerCase().includes(keyword) ||
          String(row?.username || "").toLowerCase().includes(keyword) ||
          String(row?.teamName || "").toLowerCase().includes(keyword) ||
          String(row?.shiftName || "").toLowerCase().includes(keyword) ||
          String(row?.status || "").toLowerCase().includes(keyword)
        );
      })
      .map((row: any, idx: number) => ({ ...row, key: row.employeeId || `${idx}` }));
  }, [daily, search, team, employee, shift, rosterByEmployeeMonth, dateRange, dailyLive]);

  const exportExcel = async () => {
    try {
      const blob =
        reportType === "DAILY"
          ? await downloadDayReport({ date: dateRange[1].format("YYYY-MM-DD"), format: "xlsx" })
          : await downloadMonthReport({ month: dateRange[1].format("YYYY-MM"), format: "xlsx" });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        reportType === "DAILY"
          ? `daily-report-${dateRange[1].format("YYYY-MM-DD")}.xlsx`
          : `monthly-report-${dateRange[1].format("YYYY-MM")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("Export excel success");
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Export failed");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={3} style={{ marginBottom: 8 }}>Reports 报表中心</Title>
        <Text type="secondary">支持日报/周报/月报、出勤汇总、活跃度统计、迟到缺勤统计、班次工时报表</Text>
      </Card>

      <Card title="筛选条件">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <RangePicker
              style={{ width: "100%" }}
              value={dateRange}
              onChange={(v) => {
                if (v && v[0] && v[1]) setDateRange([v[0], v[1]]);
              }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Team"
              value={team}
              onChange={setTeam}
              options={teamOptions}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Employee"
              value={employee}
              onChange={setEmployee}
              options={employeeOptions}
            />
          </Col>
          <Col xs={24} md={3}>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Shift"
              value={shift}
              onChange={setShift}
              options={shiftOptions}
            />
          </Col>
          <Col xs={24} md={3}>
            <Input.Search placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Col>
        </Row>

        <Space style={{ marginTop: 12 }}>
          <Select
            value={reportType}
            onChange={setReportType}
            options={[
              { label: "日报", value: "DAILY" },
              { label: "月报", value: "MONTHLY" },
            ]}
          />
          <Button type="primary" onClick={exportExcel}>导出 Excel</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Card loading={loading}><Text type="secondary">总人数</Text><Title level={3}>{summary.total}</Title></Card></Col>
        <Col xs={24} md={8}><Card loading={loading}><Text type="secondary">出勤率</Text><Title level={3}>{summary.attendanceRate}%</Title></Card></Col>
        <Col xs={24} md={8}><Card loading={loading}><Text type="secondary">出勤/缺勤</Text><Title level={3}>{summary.present} / {summary.absent}</Title></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Card><Text type="secondary">准时</Text><Title level={4}>{summary.onTime}</Title></Card></Col>
        <Col xs={24} md={8}><Card><Text type="secondary">迟到</Text><Title level={4}>{summary.late}</Title></Card></Col>
        <Col xs={24} md={8}><Card><Text type="secondary">请假</Text><Title level={4}>{summary.leave}</Title></Card></Col>
      </Row>

      <Card title="明细表">
        <Table
          rowKey="key"
          loading={loading}
          pagination={{ pageSize: 10 }}
          columns={[
            ...(reportType === "DAILY"
              ? [
                  { title: "John/Employee", dataIndex: "name" },
                  { title: "Shift", dataIndex: "shiftName" },
                  {
                    title: "Check In",
                    dataIndex: "checkIn",
                    render: (v: string | null) => (v ? dayjs(v).format("HH:mm:ss") : "-"),
                  },
                  {
                    title: "Check Out",
                    dataIndex: "checkOut",
                    render: (v: string | null) => (v ? dayjs(v).format("HH:mm:ss") : "-"),
                  },
                  {
                    title: "Total Hours",
                    dataIndex: "totalHoursDecimal",
                    render: (v: number | null) => (v != null ? Number(v).toFixed(2) : "-"),
                  },
                  {
                    title: "Idle",
                    dataIndex: "idleMinutes",
                    render: (v: number) => `${v || 0} min`,
                  },
                  {
                    title: "Late",
                    dataIndex: "isLate",
                    render: (v: boolean) => (v ? <Tag color="orange">YES</Tag> : <Tag color="green">NO</Tag>),
                  },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (v: string) => <Tag color={statusColor(v)}>{v || "-"}</Tag>,
                  },
                  {
                    title: "Holiday",
                    dataIndex: "isHoliday",
                    render: (v: boolean) => (v ? <Tag color="cyan">YES</Tag> : <Tag>NO</Tag>),
                  },
                  {
                    title: "OT Hours",
                    dataIndex: "otHours",
                    render: (v: number) => Number(v || 0).toFixed(2),
                  },
                ]
              : [
                  { title: "Employee", dataIndex: "name" },
                  { title: "Total Days", dataIndex: "totalDays" },
                  { title: "Present", dataIndex: "present" },
                  { title: "Absent", dataIndex: "absent" },
                  { title: "Late", dataIndex: "late" },
                  { title: "Total Leave Days", dataIndex: "leave" },
                  { title: "Holiday Days", dataIndex: "holiday" },
                  {
                    title: "Working Hours",
                    dataIndex: "workingHours",
                    render: (v: number) => Number(v || 0).toFixed(2),
                  },
                  {
                    title: "OT Hours",
                    dataIndex: "otHours",
                    render: (v: number) => Number(v || 0).toFixed(2),
                  },
                ]),
          ]}
          dataSource={reportType === "DAILY" ? detailRows : monthlyRows}
        />
      </Card>

      {reportType === "MONTHLY" && (
        <Card title="Monthly Trend">
          <Table
            rowKey="date"
            loading={loading}
            dataSource={Array.isArray(monthly?.trend) ? monthly.trend : []}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "Date", dataIndex: "date" },
              { title: "Present", dataIndex: "present" },
              { title: "Absent", dataIndex: "absent" },
              { title: "Late", render: (_: any, r: any) => r?.statusSummary?.late ?? 0 },
              { title: "Leave", render: (_: any, r: any) => r?.statusSummary?.leave ?? 0 },
              { title: "Attendance %", dataIndex: "attendanceRate", render: (v: number) => `${Number(v || 0).toFixed(2)}%` },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}
