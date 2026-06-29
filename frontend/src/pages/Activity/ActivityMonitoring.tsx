import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ExpandOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getScreenshots } from '../../api/activity';
import { API_BASE_URL } from '../../api/client';

const { Title, Text } = Typography;

type Props = {
  view?: 'screenshots';
};

type ScreenshotStatus = 'online' | 'idle' | 'offline';

function toAbsoluteScreenshotUrl(urlValue: unknown) {
  const raw = String(urlValue || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

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
  if (isAfk || idleSec >= 120) return 'idle';

  const capturedAt = dayjs(row?.capturedAt);
  if (selectedDate.isSame(dayjs(), 'day') && capturedAt.isValid()) {
    const ageSec = Math.max(0, dayjs().diff(capturedAt, 'second'));
    if (ageSec <= 180) return 'online';
    if (ageSec <= 900) return 'idle';
    return 'offline';
  }

  return 'online';
}

function statusTag(status: ScreenshotStatus) {
  if (status === 'online') return <Tag color='green'>Online</Tag>;
  if (status === 'idle') return <Tag color='gold'>Idle</Tag>;
  return <Tag color='red'>Offline</Tag>;
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export default function ActivityMonitoring({ view }: Props) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(dayjs());
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [payload, setPayload] = useState<any>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const [screenshotCursor, setScreenshotCursor] = useState<string | null>(null);
  const [screenshotHasMore, setScreenshotHasMore] = useState(false);
  const [screenshotLoadingMore, setScreenshotLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<string>('time_desc');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const isScreenshotOnly = view === 'screenshots' || true;

  useEffect(() => {
    if (!isScreenshotOnly) return;

    const run = async () => {
      setLoading(true);
      try {
        const res = await getScreenshots({ date: date.format('YYYY-MM-DD'), limit: 120 });
        const data = res.data || null;
        setPayload(data);
        setScreenshotCursor(data?.nextCursor || null);
        setScreenshotHasMore(Boolean(data?.nextCursor));
      } catch (err: any) {
        message.error(err?.response?.data?.message || 'Failed to load screenshots');
        setPayload(null);
        setScreenshotCursor(null);
        setScreenshotHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [date.valueOf(), refreshTick, isScreenshotOnly]);

  const screenshotRows = useMemo(() => {
    const items = Array.isArray(payload?.screenshots) ? payload.screenshots : [];
    const keyword = search.trim().toLowerCase();

    const normalized = items.map((row: any) => {
      const metadata = row?.metadata || {};
      const employeeName = String(row?.employeeName || metadata?.employeeName || '').trim();
      const departmentName = String(row?.departmentName || metadata?.departmentName || '').trim();
      const appName = String(row?.appName || metadata?.appName || row?.processName || metadata?.processName || '').trim();
      const website = String(row?.url || metadata?.url || metadata?.domain || '').trim();
      const activityScore = calcActivityScore(row);
      const status = calcScreenshotStatus(row, date);
      const screenshotUrl = row?.screenshotUrl ? toAbsoluteScreenshotUrl(row.screenshotUrl) : '';
      const base64Url = row?.screenshotBase64 ? `data:image/png;base64,${row.screenshotBase64}` : '';
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
        minuteKey: dayjs(row?.capturedAt).format('YYYY-MM-DD HH:mm'),
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
            .map((v) => String(v || '').toLowerCase())
            .some((v) => v.includes(keyword));
        })
      : normalized;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((row: any) => row.status === statusFilter);
    }

    if (teamFilter !== 'all') {
      filtered = filtered.filter((row: any) => String(row.departmentName || '') === teamFilter);
    }

    if (employeeFilter !== 'all') {
      filtered = filtered.filter((row: any) => String(row.employeeId || '') === employeeFilter);
    }

    filtered.sort((a: any, b: any) => {
      if (sortMode === 'activity_desc') return Number(b.activityScore || 0) - Number(a.activityScore || 0);
      if (sortMode === 'activity_asc') return Number(a.activityScore || 0) - Number(b.activityScore || 0);
      if (sortMode === 'time_asc') return dayjs(a.capturedAt).valueOf() - dayjs(b.capturedAt).valueOf();
      return dayjs(b.capturedAt).valueOf() - dayjs(a.capturedAt).valueOf();
    });

    return filtered;
  }, [payload, search, date, statusFilter, teamFilter, employeeFilter, sortMode]);

  const teamOptions = useMemo(() => {
    const values = Array.from(new Set(screenshotRows.map((row: any) => String(row.departmentName || '').trim()).filter(Boolean))).sort();
    return [{ label: 'Team: All', value: 'all' }, ...values.map((v) => ({ label: v, value: v }))];
  }, [screenshotRows]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of screenshotRows) {
      const employeeId = String(row?.employeeId || '').trim();
      if (!employeeId) continue;
      map.set(employeeId, `${row?.employeeName || employeeId} (${employeeId})`);
    }
    return [
      { label: 'Employee: All', value: 'all' },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [screenshotRows]);

  const screenshotKpi = useMemo(() => {
    const captured = screenshotRows.length;
    const online = screenshotRows.filter((row: any) => row.status === 'online').length;
    const idle = screenshotRows.filter((row: any) => row.status === 'idle').length;
    const offline = screenshotRows.filter((row: any) => row.status === 'offline').length;
    const employees = new Set(
      screenshotRows
        .map((row: any) => String(row?.employeeId || '').trim())
        .filter(Boolean),
    ).size;

    return {
      captured,
      online,
      idle,
      offline,
      employees,
    };
  }, [screenshotRows]);

  const singleEmployeeMinuteRows = useMemo(() => {
    if (employeeFilter === 'all') return [];
    const rows = screenshotRows.filter((row: any) => String(row.employeeId || '') === employeeFilter);
    const byMinute = new Map<string, any>();

    for (const row of rows) {
      const key = String(row.minuteKey || '');
      if (!key) continue;
      const existed = byMinute.get(key);
      if (!existed || dayjs(row.capturedAt).valueOf() > dayjs(existed.capturedAt).valueOf()) {
        byMinute.set(key, row);
      }
    }

    return Array.from(byMinute.values()).sort(
      (a: any, b: any) => dayjs(b.capturedAt).valueOf() - dayjs(a.capturedAt).valueOf(),
    );
  }, [employeeFilter, screenshotRows]);

  const previewItems = useMemo(() => {
    return screenshotRows
      .filter((row: any) => Boolean(row?.previewSrc))
      .map((row: any) => ({ src: row.previewSrc }));
  }, [screenshotRows]);

  const previewIndexByRowId = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const row of screenshotRows) {
      const rowId = String(row?.id || '');
      if (!rowId || !row?.previewSrc) continue;
      map.set(rowId, index);
      index += 1;
    }
    return map;
  }, [screenshotRows]);

  const fetchMoreScreenshots = useCallback(async () => {
    if (!screenshotHasMore || !screenshotCursor || screenshotLoadingMore) return;

    setScreenshotLoadingMore(true);
    try {
      const res = await getScreenshots({
        date: date.format('YYYY-MM-DD'),
        limit: 120,
        cursor: screenshotCursor,
      });
      const data = res.data || {};
      const incoming = Array.isArray(data?.screenshots) ? data.screenshots : [];

      setPayload((prev: any) => {
        const previous = Array.isArray(prev?.screenshots) ? prev.screenshots : [];
        const merged = new Map<string, any>();
        for (const item of previous) {
          merged.set(String(item?.id || ''), item);
        }
        for (const item of incoming) {
          merged.set(String(item?.id || ''), item);
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
      message.error(err?.response?.data?.message || 'Failed to load more screenshots');
    } finally {
      setScreenshotLoadingMore(false);
    }
  }, [screenshotHasMore, screenshotCursor, screenshotLoadingMore, date]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void fetchMoreScreenshots();
      },
      { rootMargin: '160px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [screenshotRows.length, fetchMoreScreenshots]);

  const exportCsv = () => {
    const headers = ['DateTime', 'EmployeeId', 'Employee', 'Team', 'App', 'Website', 'Activity', 'Status'];
    const lines = [headers.map((item) => toCsvCell(item)).join(',')];

    for (const row of screenshotRows) {
      lines.push(
        [
          dayjs(row?.capturedAt).format('YYYY-MM-DD HH:mm:ss'),
          row?.employeeId || '-',
          row?.employeeName || '-',
          row?.departmentName || '-',
          row?.appName || '-',
          row?.website || '-',
          row?.activityScore || 0,
          row?.status || '-',
        ]
          .map((item) => toCsvCell(item))
          .join(','),
      );
    }

    const employeePart = employeeFilter === 'all' ? 'All' : `Employee-${employeeFilter}`;
    const teamPart = teamFilter === 'all' ? 'AllTeam' : `Team-${teamFilter.replace(/\s+/g, '-')}`;
    const fileName = `XTTEN_Screenshot_Wall_${date.format('YYYY-MM-DD')}_${teamPart}_${employeePart}.csv`;
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    message.success(`Exported ${screenshotRows.length} screenshot row(s)`);
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 8 }}>Screenshot Wall</Title>
        <Text type='secondary'>Live screenshot monitoring with team and employee level filtering.</Text>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8} lg={4}><Card><Text type='secondary'>Captured</Text><Title level={4}>{screenshotKpi.captured}</Title></Card></Col>
        <Col xs={24} sm={12} md={8} lg={4}><Card><Text type='secondary'>Online</Text><Title level={4}>{screenshotKpi.online}</Title></Card></Col>
        <Col xs={24} sm={12} md={8} lg={4}><Card><Text type='secondary'>Idle</Text><Title level={4}>{screenshotKpi.idle}</Title></Card></Col>
        <Col xs={24} sm={12} md={8} lg={4}><Card><Text type='secondary'>Offline</Text><Title level={4}>{screenshotKpi.offline}</Title></Card></Col>
        <Col xs={24} sm={12} md={8} lg={4}><Card><Text type='secondary'>Employees</Text><Title level={4}>{screenshotKpi.employees}</Title></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align='middle' justify='space-between'>
          <Col xs={24} lg={18}>
            <Space wrap>
              <DatePicker value={date} onChange={(v) => setDate(v || dayjs())} />
              <Input.Search
                allowClear
                placeholder='Search screenshots'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 220 }}
              />
              <Select value={teamFilter} style={{ width: 180 }} onChange={setTeamFilter} options={teamOptions} />
              <Select value={employeeFilter} style={{ width: 240 }} onChange={setEmployeeFilter} options={employeeOptions} />
              <Select
                value={statusFilter}
                style={{ width: 128 }}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'Status: All' },
                  { value: 'online', label: 'Online' },
                  { value: 'idle', label: 'Idle' },
                  { value: 'offline', label: 'Offline' },
                ]}
              />
              <Select
                value={sortMode}
                style={{ width: 168 }}
                onChange={setSortMode}
                options={[
                  { value: 'time_desc', label: 'Time ↓' },
                  { value: 'time_asc', label: 'Time ↑' },
                  { value: 'activity_desc', label: 'Activity ↓' },
                  { value: 'activity_asc', label: 'Activity ↑' },
                ]}
              />
            </Space>
          </Col>
          <Col xs={24} lg={6}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
              <Button icon={<ReloadOutlined />} onClick={() => setRefreshTick((v) => v + 1)}>
                Refresh
              </Button>
              <Button type='primary' icon={<DownloadOutlined />} onClick={exportCsv}>
                Export CSV
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title={<Title level={4} style={{ margin: 0 }}>Screenshots</Title>}
      >
        {screenshotRows.length === 0 ? (
          <Empty description='No screenshots' />
        ) : (
          <>
            <Image.PreviewGroup
              items={previewItems}
              preview={{
                open: previewVisible,
                current: previewCurrent,
                onOpenChange: (open) => setPreviewVisible(open),
                onChange: (current) => setPreviewCurrent(current),
              }}
            >
              <Row gutter={[12, 12]}>
                {screenshotRows.map((row: any) => {
                  const previewSrc = row?.previewSrc || '';
                  const capturedAtText = dayjs(row?.capturedAt).format('MM-DD HH:mm:ss');
                  const employeeName = row?.employeeName || 'Unknown';
                  const employeeId = row?.employeeId || 'unknown';
                  const department = row?.departmentName || '-';
                  const appName = row?.appName || 'Unknown App';
                  const activityScore = Number(row?.activityScore || 0);

                  return (
                    <Col key={row.id} xs={24} sm={12} md={8} lg={6}>
                      <Card
                        hoverable
                        size='small'
                        styles={{ body: { padding: 10 } }}
                        title={
                          <Space size={8} style={{ maxWidth: '100%' }}>
                            <UserOutlined />
                            <Text ellipsis>{employeeName}</Text>
                            <Text type='secondary' style={{ fontSize: 12 }}>
                              {employeeId}
                            </Text>
                          </Space>
                        }
                        extra={statusTag(row.status)}
                      >
                        <Space direction='vertical' size={8} style={{ width: '100%' }}>
                          <Space size={6} wrap>
                            <Tag icon={<ClockCircleOutlined />}>{capturedAtText}</Tag>
                            <Tag>{appName}</Tag>
                            <Tag color={activityScore >= 70 ? 'green' : activityScore >= 40 ? 'blue' : 'volcano'}>
                              Activity {activityScore}%
                            </Tag>
                          </Space>

                          <Tag>{department}</Tag>

                          {previewSrc ? (
                            <Popover
                              trigger='hover'
                              placement='right'
                              content={<img src={previewSrc} alt='hover-preview' style={{ width: 420, borderRadius: 10 }} />}
                            >
                              <div
                                onClick={() => {
                                  const previewIndex = previewIndexByRowId.get(String(row?.id || ''));
                                  if (typeof previewIndex !== 'number') return;
                                  setPreviewCurrent(previewIndex);
                                  setPreviewVisible(true);
                                }}
                                style={{ cursor: 'zoom-in' }}
                              >
                                <Image
                                  src={previewSrc}
                                  alt='screenshot'
                                  preview={false}
                                  style={{ width: '100%', borderRadius: 8, objectFit: 'cover', aspectRatio: '16/9' }}
                                />
                              </div>
                            </Popover>
                          ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='No preview' />
                          )}

                          <Space size={4} wrap>
                            <Button
                              size='small'
                              icon={<ExpandOutlined />}
                              onClick={() => {
                                const previewIndex = previewIndexByRowId.get(String(row?.id || ''));
                                if (typeof previewIndex !== 'number') return;
                                setPreviewCurrent(previewIndex);
                                setPreviewVisible(true);
                              }}
                            >
                              View
                            </Button>
                            <Button
                              size='small'
                              icon={<DownloadOutlined />}
                              onClick={() => {
                                if (!previewSrc) return;
                                window.open(previewSrc, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Open Original
                            </Button>
                            <Button
                              size='small'
                              icon={<CopyOutlined />}
                              onClick={async () => {
                                if (!previewSrc) return;
                                await navigator.clipboard.writeText(previewSrc);
                                message.success('Screenshot URL copied');
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
                <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '16px 0', color: '#667085' }}>
                  {screenshotLoadingMore ? 'Loading more screenshots...' : 'Scroll to load more...'}
                </div>
              )}
            </Image.PreviewGroup>

            {employeeFilter !== 'all' && (
              <Card title='Single Employee Minute Screenshots' style={{ marginTop: 16 }}>
                <Table
                  rowKey={(row: any) => String(row?.id || row?.minuteKey || Math.random())}
                  dataSource={singleEmployeeMinuteRows}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Minute', dataIndex: 'minuteKey' },
                    { title: 'App', dataIndex: 'appName', render: (v: string) => v || '-' },
                    { title: 'Website', dataIndex: 'website', render: (v: string) => v || '-' },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      render: (v: ScreenshotStatus) => statusTag(v),
                    },
                    {
                      title: 'Activity',
                      dataIndex: 'activityScore',
                      render: (v: number) => `${Number(v || 0)}%`,
                    },
                    {
                      title: 'Captured At',
                      dataIndex: 'capturedAt',
                      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
                    },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
