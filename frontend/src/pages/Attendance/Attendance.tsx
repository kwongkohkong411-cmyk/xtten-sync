import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, DatePicker, Empty, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import { CoffeeOutlined, LoginOutlined, LogoutOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { breakIn, breakOut, checkIn, checkOut, getAttendanceEvents } from "../../api/attendance";
import { getRosters } from "../../api/rosters";

const { Text } = Typography;
const { RangePicker } = DatePicker;

type AttendanceEvent = {
  id: string;
  employeeId: string;
  shiftDate?: string;
  date?: string;
  workDate?: string;
  status?: string;
  ruleSource?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  lateMinutes?: number | null;
  lateHours?: number | null;
  earlyLeaveMinutes?: number | null;
  earlyLeaveHours?: number | null;
  totalHours?: number | null;
  totalHoursDecimal?: number | null;
  anomaly?: string;
  anomalyList?: string[];
  timeline?: Array<{ type: string; at: string }>;
  employee?: { id: string; name?: string };
  shift?: { id: string; name?: string };
};

type RosterRecord = {
  employeeId?: string;
  month?: string;
  shift?: {
    name?: string;
    startTime?: string;
    endTime?: string;
    crossDay?: boolean;
    lateAfter?: number;
    earlyLeave?: number;
  };
  workGroup?: { name?: string };
};

type AdminRow = {
  id: string;
  employeeId: string;
  shiftDate: string;
  employee: string;
  team: string;
  shift: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  checkIn?: string | null;
  checkOut?: string | null;
  lateMinutes: number;
  lateHours: number;
  earlyLeaveMinutes: number;
  earlyLeaveHours: number;
  worked: number;
  status: string;
  anomalyList: string[];
  anomaly: string;
  ruleSource: string;
};

type ApiError = {
  response?: { data?: { message?: string } };
  message?: string;
};

function toDateTime(v?: string | null) {
  return v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-";
}

function toHours(v?: number | null) {
  const n = Number(v ?? 0);
  return n > 0 ? n.toFixed(2) : "0.00";
}

function toTime(v?: string | null) {
  return v ? dayjs(v).format("HH:mm") : "-";
}

function toHourMinute(v?: number | null) {
  const totalMinutes = Math.round(Number(v ?? 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function deriveShiftDate(event: AttendanceEvent) {
  const explicitDate = event.shiftDate || event.workDate || event.date;
  if (explicitDate) {
    const parsed = dayjs(explicitDate);
    if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  }

  const scheduledStart = event.scheduledStartTime;
  if (scheduledStart && (scheduledStart.includes("-") || scheduledStart.includes("T") || scheduledStart.includes("/"))) {
    const parsed = dayjs(scheduledStart);
    if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  }

  return "-";
}

function getCompanyTimezoneFromStorage() {
  const directTimezone = localStorage.getItem("company_timezone") || localStorage.getItem("timezone");
  if (directTimezone) return directTimezone;

  const userRaw = localStorage.getItem("xtten_user");
  if (!userRaw) return undefined;

  try {
    const user = JSON.parse(userRaw) as {
      timezone?: string;
      companyTimezone?: string;
      company?: { timezone?: string };
    };
    return user.company?.timezone || user.companyTimezone || user.timezone;
  } catch {
    return undefined;
  }
}

function getTodayByTimezone(timezone?: string) {
  if (!timezone) return dayjs();

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) {
      return dayjs(`${year}-${month}-${day}`);
    }
  } catch {
    // Fallback to browser local date when timezone is missing/invalid.
  }

  return dayjs();
}

function renderStatusBadge(status: string, anomalyList: string[]) {
  const source = `${status} ${anomalyList.join(" ")}`.toUpperCase();

  if (source.includes("HOLIDAY")) {
    return <Badge color="purple" text="Holiday" />;
  }
  if (source.includes("ABSENT")) {
    return <Badge color="red" text="Absent" />;
  }
  if (source.includes("EARLY_LEAVE")) {
    return <Badge color="yellow" text="Early Leave" />;
  }
  if (source.includes("LEAVE")) {
    return <Badge color="blue" text="Leave" />;
  }
  if (source.includes("LATE")) {
    return <Badge color="orange" text="Late" />;
  }
  if (source.includes("PRESENT")) {
    return <Badge color="green" text="Present" />;
  }

  return <Badge color="default" text={status || "-"} />;
}

function getStatusLabel(status: string, anomalyList: string[]) {
  const source = `${status} ${anomalyList.join(" ")}`.toUpperCase();

  if (source.includes("HOLIDAY")) return "Holiday";
  if (source.includes("ABSENT")) return "Absent";
  if (source.includes("EARLY_LEAVE")) return "Early Leave";
  if (source.includes("LEAVE")) return "Leave";
  if (source.includes("LATE")) return "Late";
  if (source.includes("PRESENT")) return "Present";
  return status || "-";
}

function toCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error) {
    const typedError = error as ApiError;
    return typedError.response?.data?.message || typedError.message || fallback;
  }

  return fallback;
}

export default function Attendance() {
  const resolveShiftDateToday = useCallback(() => getTodayByTimezone(getCompanyTimezoneFromStorage()), []);
  const currentEmployeeId = localStorage.getItem("employee_id") || "";
  const currentCompanyId = localStorage.getItem("company_id") || undefined;
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [rosters, setRosters] = useState<RosterRecord[]>([]);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [dayjs().startOf("month"), dayjs().endOf("day")]);
  const [employeeFilter, setEmployeeFilter] = useState<string | undefined>(undefined);
  const [shiftDateFilter, setShiftDateFilter] = useState<dayjs.Dayjs | undefined>(() =>
    resolveShiftDateToday(),
  );
  const [scenarioEmployeeId, setScenarioEmployeeId] = useState<string | undefined>(() => currentEmployeeId || undefined);
  const [scenarioDate, setScenarioDate] = useState(dayjs());

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const attendanceRes = await getAttendanceEvents({
        startDate: range[0].startOf("day").toISOString(),
        endDate: range[1].endOf("day").toISOString(),
      });
      setEvents(Array.isArray(attendanceRes.data?.events) ? attendanceRes.data.events : []);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, "Failed to load attendance"));
      setEvents([]);
      setRosters([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const fetchRosters = useCallback(() => {
    return getRosters({
      companyId: currentCompanyId,
      startDate: range[0].startOf("day").toISOString(),
      endDate: range[1].endOf("day").toISOString(),
    })
        .then((rosterRes) => {
          setRosters(Array.isArray(rosterRes.data) ? rosterRes.data : []);
        })
        .catch(() => {
          setRosters([]);
        });
  }, [currentCompanyId, range]);

  const rangeStart = range[0].valueOf();
  const rangeEnd = range[1].valueOf();

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchEvents();
      void fetchRosters();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchEvents, fetchRosters, rangeEnd, rangeStart]);

  const selfEvents = useMemo(() => events.filter((e) => e.employeeId === currentEmployeeId), [events, currentEmployeeId]);

  const todaySelfRecord = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    return selfEvents
      .filter((e) => {
        const key = dayjs(e.workDate || e.checkIn || e.checkOut).format("YYYY-MM-DD");
        return key === today;
      })
      .sort((a, b) => dayjs(b.checkIn || 0).valueOf() - dayjs(a.checkIn || 0).valueOf())[0];
  }, [selfEvents]);

  const attendanceState = useMemo(() => {
    if (todaySelfRecord?.status === "LEAVE") return "ON_LEAVE";
    if (!todaySelfRecord?.checkIn) return "NOT_CHECKED_IN";
    if (todaySelfRecord?.checkOut) return "CHECKED_OUT";
    return todaySelfRecord?.status === "ON_BREAK" ? "ON_BREAK" : "WORKING";
  }, [todaySelfRecord]);

  const handleAction = async (kind: "checkIn" | "breakOut" | "breakIn" | "checkOut") => {
    setActionLoading(true);
    try {
      if (kind === "checkIn") await checkIn();
      if (kind === "breakOut") await breakOut();
      if (kind === "breakIn") await breakIn();
      if (kind === "checkOut") {
        if (!todaySelfRecord?.id) {
          message.warning("No active attendance record");
          setActionLoading(false);
          return;
        }
        await checkOut(todaySelfRecord.id);
      }
      message.success("Action success");
      await fetchEvents();
    } catch (error: unknown) {
      message.error(getErrorMessage(error, "Action failed"));
    } finally {
      setActionLoading(false);
    }
  };

  const adminRows = useMemo<AdminRow[]>(() => {
    const rosterMap = new Map<string, { shift: string; team: string }>();
    for (const roster of rosters) {
      const month = String(roster?.month || "");
      if (!month || !roster?.employeeId) continue;
      rosterMap.set(`${roster.employeeId}:${month}`, {
        shift: roster?.shift?.name || "-",
        team: roster?.workGroup?.name || "-",
      });
    }

    const rows = events.map((e) => {
      const worked = Number(e.totalHoursDecimal ?? e.totalHours ?? 0);
      const workMonth = dayjs(e.workDate || e.checkIn || e.checkOut || new Date()).format("YYYY-MM");
      const rosterInfo = rosterMap.get(`${e.employeeId}:${workMonth}`);
      const lateMinutes = Number(e.lateMinutes ?? 0);
      const earlyLeaveMinutes = Number(e.earlyLeaveMinutes ?? 0);

      return {
        id: e.id,
        employeeId: e.employeeId,
        shiftDate: deriveShiftDate(e),
        employee: e.employee?.name || e.employeeId,
        team: rosterInfo?.team || "-",
        shift: rosterInfo?.shift || e.shift?.name || "-",
        scheduledStartTime: e.scheduledStartTime || "-",
        scheduledEndTime: e.scheduledEndTime || "-",
        checkIn: e.checkIn,
        checkOut: e.checkOut,
        lateMinutes,
        lateHours: Number(e.lateHours ?? lateMinutes / 60),
        earlyLeaveMinutes,
        earlyLeaveHours: Number(e.earlyLeaveHours ?? earlyLeaveMinutes / 60),
        worked,
        status: e.status || "-",
        anomalyList: Array.isArray(e.anomalyList) ? e.anomalyList : [],
        anomaly: Array.isArray(e.anomalyList) && e.anomalyList.length ? e.anomalyList.join(", ") : e.anomaly || "-",
        ruleSource: e.ruleSource || "-",
      };
    });

    const filteredByEmployee = employeeFilter ? rows.filter((row) => row.employeeId === employeeFilter) : rows;
    if (!shiftDateFilter) return filteredByEmployee;
    return filteredByEmployee.filter((row) => row.shiftDate === shiftDateFilter.format("YYYY-MM-DD"));
  }, [events, rosters, employeeFilter, shiftDateFilter]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      map.set(e.employeeId, e.employee?.name || e.employeeId);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [events]);

  const scenarioResult = useMemo(() => {
    if (!scenarioEmployeeId) return null;

    const targetDate = scenarioDate.format("YYYY-MM-DD");
    const record = events.find((e) => {
      const dateKey = dayjs(e.workDate || e.checkIn || e.checkOut || new Date()).format("YYYY-MM-DD");
      return e.employeeId === scenarioEmployeeId && dateKey === targetDate;
    });
    if (!record) return null;

    const month = scenarioDate.format("YYYY-MM");
    const roster = rosters.find((r) => r?.employeeId === scenarioEmployeeId && String(r?.month || "") === month);
    const shift = roster?.shift;

    const checkInAt = record.checkIn ? dayjs(record.checkIn) : null;
    const checkOutAt = record.checkOut ? dayjs(record.checkOut) : null;

    const toShiftDateTime = (base: dayjs.Dayjs, hhmm?: string, addDay?: boolean) => {
      if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(":").map(Number);
      let t = base.hour(h).minute(m).second(0).millisecond(0);
      if (addDay) t = t.add(1, "day");
      return t;
    };

    const scheduledStart = toShiftDateTime(scenarioDate, shift?.startTime);
    const scheduledEnd = toShiftDateTime(scenarioDate, shift?.endTime, Boolean(shift?.crossDay));

    const lateMinutes =
      checkInAt && scheduledStart ? Math.max(checkInAt.diff(scheduledStart, "minute"), 0) : 0;
    const earlyLeaveMinutes =
      checkOutAt && scheduledEnd ? Math.max(scheduledEnd.diff(checkOutAt, "minute"), 0) : 0;

    const timeline = Array.isArray(record.timeline) ? record.timeline : [];
    let breakOpenAt: dayjs.Dayjs | null = null;
    let breakMinutes = 0;
    for (const item of timeline) {
      if (item.type === "BREAK_OUT") {
        breakOpenAt = dayjs(item.at);
      }
      if (item.type === "BREAK_IN" && breakOpenAt) {
        breakMinutes += Math.max(dayjs(item.at).diff(breakOpenAt, "minute"), 0);
        breakOpenAt = null;
      }
    }
    if (breakOpenAt && checkOutAt) {
      breakMinutes += Math.max(checkOutAt.diff(breakOpenAt, "minute"), 0);
    }

    const lateRule = Number(shift?.lateAfter || 0);
    const earlyRule = Number(shift?.earlyLeave || 0);

    return {
      employeeName: record.employee?.name || scenarioEmployeeId,
      shiftName: shift?.name || "-",
      shiftWindow: shift?.startTime && shift?.endTime ? `${shift.startTime} - ${shift.endTime}${shift?.crossDay ? " (+1)" : ""}` : "-",
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      totalHours: Number(record.totalHoursDecimal ?? record.totalHours ?? 0),
      breakMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      isLate: lateMinutes > lateRule,
      isEarlyLeave: earlyLeaveMinutes > earlyRule,
      status: (record.anomalyList || []).includes("LATE") ? "LATE" : record.status || record.anomaly || "-",
    };
  }, [events, rosters, scenarioDate, scenarioEmployeeId]);

  const handleExportCsv = useCallback(() => {
    const headers = [
      "Shift Date",
      "Employee",
      "Team",
      "Shift",
      "Scheduled Time",
      "Actual Time",
      "Work Hours",
      "Status",
      "Late",
      "Early Leave",
      "Anomaly",
    ];

    const lines = adminRows.map((row) => {
      const scheduledTime = `${row.scheduledStartTime || "-"} → ${row.scheduledEndTime || "-"}`;
      const actualTime = `${toTime(row.checkIn)} → ${toTime(row.checkOut)}`;
      const workHours = toHourMinute(row.worked);
      const status = getStatusLabel(row.status, row.anomalyList);
      const late = row.lateMinutes > 0 ? `${row.lateMinutes} min (${row.lateHours.toFixed(2)} hr)` : "-";
      const earlyLeave = row.earlyLeaveMinutes > 0
        ? `${row.earlyLeaveMinutes} min (${row.earlyLeaveHours.toFixed(2)} hr)`
        : "-";
      const anomaly = (Array.isArray(row.anomalyList) && row.anomalyList.length
        ? row.anomalyList
        : typeof row.anomaly === "string" && row.anomaly !== "-"
          ? row.anomaly.split(",").map((item) => item.trim()).filter(Boolean)
          : []).join(" | ") || "-";

      return [
        row.shiftDate || "-",
        row.employee || "-",
        row.team || "-",
        row.shift || "-",
        scheduledTime,
        actualTime,
        workHours,
        status,
        late,
        earlyLeave,
        anomaly,
      ];
    });

    const csvContent = [headers, ...lines]
      .map((line) => line.map((cell) => toCsvCell(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance_export_${dayjs().format("YYYYMMDD_HHmmss")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    message.success(`CSV exported: ${adminRows.length} row(s)`);
  }, [adminRows]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <div>
            <Text strong style={{ fontSize: 18 }}>Attendance 打卡考勤</Text>
            <div><Text type="secondary">员工打卡与管理员考勤视图</Text></div>
          </div>
          <RangePicker
            value={range}
            onChange={(values) => {
              if (values && values[0] && values[1]) {
                setRange([values[0], values[1]]);
              }
            }}
          />
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="self"
        items={[
          {
            key: "self",
            label: "员工自助打卡",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="今日打卡操作">
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<LoginOutlined />}
                      disabled={attendanceState !== "NOT_CHECKED_IN"}
                      loading={actionLoading}
                      onClick={() => handleAction("checkIn")}
                    >
                      Check In
                    </Button>
                    <Button
                      icon={<CoffeeOutlined />}
                      disabled={attendanceState !== "WORKING"}
                      loading={actionLoading}
                      onClick={() => handleAction("breakOut")}
                    >
                      Break Out
                    </Button>
                    <Button
                      icon={<CoffeeOutlined />}
                      disabled={attendanceState !== "ON_BREAK"}
                      loading={actionLoading}
                      onClick={() => handleAction("breakIn")}
                    >
                      Break In
                    </Button>
                    <Button
                      danger
                      icon={<LogoutOutlined />}
                      disabled={attendanceState !== "WORKING"}
                      loading={actionLoading}
                      onClick={() => handleAction("checkOut")}
                    >
                      Check Out
                    </Button>
                    <Tag color={attendanceState === "ON_LEAVE" ? "gold" : "blue"}>State: {attendanceState}</Tag>
                  </Space>
                </Card>

                <Card title="今日记录">
                  {todaySelfRecord ? (
                    <Space direction="vertical" size={6}>
                      <Text>上班: {toDateTime(todaySelfRecord.checkIn)}</Text>
                      <Text>下班: {toDateTime(todaySelfRecord.checkOut)}</Text>
                      <Text>实际工时: {toHours(todaySelfRecord.totalHoursDecimal ?? todaySelfRecord.totalHours)} 小时</Text>
                      <Text>状态: {todaySelfRecord.status || todaySelfRecord.anomaly || "-"}</Text>
                    </Space>
                  ) : (
                    <Empty description="Today no attendance record" />
                  )}
                </Card>
              </Space>
            ),
          },
          {
            key: "admin",
            label: "管理员/HR 视图",
            children: (
              <Card title="员工出勤明细">
                <Space style={{ marginBottom: 12 }} wrap>
                  <DatePicker
                    allowClear
                    placeholder="Shift Date"
                    value={shiftDateFilter}
                    onChange={(value) => setShiftDateFilter(value || undefined)}
                  />
                  <Button onClick={() => setShiftDateFilter(resolveShiftDateToday())}>Today</Button>
                  <Button onClick={() => setShiftDateFilter(undefined)}>Clear / All</Button>
                  <Button type="primary" onClick={handleExportCsv}>Export CSV</Button>
                  <Select
                    allowClear
                    style={{ width: 260 }}
                    placeholder="筛选员工"
                    value={employeeFilter}
                    onChange={setEmployeeFilter}
                    options={employeeOptions}
                  />
                </Space>
                <Table<AdminRow>
                  rowKey="id"
                  loading={loading}
                  dataSource={adminRows}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "Shift Date", dataIndex: "shiftDate" },
                    { title: "员工", dataIndex: "employee" },
                    { title: "团队", dataIndex: "team" },
                    { title: "班次", dataIndex: "shift" },
                    {
                      title: "Scheduled Time",
                      render: (_, row) => `${row.scheduledStartTime || "-"} → ${row.scheduledEndTime || "-"}`,
                    },
                    {
                      title: "Actual Time",
                      render: (_, row) => `${toTime(row.checkIn)} → ${toTime(row.checkOut)}`,
                    },
                    { title: "实际工时", dataIndex: "worked", render: (v: number) => toHourMinute(v) },
                    {
                      title: "Status",
                      dataIndex: "status",
                      render: (v: string, row) => renderStatusBadge(v, row.anomalyList),
                    },
                    {
                      title: "Late",
                      dataIndex: "lateMinutes",
                      render: (_: number, row) => {
                        if (row.lateMinutes <= 0) return "-";
                        return (
                          <div style={{ lineHeight: 1.2 }}>
                            <div>{row.lateMinutes} min</div>
                            <div>({row.lateHours.toFixed(2)} hr)</div>
                          </div>
                        );
                      },
                    },
                    {
                      title: "Early Leave",
                      dataIndex: "earlyLeaveMinutes",
                      render: (_: number, row) => {
                        if (row.earlyLeaveMinutes <= 0) return "-";
                        return (
                          <div style={{ lineHeight: 1.2 }}>
                            <div>{row.earlyLeaveMinutes} min</div>
                            <div>({row.earlyLeaveHours.toFixed(2)} hr)</div>
                          </div>
                        );
                      },
                    },
                    {
                      title: "Anomaly",
                      dataIndex: "anomalyList",
                      render: (list: string[], row) => {
                        const tags = Array.isArray(list) && list.length
                          ? list
                          : typeof row.anomaly === "string" && row.anomaly !== "-"
                            ? row.anomaly.split(",").map((item) => item.trim()).filter(Boolean)
                            : [];
                        if (!tags.length) return "-";
                        return (
                          <Space size={4} wrap>
                            {tags.map((item) => {
                              const upper = item.toUpperCase();
                              const color = upper === "LATE" ? "orange" : upper === "EARLY_LEAVE" ? "yellow" : "default";
                              return <Tag key={`${row.id}-${item}`} color={color}>{upper}</Tag>;
                            })}
                          </Space>
                        );
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "flow-test",
            label: "全流程测试",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Night Shift 流程校验">
                  <Space wrap>
                    <Tag color="purple">Night Shift 20:00</Tag>
                    <Tag>Check In</Tag>
                    <Tag>Break Out</Tag>
                    <Tag>Break In</Tag>
                    <Tag>Check Out</Tag>
                    <Tag color="blue">Report</Tag>
                  </Space>

                  <Space wrap style={{ marginTop: 12 }}>
                    <Select
                      style={{ width: 260 }}
                      placeholder="选择员工"
                      value={scenarioEmployeeId}
                      onChange={setScenarioEmployeeId}
                      options={employeeOptions}
                    />
                    <DatePicker value={scenarioDate} onChange={(v) => setScenarioDate(v || dayjs())} />
                  </Space>
                </Card>

                <Card title="校验结果（工时 / 迟到 / 早退 / Break）">
                  {scenarioResult ? (
                    <Space direction="vertical" size={8}>
                      <Text>员工: {scenarioResult.employeeName}</Text>
                      <Text>班次: {scenarioResult.shiftName} ({scenarioResult.shiftWindow})</Text>
                      <Text>Check In: {toDateTime(scenarioResult.checkIn)}</Text>
                      <Text>Check Out: {toDateTime(scenarioResult.checkOut)}</Text>
                      <Text>工时: {toHours(scenarioResult.totalHours)} 小时</Text>
                      <Text>Break 时间: {scenarioResult.breakMinutes} 分钟</Text>
                      <Text>迟到: {scenarioResult.lateMinutes} 分钟 {scenarioResult.isLate ? <Tag color="orange">LATE</Tag> : <Tag color="green">OK</Tag>}</Text>
                      <Text>早退: {scenarioResult.earlyLeaveMinutes} 分钟 {scenarioResult.isEarlyLeave ? <Tag color="red">EARLY_LEAVE</Tag> : <Tag color="green">OK</Tag>}</Text>
                      <Text>最终状态: <Tag>{scenarioResult.status}</Tag></Text>
                    </Space>
                  ) : (
                    <Empty description="选定员工/日期暂无可校验打卡数据" />
                  )}
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
}
