import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Calendar,
  Card,
  DatePicker,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { CalendarProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";

import { getAttendanceEvents } from "../../api/attendance";
import { getRosters } from "../../api/rosters";
import { getCurrentUser } from "../../utils/auth";

const { Text } = Typography;
const { RangePicker } = DatePicker;

const ATTENDANCE_TABS = [
  { key: "records", label: "Clock In / Out Records", path: "/attendance/records" },
  { key: "calendar", label: "Attendance Calendar", path: "/attendance/calendar" },
  { key: "report", label: "Work Hours Report", path: "/attendance/work-hours" },
  { key: "summary", label: "Attendance Summary", path: "/attendance/summary" },
] as const;

type AttendanceViewKey = (typeof ATTENDANCE_TABS)[number]["key"];

type AttendanceEvent = {
  id: string;
  employeeId: string;
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
  employee?: { id: string; name?: string; employeeNo?: string; department?: { name?: string } | null };
  shift?: { id: string; name?: string; startTime?: string | null; endTime?: string | null; crossDay?: boolean };
};

type RosterRecord = {
  employeeId?: string;
  month?: string;
  shift?: { name?: string; startTime?: string; endTime?: string; crossDay?: boolean; breakMinutes?: number };
  workGroup?: { name?: string };
};

type AttendanceRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  team: string;
  shift: string;
  shiftDate: string;
  checkIn: string | null;
  checkOut: string | null;
  scheduledStartTime: string;
  scheduledEndTime: string;
  breakMinutes: number;
  workHours: number;
  otHours: number;
  lateMinutes: number;
  lateHours: number;
  earlyLeaveMinutes: number;
  earlyLeaveHours: number;
  status: string;
  anomalyList: string[];
  anomaly: string;
};

type SummaryRow = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  team: string;
  present: number;
  late: number;
  leave: number;
  absent: number;
  otHours: number;
  workHours: number;
};

type ApiError = {
  response?: { data?: { message?: string } };
  message?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error) {
    const typedError = error as ApiError;
    return typedError.response?.data?.message || typedError.message || fallback;
  }
  return fallback;
}

function toDateTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function toTime(value?: string | null) {
  return value ? dayjs(value).format("HH:mm") : "-";
}

function toHours(value?: number | null) {
  return Number(value ?? 0).toFixed(2);
}

function formatDurationHours(value?: number | null) {
  return `${toHours(value)} hr`;
}

function formatMinutesHours(value?: number | null) {
  const minutes = Math.max(0, Math.round(Number(value ?? 0)));
  return `${minutes} min / ${(minutes / 60).toFixed(2)} hr`;
}

function toCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function sanitizeFilePart(value: string) {
  return value.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
}

function getDayKey(value?: string) {
  if (!value) return "-";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "-";
}

function getStatusColor(status: string, anomalyList: string[]) {
  const upper = `${status} ${anomalyList.join(" ")}`.toUpperCase();
  if (upper.includes("ABSENT")) return "red";
  if (upper.includes("EARLY_LEAVE")) return "volcano";
  if (upper.includes("LEAVE")) return "blue";
  if (upper.includes("LATE")) return "orange";
  if (upper.includes("PRESENT")) return "green";
  if (upper.includes("HOLIDAY")) return "gold";
  return "default";
}

function getStatusLabel(status: string, anomalyList: string[]) {
  const upper = `${status} ${anomalyList.join(" ")}`.toUpperCase();
  if (upper.includes("ABSENT")) return "Absent";
  if (upper.includes("EARLY_LEAVE")) return "Early Leave";
  if (upper.includes("LEAVE")) return "Leave";
  if (upper.includes("LATE")) return "Late";
  if (upper.includes("PRESENT")) return "Present";
  if (upper.includes("HOLIDAY")) return "Holiday";
  return status || "-";
}

function getViewFromPath(pathname: string): AttendanceViewKey {
  if (pathname.startsWith("/attendance/calendar")) return "calendar";
  if (pathname.startsWith("/attendance/report") || pathname.startsWith("/attendance/work-hours")) return "report";
  if (pathname.startsWith("/attendance/summary")) return "summary";
  return "records";
}

function isEmployeeSelfView(userRole?: string | null, employeeId?: string | null) {
  return (userRole || "").toUpperCase() === "EMPLOYEE" && Boolean(employeeId);
}

function deriveWorkDate(event: AttendanceEvent) {
  return getDayKey(event.workDate || event.date || event.checkIn || event.checkOut);
}

function timelineBreakMinutes(timeline?: Array<{ type: string; at: string }>) {
  if (!Array.isArray(timeline) || timeline.length === 0) return 0;

  let breakStartedAt: Dayjs | null = null;
  let minutes = 0;

  for (const item of timeline) {
    if (item.type === "BREAK_OUT") {
      breakStartedAt = dayjs(item.at);
      continue;
    }

    if (item.type === "BREAK_IN" && breakStartedAt) {
      minutes += Math.max(dayjs(item.at).diff(breakStartedAt, "minute"), 0);
      breakStartedAt = null;
    }
  }

  return minutes;
}

function computeScheduledMinutes(startTime?: string | null, endTime?: string | null, crossDay?: boolean) {
  if (!startTime || !endTime || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return 0;
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = dayjs().hour(startHour).minute(startMinute).second(0).millisecond(0);
  let end = dayjs().hour(endHour).minute(endMinute).second(0).millisecond(0);
  if (crossDay || end.isBefore(start) || end.isSame(start)) {
    end = end.add(1, "day");
  }
  return Math.max(end.diff(start, "minute"), 0);
}

function exportCsv(filename: string, headers: string[], lines: string[][]) {
  const csvContent = [headers, ...lines].map((line) => line.map((cell) => toCsvCell(cell)).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function Attendance() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const currentEmployeeId = localStorage.getItem("employee_id") || currentUser?.employeeId || "";
  const currentCompanyId = localStorage.getItem("company_id") || currentUser?.companyId || undefined;
  const selfOnly = isEmployeeSelfView(currentUser?.role, currentEmployeeId);

  const activeView = useMemo(() => getViewFromPath(location.pathname), [location.pathname]);

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [rosters, setRosters] = useState<RosterRecord[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string | undefined>(undefined);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [recordsRange, setRecordsRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs().endOf("day")]);
  const [reportRange, setReportRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs().endOf("day")]);
  const [summaryRange, setSummaryRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs().endOf("day")]);
  const [calendarMonth, setCalendarMonth] = useState<Dayjs>(dayjs().startOf("month"));

  useEffect(() => {
    if (selfOnly && currentEmployeeId) {
      setEmployeeFilter(currentEmployeeId);
    }
  }, [currentEmployeeId, selfOnly]);

  const viewRange = useMemo(() => {
    if (activeView === "calendar") return [calendarMonth.startOf("month"), calendarMonth.endOf("month")] as [Dayjs, Dayjs];
    if (activeView === "report") return reportRange;
    if (activeView === "summary") return summaryRange;
    return recordsRange;
  }, [activeView, calendarMonth, recordsRange, reportRange, summaryRange]);

  const effectiveEmployeeId = selfOnly ? currentEmployeeId || undefined : employeeFilter;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attendanceRes, rosterRes] = await Promise.all([
        getAttendanceEvents({
          startDate: viewRange[0].startOf("day").toISOString(),
          endDate: viewRange[1].endOf("day").toISOString(),
          employeeId: effectiveEmployeeId,
        }),
        getRosters({
          companyId: currentCompanyId,
          startDate: viewRange[0].startOf("day").toISOString(),
          endDate: viewRange[1].endOf("day").toISOString(),
          employeeId: effectiveEmployeeId,
        }),
      ]);

      setEvents(Array.isArray(attendanceRes.data?.events) ? attendanceRes.data.events : []);
      setRosters(Array.isArray(rosterRes.data) ? rosterRes.data : []);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, "Failed to load attendance"));
      setEvents([]);
      setRosters([]);
    } finally {
      setLoading(false);
    }
  }, [currentCompanyId, effectiveEmployeeId, viewRange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const rosterLookup = useMemo(() => {
    const map = new Map<string, RosterRecord>();
    for (const roster of rosters) {
      if (!roster.employeeId || !roster.month) continue;
      map.set(`${roster.employeeId}:${roster.month}`, roster);
    }
    return map;
  }, [rosters]);

  const rows = useMemo<AttendanceRow[]>(() => {
    return events
      .map((event) => {
        const shiftDate = deriveWorkDate(event);
        const monthKey = shiftDate !== "-" ? dayjs(shiftDate).format("YYYY-MM") : viewRange[0].format("YYYY-MM");
        const roster = rosterLookup.get(`${event.employeeId}:${monthKey}`);
        const workHours = Number(event.totalHoursDecimal ?? event.totalHours ?? 0);
        const breakMinutes = timelineBreakMinutes(event.timeline);
        const scheduledMinutes = computeScheduledMinutes(
          roster?.shift?.startTime || event.scheduledStartTime,
          roster?.shift?.endTime || event.scheduledEndTime,
          roster?.shift?.crossDay || event.shift?.crossDay,
        );
        const otHours = Math.max(workHours - scheduledMinutes / 60, 0);
        const lateMinutes = Number(event.lateMinutes ?? 0);
        const earlyLeaveMinutes = Number(event.earlyLeaveMinutes ?? 0);
        const anomalyList = Array.isArray(event.anomalyList) ? event.anomalyList : [];

        return {
          id: event.id,
          employeeId: event.employeeId,
          employeeName: event.employee?.name || event.employee?.employeeNo || event.employeeId,
          employeeNo: event.employee?.employeeNo || "-",
          team: roster?.workGroup?.name || event.employee?.department?.name || "-",
          shift: roster?.shift?.name || event.shift?.name || "-",
          shiftDate,
          checkIn: event.checkIn || null,
          checkOut: event.checkOut || null,
          scheduledStartTime: roster?.shift?.startTime || event.scheduledStartTime || "-",
          scheduledEndTime: roster?.shift?.endTime || event.scheduledEndTime || "-",
          breakMinutes,
          workHours,
          otHours,
          lateMinutes,
          lateHours: Number(event.lateHours ?? lateMinutes / 60),
          earlyLeaveMinutes,
          earlyLeaveHours: Number(event.earlyLeaveHours ?? earlyLeaveMinutes / 60),
          status: event.status || "-",
          anomalyList,
          anomaly: anomalyList.length ? anomalyList.join(", ") : event.anomaly || "-",
        };
      })
      .sort((left, right) => dayjs(right.shiftDate).valueOf() - dayjs(left.shiftDate).valueOf());
  }, [events, rosterLookup, viewRange]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (teamFilter && row.team !== teamFilter) return false;
      if (effectiveEmployeeId && row.employeeId !== effectiveEmployeeId) return false;
      if (keyword && ![row.shiftDate, row.employeeName, row.employeeNo, row.team, row.shift, row.status, row.anomaly].some((value) => String(value || "").toLowerCase().includes(keyword))) {
        return false;
      }
      return true;
    });
  }, [effectiveEmployeeId, rows, searchText, teamFilter]);

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const map = new Map<string, SummaryRow>();
    for (const row of visibleRows) {
      const current = map.get(row.employeeId) || {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeeNo: row.employeeNo,
        team: row.team,
        present: 0,
        late: 0,
        leave: 0,
        absent: 0,
        otHours: 0,
        workHours: 0,
      };

      const status = row.status.toUpperCase();
      if (status === "PRESENT") current.present += 1;
      if (row.lateMinutes > 0 || row.anomalyList.includes("LATE")) current.late += 1;
      if (status === "LEAVE" || row.anomalyList.includes("LEAVE")) current.leave += 1;
      if (status === "ABSENT" || status === "MISSING" || row.anomalyList.some((item) => item.includes("MISSING"))) current.absent += 1;
      current.workHours = Number((current.workHours + row.workHours).toFixed(2));
      current.otHours = Number((current.otHours + row.otHours).toFixed(2));
      map.set(row.employeeId, current);
    }

    return Array.from(map.values()).sort((left, right) => left.employeeName.localeCompare(right.employeeName));
  }, [visibleRows]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.employeeId, row.employeeName);
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

  const teamOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.team).filter((team) => team && team !== "-")))
      .sort()
      .map((value) => ({ value, label: value }));
  }, [rows]);

  const calendarBuckets = useMemo(() => {
    const map = new Map<string, AttendanceRow[]>();
    for (const row of visibleRows) {
      const bucket = map.get(row.shiftDate) || [];
      bucket.push(row);
      map.set(row.shiftDate, bucket);
    }
    return map;
  }, [visibleRows]);

  const calendarRows = useMemo(() => {
    return visibleRows.filter((row) => row.shiftDate.startsWith(calendarMonth.format("YYYY-MM")));
  }, [calendarMonth, visibleRows]);

  const kpis = useMemo(() => {
    const present = visibleRows.filter((row) => row.status.toUpperCase() === "PRESENT").length;
    const late = visibleRows.filter((row) => row.lateMinutes > 0 || row.anomalyList.includes("LATE")).length;
    const leave = visibleRows.filter((row) => row.status.toUpperCase() === "LEAVE" || row.anomalyList.includes("LEAVE")).length;
    const absent = visibleRows.filter((row) => row.status.toUpperCase() === "ABSENT" || row.status.toUpperCase() === "MISSING" || row.anomalyList.some((item) => item.includes("MISSING"))).length;
    const otHours = visibleRows.reduce((sum, row) => sum + row.otHours, 0);
    const workHours = visibleRows.reduce((sum, row) => sum + row.workHours, 0);
    return { present, late, leave, absent, otHours, workHours };
  }, [visibleRows]);

  const handleTabChange = (key: string) => {
    const target = ATTENDANCE_TABS.find((item) => item.key === key);
    if (target) navigate(target.path);
  };

  const exportRows = useCallback(
    (scope: AttendanceViewKey) => {
      const source = scope === "summary" ? summaryRows : visibleRows;
      const headers =
        scope === "summary"
          ? ["Employee", "Employee No.", "Team", "Present", "Late", "Leave", "Absent", "OT Hours", "Work Hours"]
          : scope === "report"
            ? ["Date", "Employee", "Team", "Shift", "Work Hours", "OT Hours", "Break Time", "Late", "Early Leave", "Status"]
            : ["Date", "Employee", "Team", "Shift", "Check In", "Check Out", "Break Time", "Work Hours", "Late", "Early Leave", "Status"];

      const lines = source.map((row: AttendanceRow | SummaryRow) => {
        if (scope === "summary") {
          const current = row as SummaryRow;
          return [
            current.employeeName,
            current.employeeNo,
            current.team,
            String(current.present),
            String(current.late),
            String(current.leave),
            String(current.absent),
            toHours(current.otHours),
            toHours(current.workHours),
          ];
        }

        const current = row as AttendanceRow;
        if (scope === "report") {
          return [
            current.shiftDate,
            current.employeeName,
            current.team,
            current.shift,
            formatDurationHours(current.workHours),
            formatDurationHours(current.otHours),
            formatMinutesHours(current.breakMinutes),
            current.lateMinutes > 0 ? formatMinutesHours(current.lateMinutes) : "-",
            current.earlyLeaveMinutes > 0 ? formatMinutesHours(current.earlyLeaveMinutes) : "-",
            getStatusLabel(current.status, current.anomalyList),
          ];
        }

        return [
          current.shiftDate,
          current.employeeName,
          current.team,
          current.shift,
          toDateTime(current.checkIn),
          toDateTime(current.checkOut),
          formatMinutesHours(current.breakMinutes),
          formatDurationHours(current.workHours),
          current.lateMinutes > 0 ? formatMinutesHours(current.lateMinutes) : "-",
          current.earlyLeaveMinutes > 0 ? formatMinutesHours(current.earlyLeaveMinutes) : "-",
          getStatusLabel(current.status, current.anomalyList),
        ];
      });

      const csvContent = [headers, ...lines].map((line) => line.map((cell) => toCsvCell(String(cell ?? ""))).join(",")).join("\n");
      const rangeLabel = `${viewRange[0].format("YYYY-MM-DD")}_${viewRange[1].format("YYYY-MM-DD")}`;
      const fileName = `XTTEN_Attendance_${scope}_${sanitizeFilePart(rangeLabel)}_${dayjs().format("YYYY-MM-DD-HHmm")}.csv`;
      const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      message.success(`CSV exported: ${source.length} row(s)`);
    },
    [summaryRows, visibleRows, viewRange],
  );

  const activeTabKey = activeView;
  const canSeeFilters = !selfOnly;

  const recordsColumns = [
    { title: "Date", dataIndex: "shiftDate" },
    { title: "Team", dataIndex: "team" },
    { title: "Employee", dataIndex: "employeeName" },
    { title: "Shift", dataIndex: "shift" },
    { title: "Check In", render: (_: unknown, row: AttendanceRow) => toDateTime(row.checkIn) },
    { title: "Check Out", render: (_: unknown, row: AttendanceRow) => toDateTime(row.checkOut) },
    { title: "Break", render: (_: unknown, row: AttendanceRow) => formatMinutesHours(row.breakMinutes) },
    { title: "Work Hours", render: (_: unknown, row: AttendanceRow) => formatDurationHours(row.workHours) },
    { title: "Late", render: (_: unknown, row: AttendanceRow) => (row.lateMinutes > 0 ? formatMinutesHours(row.lateMinutes) : "-") },
    { title: "Early Leave", render: (_: unknown, row: AttendanceRow) => (row.earlyLeaveMinutes > 0 ? formatMinutesHours(row.earlyLeaveMinutes) : "-") },
    { title: "Status", render: (_: unknown, row: AttendanceRow) => <Badge color={getStatusColor(row.status, row.anomalyList)} text={getStatusLabel(row.status, row.anomalyList)} /> },
  ];

  const reportColumns = [
    { title: "Date", dataIndex: "shiftDate" },
    { title: "Team", dataIndex: "team" },
    { title: "Employee", dataIndex: "employeeName" },
    { title: "Shift", dataIndex: "shift" },
    { title: "Work Hours", render: (_: unknown, row: AttendanceRow) => formatDurationHours(row.workHours) },
    { title: "OT Hours", render: (_: unknown, row: AttendanceRow) => formatDurationHours(row.otHours) },
    { title: "Break Time", render: (_: unknown, row: AttendanceRow) => formatMinutesHours(row.breakMinutes) },
    { title: "Late", render: (_: unknown, row: AttendanceRow) => (row.lateMinutes > 0 ? formatMinutesHours(row.lateMinutes) : "-") },
    { title: "Early Leave", render: (_: unknown, row: AttendanceRow) => (row.earlyLeaveMinutes > 0 ? formatMinutesHours(row.earlyLeaveMinutes) : "-") },
    { title: "Status", render: (_: unknown, row: AttendanceRow) => getStatusLabel(row.status, row.anomalyList) },
  ];

  const summaryColumns = [
    { title: "Employee", dataIndex: "employeeName" },
    { title: "Employee No.", dataIndex: "employeeNo" },
    { title: "Team", dataIndex: "team" },
    { title: "Present", dataIndex: "present" },
    { title: "Late", dataIndex: "late" },
    { title: "Leave", dataIndex: "leave" },
    { title: "Absent", dataIndex: "absent" },
    { title: "OT Hours", render: (_: unknown, row: SummaryRow) => formatDurationHours(row.otHours) },
    { title: "Work Hours", render: (_: unknown, row: SummaryRow) => formatDurationHours(row.workHours) },
  ];

  const calendarCellRender: CalendarProps<Dayjs>["cellRender"] = (current, info) => {
    if (info.type !== "date") return info.originNode;

    const key = current.format("YYYY-MM-DD");
    const dayRows = calendarBuckets.get(key) || [];
    if (dayRows.length === 0) {
      return <div style={{ minHeight: 72, opacity: 0.35 }} />;
    }

    return (
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Text strong style={{ fontSize: 12 }}>{dayRows.length} record(s)</Text>
        <Space size={4} wrap>
          {dayRows.some((row) => row.status.toUpperCase() === "PRESENT") && <Tag color="green">Present</Tag>}
          {dayRows.some((row) => row.lateMinutes > 0 || row.anomalyList.includes("LATE")) && <Tag color="orange">Late</Tag>}
          {dayRows.some((row) => row.status.toUpperCase() === "LEAVE" || row.anomalyList.includes("LEAVE")) && <Tag color="blue">Leave</Tag>}
          {dayRows.some((row) => row.status.toUpperCase() === "ABSENT" || row.status.toUpperCase() === "MISSING") && <Tag color="red">Absent</Tag>}
        </Space>
        {dayRows.slice(0, 2).map((row) => (
          <div key={row.id} style={{ fontSize: 11, lineHeight: 1.4 }}>
            {row.employeeName} · {row.team}
          </div>
        ))}
      </Space>
    );
  };

  const filterBar = (
    <Space wrap>
      {activeView !== "calendar" && (
        <RangePicker
          value={activeView === "report" ? reportRange : activeView === "summary" ? summaryRange : recordsRange}
          onChange={(values) => {
            if (!values || !values[0] || !values[1]) return;
            if (activeView === "report") setReportRange([values[0], values[1]]);
            else if (activeView === "summary") setSummaryRange([values[0], values[1]]);
            else setRecordsRange([values[0], values[1]]);
          }}
        />
      )}
      {activeView === "calendar" && (
        <DatePicker picker="month" value={calendarMonth} onChange={(value) => value && setCalendarMonth(value)} />
      )}
      {canSeeFilters && (
        <>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="Team"
            value={teamFilter}
            onChange={setTeamFilter}
            options={teamOptions}
            showSearch
            optionFilterProp="label"
          />
          <Select
            allowClear
            style={{ width: 260 }}
            placeholder="Employee"
            value={employeeFilter}
            onChange={setEmployeeFilter}
            options={employeeOptions}
            showSearch
            optionFilterProp="label"
          />
        </>
      )}
      <Input
        allowClear
        style={{ width: 260 }}
        placeholder="Search employee / team / status"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />
      <Button
        onClick={() => {
          setEmployeeFilter(selfOnly ? currentEmployeeId || undefined : undefined);
          setTeamFilter(undefined);
          setSearchText("");
          setRecordsRange([dayjs().startOf("month"), dayjs().endOf("day")]);
          setReportRange([dayjs().startOf("month"), dayjs().endOf("day")]);
          setSummaryRange([dayjs().startOf("month"), dayjs().endOf("day")]);
          setCalendarMonth(dayjs().startOf("month"));
        }}
      >
        Reset
      </Button>
      <Button type="primary" onClick={() => exportRows(activeView === "calendar" ? "records" : activeView)}>
        Export
      </Button>
      <Button onClick={() => void fetchData()}>Refresh</Button>
    </Space>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <div>
            <Text strong style={{ fontSize: 18 }}>Attendance</Text>
            <div><Text type="secondary">Read-only attendance views. Web punch has been removed from the browser.</Text></div>
          </div>
          <Space wrap>
            <Tag color="green">Present {kpis.present}</Tag>
            <Tag color="orange">Late {kpis.late}</Tag>
            <Tag color="blue">Leave {kpis.leave}</Tag>
            <Tag color="red">Absent {kpis.absent}</Tag>
            <Tag color="purple">OT {kpis.otHours.toFixed(2)} h</Tag>
            <Tag color="geekblue">Work {kpis.workHours.toFixed(2)} h</Tag>
          </Space>
        </Space>
      </Card>

      <Tabs activeKey={activeTabKey} onChange={handleTabChange} items={ATTENDANCE_TABS.map((item) => ({ key: item.path, label: item.label }))} />

      {(activeView === "records" || activeView === "report" || activeView === "summary") && (
        <Card>
          <Space wrap>{filterBar}</Space>
        </Card>
      )}

      {activeView === "calendar" && (
        <Card>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space wrap>{filterBar}</Space>
            <Calendar value={calendarMonth} cellRender={calendarCellRender} onPanelChange={(value) => setCalendarMonth(value.startOf("month"))} />
            {calendarRows.length === 0 && <Empty description="No attendance records for the selected month" />}
          </Space>
        </Card>
      )}

      {activeView === "records" && (
        <Card title="Clock In / Out Records">
          <Table<AttendanceRow> rowKey="id" loading={loading} dataSource={visibleRows} pagination={{ pageSize: 10 }} columns={recordsColumns as never} />
        </Card>
      )}

      {activeView === "report" && (
        <Card title="Work Hours Report">
          <Table<AttendanceRow> rowKey="id" loading={loading} dataSource={visibleRows} pagination={{ pageSize: 10 }} columns={reportColumns as never} />
        </Card>
      )}

      {activeView === "summary" && (
        <>
          <Space wrap size={16}>
            <Card style={{ minWidth: 160 }}><Text type="secondary">Present</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.present}</div></Card>
            <Card style={{ minWidth: 160 }}><Text type="secondary">Late</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.late}</div></Card>
            <Card style={{ minWidth: 160 }}><Text type="secondary">Leave</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.leave}</div></Card>
            <Card style={{ minWidth: 160 }}><Text type="secondary">Absent</Text><div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.absent}</div></Card>
          </Space>
          <Card title="Attendance Summary">
            <Table<SummaryRow> rowKey="employeeId" loading={loading} dataSource={summaryRows} pagination={{ pageSize: 10 }} columns={summaryColumns as never} locale={{ emptyText: <Empty description="No attendance summary found" /> }} />
          </Card>
        </>
      )}
    </Space>
  );
}
