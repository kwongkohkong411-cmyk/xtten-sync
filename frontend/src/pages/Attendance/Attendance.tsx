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

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
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
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
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

  const allAdminRows = useMemo<AdminRow[]>(() => {
    const rosterMap = new Map<string, { shift: string; team: string }>();
    for (const roster of rosters) {
      const month = String(roster?.month || "");
      if (!month || !roster?.employeeId) continue;
      rosterMap.set(`${roster.employeeId}:${month}`, {
        shift: roster?.shift?.name || "-",
        team: roster?.workGroup?.name || "-",
      });
    }

    return events.map((e) => {
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
  }, [events, rosters]);

  const adminRows = useMemo<AdminRow[]>(() => {
    const filteredByEmployee = employeeFilter
      ? allAdminRows.filter((row) => row.employeeId === employeeFilter)
      : allAdminRows;

    const filteredByTeam = teamFilter
      ? filteredByEmployee.filter((row) => row.team === teamFilter)
      : filteredByEmployee;

    if (!shiftDateFilter) return filteredByTeam;
    return filteredByTeam.filter((row) => row.shiftDate === shiftDateFilter.format("YYYY-MM-DD"));
  }, [allAdminRows, employeeFilter, teamFilter, shiftDateFilter]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allAdminRows) {
      map.set(row.employeeId, row.employee || row.employeeId);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [allAdminRows]);

  const teamOptions = useMemo(() => {
    const teams = Array.from(new Set(allAdminRows.map((row) => row.team).filter((team) => team && team !== "-")));
    return teams.map((team) => ({ value: team, label: team }));
  }, [allAdminRows]);

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

  const attendanceKpi = useMemo(() => {
    const statuses = adminRows.map((row) => String(row.status || '').toUpperCase());
    const present = statuses.filter((status) => status === 'PRESENT').length;
    const late = statuses.filter((status) => status === 'LATE').length;
    const absent = statuses.filter((status) => status === 'ABSENT' || status === 'MISSING').length;
    const onLeave = statuses.filter((status) => status === 'LEAVE').length;
    return { present, late, absent, onLeave };
  }, [adminRows]);

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

    const shiftDatePart = shiftDateFilter ? shiftDateFilter.format("YYYY-MM-DD") : "All";
    const employeeLabel = employeeFilter
      ? employeeOptions.find((option) => option.value === employeeFilter)?.label || employeeFilter
      : undefined;
    const filterParts: string[] = [];
    if (teamFilter) filterParts.push(`Team-${sanitizeFilePart(teamFilter)}`);
    if (employeeLabel) filterParts.push(`Employee-${sanitizeFilePart(employeeLabel)}`);
    const filterPart = filterParts.length ? filterParts.join("_") : "All";
    const exportTimePart = dayjs().format("YYYY-MM-DD-HHmm");
    const fileName = shiftDatePart === "All" && filterPart === "All"
      ? `XTTEN_Attendance_All_${exportTimePart}.csv`
      : `XTTEN_Attendance_${shiftDatePart}_${filterPart}_${exportTimePart}.csv`;

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    message.success(`CSV exported: ${adminRows.length} row(s)`);
  }, [adminRows, employeeFilter, employeeOptions, shiftDateFilter, teamFilter]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <div>
            <Text strong style={{ fontSize: 18 }}>Attendance</Text>
            <div><Text type="secondary">Employee check-in and admin attendance view</Text></div>
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

      <Space style={{ width: '100%' }} size={16} wrap>
        <Card style={{ minWidth: 180 }}><Text type="secondary">Present</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{attendanceKpi.present}</div></Card>
        <Card style={{ minWidth: 180 }}><Text type="secondary">Late</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{attendanceKpi.late}</div></Card>
        <Card style={{ minWidth: 180 }}><Text type="secondary">Absent</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{attendanceKpi.absent}</div></Card>
        <Card style={{ minWidth: 180 }}><Text type="secondary">On Leave</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{attendanceKpi.onLeave}</div></Card>
      </Space>

      <Tabs
        defaultActiveKey="self"
        items={[
          {
            key: "self",
            label: "Employee Attendance",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Today's Attendance Actions">
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

                <Card title="Today's Record">
                  {todaySelfRecord ? (
                    <Space direction="vertical" size={6}>
                      <Text>Check In: {toDateTime(todaySelfRecord.checkIn)}</Text>
                      <Text>Check Out: {toDateTime(todaySelfRecord.checkOut)}</Text>
                      <Text>Worked Hours: {toHours(todaySelfRecord.totalHoursDecimal ?? todaySelfRecord.totalHours)} hrs</Text>
                      <Text>Status: {todaySelfRecord.status || todaySelfRecord.anomaly || "-"}</Text>
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
            label: "Admin / HR View",
            children: (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <Space style={{ marginBottom: 0 }} wrap>
                    <DatePicker
                      allowClear
                      placeholder="Date"
                      value={shiftDateFilter}
                      onChange={(value) => setShiftDateFilter(value || undefined)}
                    />
                    <Button onClick={() => setShiftDateFilter(resolveShiftDateToday())}>Today</Button>
                    <Button onClick={() => setShiftDateFilter(undefined)}>Clear / All</Button>
                    <Select
                      allowClear
                      style={{ width: 220 }}
                      placeholder="Team"
                      value={teamFilter}
                      onChange={setTeamFilter}
                      options={teamOptions}
                    />
                    <Select
                      allowClear
                      style={{ width: 260 }}
                      placeholder="Employee"
                      value={employeeFilter}
                      onChange={setEmployeeFilter}
                      options={employeeOptions}
                    />
                    <Button type="primary" onClick={handleExportCsv}>Export CSV</Button>
                  </Space>
                </Card>

                <Card title="Attendance Records">
                <Space style={{ marginBottom: 12 }} wrap>
                  <Text type="secondary">Timeline is available in the detailed records below.</Text>
                </Space>
                <Table<AdminRow>
                  rowKey="id"
                  loading={loading}
                  dataSource={adminRows}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "Shift Date", dataIndex: "shiftDate" },
                    { title: "Employee", dataIndex: "employee" },
                    { title: "Team", dataIndex: "team" },
                    { title: "Shift", dataIndex: "shift" },
                    {
                      title: "Scheduled Time",
                      render: (_, row) => `${row.scheduledStartTime || "-"} → ${row.scheduledEndTime || "-"}`,
                    },
                    {
                      title: "Actual Time",
                      render: (_, row) => `${toTime(row.checkIn)} → ${toTime(row.checkOut)}`,
                    },
                    { title: "Worked Hours", dataIndex: "worked", render: (v: number) => toHourMinute(v) },
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
              </>
            ),
          },
        ]}
      />

      <Card title="Attendance Scenario" style={{ display: 'none' }}>
        {scenarioResult ? (
          <Space direction="vertical" size={8}>
            <Text>Employee: {scenarioResult.employeeName}</Text>
            <Text>Shift: {scenarioResult.shiftName} ({scenarioResult.shiftWindow})</Text>
            <Text>Check In: {toDateTime(scenarioResult.checkIn)}</Text>
            <Text>Check Out: {toDateTime(scenarioResult.checkOut)}</Text>
            <Text>Hours: {toHours(scenarioResult.totalHours)} hrs</Text>
            <Text>Break Duration: {scenarioResult.breakMinutes} min</Text>
            <Text>Late: {scenarioResult.lateMinutes} min {scenarioResult.isLate ? <Tag color="orange">LATE</Tag> : <Tag color="green">OK</Tag>}</Text>
            <Text>Early Leave: {scenarioResult.earlyLeaveMinutes} min {scenarioResult.isEarlyLeave ? <Tag color="red">EARLY_LEAVE</Tag> : <Tag color="green">OK</Tag>}</Text>
            <Text>Final Status: <Tag>{scenarioResult.status}</Tag></Text>
          </Space>
        ) : (
          <Empty description="No valid attendance data for selected employee/date" />
        )}
      </Card>
    </Space>
  );
}
