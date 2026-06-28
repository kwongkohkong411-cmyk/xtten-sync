import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Image,
  Input,
  Popover,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AimOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ExpandOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getDailySessions,
  getLiveActivity,
  getProductivitySummary,
  getScreenshots,
  type ActivityViewType,
} from "../../api/activity";
import { API_BASE_URL } from "../../api/client";

const { Title, Text } = Typography;

type Props = {
  view?: ActivityViewType;
};

function toAbsoluteScreenshotUrl(urlValue: unknown) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

function secToDuration(sec?: number) {
  const total = Math.max(0, Number(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type ScreenshotStatus = "online" | "idle" | "offline";

function calcActivityScore(row: any) {
  const explicit = Number(row?.metadata?.activityPercent ?? row?.activityPercent);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.min(100, Math.round(explicit));

  const keyboard = Number(row?.keyboardCount || row?.metadata?.keyboardCount || 0);
  const mouse = Number(row?.mouseCount || row?.metadata?.mouseCount || 0);
  return Math.min(100, Math.round((keyboard + mouse) / 3));
}

function calcScreenshotStatus(row: any, selectedDate: dayjs.Dayjs): ScreenshotStatus {
  const idleSec = Number(row?.idleSec || row?.metadata?.idleSec || 0);
  const isAfk = Boolean(row?.isAfk || row?.metadata?.isAfk);
  if (isAfk || idleSec >= 120) return "idle";

  const capturedAt = dayjs(row?.capturedAt);
  if (selectedDate.isSame(dayjs(), "day") && capturedAt.isValid()) {
    const ageSec = Math.max(0, dayjs().diff(capturedAt, "second"));
    if (ageSec <= 180) return "online";
    if (ageSec <= 900) return "idle";
    return "offline";
  }

  return "online";
}

function statusTag(status: ScreenshotStatus) {
  if (status === "online") return <Tag color="green">Online</Tag>;
  if (status === "idle") return <Tag color="gold">Idle</Tag>;
  return <Tag color="red">Offline</Tag>;
}

export default function ActivityMonitoring({ view }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(dayjs());
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();
  const [payload, setPayload] = useState<any>(null);
  const [summaryPayload, setSummaryPayload] = useState<any>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const [playback, setPlayback] = useState(false);
  const [screenshotCursor, setScreenshotCursor] = useState<string | null>(null);
  const [screenshotHasMore, setScreenshotHasMore] = useState(false);
  const [screenshotLoadingMore, setScreenshotLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [appFilter, setAppFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<string>("time_desc");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const resolvedView = useMemo<ActivityViewType>(() => {
    if (view) return view;
    if (location.pathname.includes("/activity/timeline")) return "timeline";
    if (location.pathname.includes("/activity/screenshots")) return "screenshots";
    return "live";
  }, [view, location.pathname]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const common = { date: date.format("YYYY-MM-DD") };
        if (resolvedView === "live") {
          const res = await getLiveActivity({ ...common, limit: 180 });
          setPayload(res.data || null);
          setSummaryPayload(null);
        } else if (resolvedView === "timeline") {
          const [sessionRes, summaryRes] = await Promise.all([
            getDailySessions({ ...common, employeeId: selectedEmployeeId }),
            getProductivitySummary({ ...common, employeeId: selectedEmployeeId }),
          ]);
          setPayload(sessionRes.data || null);
          setSummaryPayload(summaryRes.data || null);
        } else if (resolvedView === "screenshots") {
          const res = await getScreenshots({ ...common, limit: 60 });
          const data = res.data || null;
          setPayload(data);
          setSummaryPayload(null);
          setScreenshotCursor(data?.nextCursor || null);
          setScreenshotHasMore(Boolean(data?.nextCursor));
        }
      } catch (err: any) {
        message.error(err?.response?.data?.message || "Failed to load activity data");
        setPayload(null);
        setSummaryPayload(null);
        setScreenshotCursor(null);
        setScreenshotHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [resolvedView, date.valueOf(), selectedEmployeeId, refreshTick]);

  useEffect(() => {
    if (!autoRefreshSec) return;
    const timer = setInterval(() => {
      setRefreshTick((v) => v + 1);
    }, autoRefreshSec * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshSec]);

  useEffect(() => {
    if (resolvedView !== "timeline") return;
    const employeeId = new URLSearchParams(location.search).get("employeeId") || undefined;
    if (employeeId) {
      setSelectedEmployeeId(employeeId);
    }
  }, [resolvedView, location.search]);

  const title = useMemo(() => {
    if (resolvedView === "live") return "Activity Live View";
    if (resolvedView === "timeline") return "Employee Timeline";
    return "Screenshot Wall";
  }, [resolvedView]);

  const tabItems = [
    { key: "live", label: "Live View", path: "/activity/live" },
    { key: "timeline", label: "Employee Timeline", path: "/activity/timeline" },
    { key: "screenshots", label: "Screenshot Wall", path: "/activity/screenshots" },
  ] as const;

  const liveRows = useMemo<any[]>(() => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const byEmployee = new Map<string, any>();

    for (const row of items) {
      const employeeId = String(row?.employeeId || "unknown");
      if (!byEmployee.has(employeeId)) {
        byEmployee.set(employeeId, row);
      }
    }

    const latestRows = Array.from(byEmployee.values());
    const keyword = search.trim().toLowerCase();
    if (!keyword) return latestRows;
    return latestRows.filter((row: any) => {
      const appName = String(row?.data?.appName || "").toLowerCase();
      const windowTitle = String(row?.data?.windowTitle || "").toLowerCase();
      const employeeId = String(row?.employeeId || "").toLowerCase();
      return appName.includes(keyword) || windowTitle.includes(keyword) || employeeId.includes(keyword);
    });
  }, [payload, search]);

  const liveSummary = useMemo(() => {
    const rows = liveRows;
    const active = rows.filter((row: any) => {
      const action = String(row?.action || "");
      return action === "ACTIVITY_WINDOW" || action === "ACTIVITY_INPUT";
    }).length;
    const idle = rows.filter((row: any) => {
      const isIdle = Number(row?.data?.idleSec || 0) >= 60 || Boolean(row?.data?.isAfk);
      return isIdle;
    }).length;
    return {
      online: rows.length,
      active,
      idle,
      updatedAt: rows[0]?.at,
    };
  }, [liveRows]);

  const employeeTimelineRows = useMemo(() => {
    const employees = Array.isArray(payload?.employees) ? payload.employees : [];
    return employees.map((employee: any) => ({
      employeeId: employee.employeeId,
      sessionCount: Number(employee?.summary?.sessionCount || 0),
      totalSec: Number(employee?.summary?.totalSec || 0),
      activeSec: Number(employee?.summary?.activeSec || 0),
      focusedSec: Number(employee?.summary?.focusedSec || 0),
      distractedSec: Number(employee?.summary?.distractedSec || 0),
      productivityRatio: Number(employee?.summary?.productivityRatio || 0),
      sessions: employee.sessions || [],
    }));
  }, [payload]);

  const employeeOptions = useMemo(() => {
    const all = Array.isArray(payload?.employees) ? payload.employees : [];
    return all.map((row: any) => ({
      label: row.employeeId,
      value: row.employeeId,
    }));
  }, [payload]);

  const screenshotRows = useMemo(() => {
    const items = Array.isArray(payload?.screenshots) ? payload.screenshots : [];
    const keyword = search.trim().toLowerCase();
    const normalized = items.map((row: any) => {
      const metadata = row?.metadata || {};
      const employeeName = String(row?.employeeName || metadata?.employeeName || "").trim();
      const departmentName = String(row?.departmentName || metadata?.departmentName || "").trim();
      const appName = String(row?.appName || metadata?.appName || row?.processName || metadata?.processName || "").trim();
      const website = String(row?.url || metadata?.url || metadata?.domain || "").trim();
      const activityScore = calcActivityScore(row);
      const status = calcScreenshotStatus(row, date);
      const screenshotUrl = row?.screenshotUrl ? toAbsoluteScreenshotUrl(row.screenshotUrl) : "";
      const base64Url = row?.screenshotBase64 ? `data:image/png;base64,${row.screenshotBase64}` : "";
      const previewSrc = screenshotUrl || base64Url;

      return {
        ...row,
        employeeName,
        departmentName,
        appName,
        website,
        activityScore,
        status,
        previewSrc,
      };
    });

    let filtered = keyword
      ? normalized.filter((row: any) => {
          return [
            row?.employeeId,
            row?.employeeName,
            row?.departmentName,
            row?.appName,
            row?.website,
          ]
            .map((v) => String(v || "").toLowerCase())
            .some((v) => v.includes(keyword));
        })
      : normalized;

    if (statusFilter !== "all") {
      filtered = filtered.filter((row: any) => row.status === statusFilter);
    }

    if (departmentFilter !== "all") {
      filtered = filtered.filter((row: any) => String(row.departmentName || "") === departmentFilter);
    }

    if (appFilter !== "all") {
      filtered = filtered.filter((row: any) => String(row.appName || "") === appFilter);
    }

    filtered.sort((a: any, b: any) => {
      if (sortMode === "activity_desc") return Number(b.activityScore || 0) - Number(a.activityScore || 0);
      if (sortMode === "activity_asc") return Number(a.activityScore || 0) - Number(b.activityScore || 0);
      if (sortMode === "time_asc") return dayjs(a.capturedAt).valueOf() - dayjs(b.capturedAt).valueOf();
      return dayjs(b.capturedAt).valueOf() - dayjs(a.capturedAt).valueOf();
    });

    return filtered;
  }, [payload, search, date, statusFilter, departmentFilter, appFilter, sortMode]);

  const departmentOptions = useMemo(() => {
    const values = Array.from(new Set(screenshotRows.map((row: any) => String(row.departmentName || "").trim()).filter(Boolean))).sort();
    return [{ label: "Department: All", value: "all" }, ...values.map((v) => ({ label: v, value: v }))];
  }, [screenshotRows]);

  const appOptions = useMemo(() => {
    const values = Array.from(new Set(screenshotRows.map((row: any) => String(row.appName || "").trim()).filter(Boolean))).sort();
    return [{ label: "App: All", value: "all" }, ...values.map((v) => ({ label: v, value: v }))];
  }, [screenshotRows]);

  const visibleScreenshotRows = useMemo(() => {
    return screenshotRows;
  }, [screenshotRows]);

  const previewItems = useMemo(() => {
    return screenshotRows
      .filter((row: any) => Boolean(row?.previewSrc))
      .map((row: any) => ({
        src: row.previewSrc,
      }));
  }, [screenshotRows]);

  const previewIndexByRowId = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const row of screenshotRows) {
      const rowId = String(row?.id || "");
      if (!rowId) continue;
      if (!row?.previewSrc) continue;
      map.set(rowId, index);
      index += 1;
    }
    return map;
  }, [screenshotRows]);

  const fetchMoreScreenshots = useCallback(async () => {
    if (resolvedView !== "screenshots") return;
    if (!screenshotHasMore || !screenshotCursor || screenshotLoadingMore) return;

    setScreenshotLoadingMore(true);
    try {
      const res = await getScreenshots({
        date: date.format("YYYY-MM-DD"),
        limit: 60,
        cursor: screenshotCursor,
      });
      const data = res.data || {};
      const incoming = Array.isArray(data?.screenshots) ? data.screenshots : [];

      setPayload((prev: any) => {
        const previous = Array.isArray(prev?.screenshots) ? prev.screenshots : [];
        const merged = new Map<string, any>();
        for (const item of previous) {
          merged.set(String(item?.id || ""), item);
        }
        for (const item of incoming) {
          merged.set(String(item?.id || ""), item);
        }
        return {
          ...(prev || {}),
          date: data?.date || prev?.date,
          screenshots: Array.from(merged.values()),
        };
      });

      setScreenshotCursor(data?.nextCursor || null);
      setScreenshotHasMore(Boolean(data?.nextCursor));
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to load more screenshots");
    } finally {
      setScreenshotLoadingMore(false);
    }
  }, [resolvedView, screenshotHasMore, screenshotCursor, screenshotLoadingMore, date]);

  useEffect(() => {
    if (resolvedView !== "screenshots") return;

    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        fetchMoreScreenshots();
      },
      { rootMargin: "160px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [resolvedView, screenshotRows.length, fetchMoreScreenshots]);

  useEffect(() => {
    if (!playback || screenshotRows.length <= 1) return;

    const timer = setInterval(() => {
      setPreviewCurrent((current) => (current + 1) % screenshotRows.length);
      setPreviewVisible(true);
    }, 1200);

    return () => clearInterval(timer);
  }, [playback, screenshotRows.length]);

  const timelineMetricCards = useMemo(() => {
    const summary = summaryPayload?.companySummary || {};
    return {
      productivityIndex: Number(summary?.productivityIndex || 0),
      activeTimeRatio: Number(summary?.activeTimeRatio || 0),
      productivityRatio: Number(summary?.productivityRatio || 0),
      sessionCount: Number(summary?.sessionCount || 0),
    };
  }, [summaryPayload]);

  const screenshotLayout = useMemo(() => {
    const widthMode = screenshotRows.length > 40 ? "compact" : "comfortable";
    return widthMode === "compact" ? 6 : 8;
  }, [screenshotRows]);

  return (
    <div>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>{title}</Title>}
        extra={
          <Space>
            <DatePicker value={date} onChange={(v) => setDate(v || dayjs())} />
            {resolvedView === "timeline" && (
              <Select
                allowClear
                placeholder="Employee"
                style={{ width: 200 }}
                value={selectedEmployeeId}
                onChange={(value) => setSelectedEmployeeId(value)}
                options={employeeOptions}
              />
            )}
            <Input.Search
              allowClear
              placeholder={resolvedView === "screenshots" ? "Search by employee" : "Search"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            {resolvedView === "screenshots" && (
              <>
                <Select
                  value={autoRefreshSec}
                  onChange={setAutoRefreshSec}
                  style={{ width: 128 }}
                  options={[
                    { value: 0, label: "Auto Off" },
                    { value: 5, label: "Auto 5s" },
                    { value: 10, label: "Auto 10s" },
                    { value: 30, label: "Auto 30s" },
                  ]}
                />
                <Button icon={<ReloadOutlined />} onClick={() => setRefreshTick((v) => v + 1)}>
                  Refresh
                </Button>
                <Button
                  icon={playback ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => setPlayback((v) => !v)}
                >
                  {playback ? "Pause" : "Play"}
                </Button>
                <Select
                  value={statusFilter}
                  style={{ width: 128 }}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "Status: All" },
                    { value: "online", label: "Online" },
                    { value: "idle", label: "Idle" },
                    { value: "offline", label: "Offline" },
                  ]}
                />
                <Select value={departmentFilter} style={{ width: 180 }} onChange={setDepartmentFilter} options={departmentOptions} />
                <Select value={appFilter} style={{ width: 180 }} onChange={setAppFilter} options={appOptions} />
                <Select
                  value={sortMode}
                  style={{ width: 168 }}
                  onChange={setSortMode}
                  options={[
                    { value: "time_desc", label: "Time ↓" },
                    { value: "time_asc", label: "Time ↑" },
                    { value: "activity_desc", label: "Activity ↓" },
                    { value: "activity_asc", label: "Activity ↑" },
                  ]}
                />
              </>
            )}
          </Space>
        }
      >
        <Tabs
          activeKey={resolvedView}
          onChange={(key) => {
            const target = tabItems.find((item) => item.key === key);
            if (target) navigate(target.path);
          }}
          items={tabItems.map((item) => ({ key: item.key, label: item.label }))}
          style={{ marginBottom: 12 }}
        />

        {resolvedView === "live" && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={12}>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic title="Online Employees" value={liveSummary.online} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic title="Active Now" value={liveSummary.active} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card>
                  <Statistic title="Idle / AFK" value={liveSummary.idle} />
                </Card>
              </Col>
            </Row>

            <Table<any>
              loading={loading}
              rowKey={(row: any) => row.id}
              dataSource={liveRows}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: <Empty description="No live activity" /> }}
              columns={[
                { title: "Employee", dataIndex: "employeeId", render: (v) => v || "-" },
                {
                  title: "Status",
                  render: (_v, row: any) => {
                    const isIdle = Number(row?.data?.idleSec || 0) >= 60 || Boolean(row?.data?.isAfk);
                    if (isIdle) return <Tag color="orange">IDLE</Tag>;
                    return <Tag color="green">ACTIVE</Tag>;
                  },
                },
                { title: "Current App", render: (_v, row: any) => row?.data?.appName || row?.data?.processName || "-" },
                { title: "Window", render: (_v, row: any) => row?.data?.windowTitle || "-" },
                { title: "Duration", render: (_v, row: any) => secToDuration(row?.data?.durationSec) },
                { title: "Updated At", dataIndex: "at", render: (v) => dayjs(v).format("HH:mm:ss") },
              ]}
            />
          </Space>
        )}

        {resolvedView === "timeline" && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={12}>
              <Col xs={24} sm={6}>
                <Card>
                  <Statistic title="Productivity Index" value={timelineMetricCards.productivityIndex} suffix="/100" />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card>
                  <Statistic title="Active Time" value={(timelineMetricCards.activeTimeRatio * 100).toFixed(1)} suffix="%" />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card>
                  <Statistic title="Focused Ratio" value={(timelineMetricCards.productivityRatio * 100).toFixed(1)} suffix="%" />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card>
                  <Statistic title="Sessions" value={timelineMetricCards.sessionCount} />
                </Card>
              </Col>
            </Row>

            <Table<any>
              loading={loading}
              rowKey={(row: any) => row.employeeId}
              dataSource={employeeTimelineRows}
              pagination={{ pageSize: 12 }}
              locale={{ emptyText: <Empty description="No timeline data" /> }}
              columns={[
                { title: "Employee", dataIndex: "employeeId" },
                { title: "Sessions", dataIndex: "sessionCount" },
                { title: "Total", dataIndex: "totalSec", render: (v) => secToDuration(v) },
                { title: "Active", dataIndex: "activeSec", render: (v) => secToDuration(v) },
                { title: "Focused", dataIndex: "focusedSec", render: (v) => secToDuration(v) },
                {
                  title: "Productivity",
                  dataIndex: "productivityRatio",
                  render: (v) => {
                    const ratio = Math.round(Number(v || 0) * 100);
                    const color = ratio >= 75 ? "green" : ratio >= 50 ? "blue" : "volcano";
                    return <Tag color={color}>{ratio}%</Tag>;
                  },
                },
                {
                  title: "Timeline",
                  render: (_v, row: any) => (
                    <Segmented
                      size="small"
                      options={(row.sessions || []).slice(0, 4).map((session: any) => {
                        const ratio = Math.round(Number(session?.metrics?.productivityRatio || 0) * 100);
                        return {
                          label: `${dayjs(session.startAt).format("HH:mm")}-${dayjs(session.endAt).format("HH:mm")} (${ratio}%)`,
                          value: session.startAt,
                        };
                      })}
                    />
                  ),
                },
              ]}
            />
          </Space>
        )}

        {resolvedView === "screenshots" && (
          <div>
            {screenshotRows.length === 0 ? (
              <Empty description="No screenshots" />
            ) : (
              <Image.PreviewGroup
                items={previewItems}
                preview={{
                  open: previewVisible,
                  current: previewCurrent,
                  onOpenChange: (open) => {
                    setPreviewVisible(open);
                    if (!open) setPlayback(false);
                  },
                  onChange: (current) => setPreviewCurrent(current),
                }}
              >
              <Row gutter={[12, 12]}>
                {visibleScreenshotRows.map((row: any) => {
                  const previewSrc = row?.previewSrc || "";
                  const capturedAtText = dayjs(row?.capturedAt).format("MM-DD HH:mm:ss");
                  const employeeName = row?.employeeName || "Unknown";
                  const employeeId = row?.employeeId || "unknown";
                  const department = row?.departmentName || "-";
                  const appName = row?.appName || "Unknown App";
                  const activityScore = Number(row?.activityScore || 0);
                  const keyboardCount = Number(row?.keyboardCount || 0);
                  const mouseCount = Number(row?.mouseCount || 0);

                  return (
                    <Col key={row.id} xs={24} sm={12} md={screenshotLayout}>
                      <Card
                        hoverable
                        size="small"
                        styles={{ body: { padding: 10 } }}
                        title={
                          <Space size={8} style={{ maxWidth: "100%" }}>
                            <Button
                              type="link"
                              icon={<UserOutlined />}
                              style={{ padding: 0, height: "auto" }}
                              onClick={() => navigate(`/activity/timeline?employeeId=${encodeURIComponent(employeeId)}`)}
                            >
                              {employeeName}
                            </Button>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {employeeId}
                            </Text>
                          </Space>
                        }
                        extra={statusTag(row.status)}
                      >
                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                          <Space size={6} wrap>
                            <Tag icon={<ClockCircleOutlined />}>{capturedAtText}</Tag>
                            <Tag>{appName}</Tag>
                            <Tag color={activityScore >= 70 ? "green" : activityScore >= 40 ? "blue" : "volcano"}>
                              Activity {activityScore}%
                            </Tag>
                          </Space>

                          <Space size={6} wrap>
                            <Tag>{department}</Tag>
                            <Tag>Keyboard {keyboardCount}</Tag>
                            <Tag icon={<AimOutlined />}>Mouse {mouseCount}</Tag>
                          </Space>

                          {previewSrc ? (
                          <Popover
                            trigger="hover"
                            placement="right"
                            content={<img src={previewSrc} alt="hover-preview" style={{ width: 420, borderRadius: 10 }} />}
                          >
                            <div
                              onClick={() => {
                                const previewIndex = previewIndexByRowId.get(String(row?.id || ""));
                                if (typeof previewIndex !== "number") return;
                                setPreviewCurrent(previewIndex);
                                setPreviewVisible(true);
                              }}
                              style={{ cursor: "zoom-in" }}
                            >
                              <Image
                                src={previewSrc}
                                alt="screenshot"
                                preview={false}
                                style={{ width: "100%", borderRadius: 8, objectFit: "cover", aspectRatio: "16/9" }}
                              />
                            </div>
                          </Popover>
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No preview" />
                        )}

                          <Space size={4} wrap>
                            <Button
                              size="small"
                              icon={<ExpandOutlined />}
                              onClick={() => {
                                const previewIndex = previewIndexByRowId.get(String(row?.id || ""));
                                if (typeof previewIndex !== "number") return;
                                setPreviewCurrent(previewIndex);
                                setPreviewVisible(true);
                              }}
                            >
                              View
                            </Button>
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => {
                                if (!previewSrc) return;
                                window.open(previewSrc, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Open Original
                            </Button>
                            <Button
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={async () => {
                                if (!previewSrc) return;
                                await navigator.clipboard.writeText(previewSrc);
                                message.success("Screenshot URL copied");
                              }}
                            >
                              Copy URL
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
              {(screenshotHasMore || screenshotLoadingMore) && (
                <div ref={loadMoreRef} style={{ textAlign: "center", padding: "16px 0", color: "#667085" }}>
                  {screenshotLoadingMore ? "Loading more screenshots..." : "Scroll to load more..."}
                </div>
              )}
              </Image.PreviewGroup>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
