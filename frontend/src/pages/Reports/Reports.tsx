import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Row, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  downloadDayReport,
  downloadMonthReport,
  getAttendanceSummary,
  getDailyReport,
  getMonthlyReport,
} from '../../api/reports';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type ReportTabKey = 'daily' | 'monthly' | 'summary';

type SummaryStatusFilter = 'ON_TIME' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'ABSENT' | 'MISSING';

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function statusColor(status: string) {
  if (status === 'ON_TIME') return 'green';
  if (status === 'LATE') return 'orange';
  if (status === 'LEAVE') return 'blue';
  if (status === 'HOLIDAY') return 'cyan';
  if (status === 'MISSING') return 'default';
  return 'red';
}

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();

  const resolveTabByPath = useCallback((pathname: string): ReportTabKey => {
    if (pathname.startsWith('/reports/monthly')) return 'monthly';
    if (pathname.startsWith('/reports/summary') || pathname === '/reports') return 'summary';
    return 'daily';
  }, []);

  const [tab, setTab] = useState<ReportTabKey>(() => resolveTabByPath(location.pathname));
  const [loading, setLoading] = useState(false);

  const [dailyDate, setDailyDate] = useState<Dayjs>(dayjs());
  const [monthDate, setMonthDate] = useState<Dayjs>(dayjs());
  const [summaryRange, setSummaryRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('day'),
  ]);

  const [dailyData, setDailyData] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [summaryTeam, setSummaryTeam] = useState<string | undefined>(undefined);
  const [summaryEmployee, setSummaryEmployee] = useState<string | undefined>(undefined);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatusFilter | undefined>(undefined);

  useEffect(() => {
    const nextTab = resolveTabByPath(location.pathname);
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [location.pathname, resolveTabByPath]);

  const handleTabChange = (key: string) => {
    const nextTab = key as ReportTabKey;
    setTab(nextTab);

    if (nextTab === 'daily') {
      navigate('/reports/daily');
      return;
    }
    if (nextTab === 'monthly') {
      navigate('/reports/monthly');
      return;
    }
    navigate('/reports/summary');
  };

  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDailyReport({ date: dailyDate.format('YYYY-MM-DD') });
      setDailyData(res.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load daily report');
      setDailyData(null);
    } finally {
      setLoading(false);
    }
  }, [dailyDate]);

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMonthlyReport({ month: monthDate.format('YYYY-MM') });
      setMonthlyData(res.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load monthly report');
      setMonthlyData(null);
    } finally {
      setLoading(false);
    }
  }, [monthDate]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAttendanceSummary({
        startDate: summaryRange[0].format('YYYY-MM-DD'),
        endDate: summaryRange[1].format('YYYY-MM-DD'),
      });
      setSummaryData(res.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load attendance summary');
      setSummaryData(null);
    } finally {
      setLoading(false);
    }
  }, [summaryRange]);

  useEffect(() => {
    if (tab === 'daily') {
      void loadDaily();
      return;
    }
    if (tab === 'monthly') {
      void loadMonthly();
      return;
    }
    void loadSummary();
  }, [tab, loadDaily, loadMonthly, loadSummary]);

  const exportCurrent = async () => {
    try {
      if (tab === 'daily') {
        const blob = await downloadDayReport({
          date: dailyDate.format('YYYY-MM-DD'),
          format: 'csv',
        });
        downloadBlob(
          blob,
          `XTTEN_Report_Daily_${dailyDate.format('YYYY-MM-DD')}.csv`,
        );
        message.success('Daily report exported');
        return;
      }

      if (tab === 'monthly') {
        const blob = await downloadMonthReport({
          month: monthDate.format('YYYY-MM'),
          format: 'csv',
        });
        downloadBlob(
          blob,
          `XTTEN_Report_Monthly_${monthDate.format('YYYY-MM')}.csv`,
        );
        message.success('Monthly report exported');
        return;
      }

      const rows = filteredSummaryRows;
      const headers = [
        'Team',
        'Employee',
        'Username',
        'Total Days',
        'Present',
        'On Time',
        'Late',
        'Leave',
        'Holiday',
        'Absent',
        'Missing',
        'Attendance %',
        'Work Hours',
        'Late (min)',
        'Early Leave (min)',
        'Overtime',
      ];
      const csvLines = [
        headers.map((h) => toCsvCell(h)).join(','),
        ...rows.map((row: any) =>
          [
            row.teamName || '-',
            row.name || '-',
            row.username || '-',
            row.totalDays,
            row.present,
            row.onTime,
            row.late,
            row.leave,
            row.holiday,
            row.absent,
            row.missing,
            row.attendanceRate,
            row.totalHoursDecimal,
            row.totalLateMinutes ?? 0,
            row.totalEarlyLeaveMinutes ?? 0,
            row.otHoursDecimal,
          ]
            .map((value) => toCsvCell(value))
            .join(','),
        ),
      ];

      const summaryFilterParts: string[] = [];
      if (summaryTeam) summaryFilterParts.push(`Team-${summaryTeam}`);
      if (summaryEmployee) summaryFilterParts.push(`Employee-${summaryEmployee}`);
      if (summaryStatus) summaryFilterParts.push(`Status-${summaryStatus}`);
      const filterLabel = summaryFilterParts.length
        ? summaryFilterParts.join('_').replace(/\s+/g, '-')
        : 'All';

      const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], {
        type: 'text/csv;charset=utf-8;',
      });
      downloadBlob(
        blob,
        `XTTEN_Report_Summary_${summaryRange[0].format('YYYY-MM-DD')}_to_${summaryRange[1].format('YYYY-MM-DD')}_${filterLabel}.csv`,
      );
      message.success('Summary report exported');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Export failed');
    }
  };

  const dailyMetrics = useMemo(() => {
    const status = dailyData?.statusSummary || {};
    const rows = Array.isArray(dailyData?.rows) ? dailyData.rows : [];
    const workHours = rows
      .reduce((sum: number, row: any) => sum + Number(row?.totalHoursDecimal || 0), 0);
    const overtime = rows
      .reduce((sum: number, row: any) => sum + Number(row?.otHoursDecimal || 0), 0);
    return {
      present: Number(status.onTime || 0) + Number(status.late || 0),
      late: Number(status.late || 0),
      leave: Number(status.leave || 0),
      absent: Number(status.absent || 0) + Number(status.missing || 0),
      workHours: Number(workHours.toFixed(2)),
      overtime: Number(overtime.toFixed(2)),
    };
  }, [dailyData]);

  const monthlyMetrics = useMemo(() => {
    const status = monthlyData?.statusTotals || {};
    return {
      totalEmployees: Number(monthlyData?.totalEmployees || 0),
      attendanceRate: Number(monthlyData?.averageAttendanceRate || 0),
      onTime: Number(status.onTime || 0),
      late: Number(status.late || 0),
      leave: Number(status.leave || 0),
      absent: Number(status.absent || 0) + Number(status.missing || 0),
    };
  }, [monthlyData]);

  const filteredSummaryRows = useMemo(() => {
    const rows = Array.isArray(summaryData?.rows) ? summaryData.rows : [];
    return rows.filter((row: any) => {
      if (summaryTeam && row.teamName !== summaryTeam) return false;
      if (summaryEmployee && row.employeeId !== summaryEmployee) return false;
      if (summaryStatus) {
        if (summaryStatus === 'ON_TIME' && Number(row.onTime || 0) <= 0) return false;
        if (summaryStatus === 'LATE' && Number(row.late || 0) <= 0) return false;
        if (summaryStatus === 'LEAVE' && Number(row.leave || 0) <= 0) return false;
        if (summaryStatus === 'HOLIDAY' && Number(row.holiday || 0) <= 0) return false;
        if (summaryStatus === 'ABSENT' && Number(row.absent || 0) <= 0) return false;
        if (summaryStatus === 'MISSING' && Number(row.missing || 0) <= 0) return false;
      }
      return true;
    });
  }, [summaryData, summaryEmployee, summaryStatus, summaryTeam]);

  const summaryTeamOptions = useMemo(() => {
    const rows = Array.isArray(summaryData?.rows) ? summaryData.rows : [];
    const uniq = new Set<string>();
    for (const row of rows) {
      if (row?.teamName && row.teamName !== '-') uniq.add(row.teamName);
    }
    return Array.from(uniq).sort().map((teamName) => ({ label: teamName, value: teamName }));
  }, [summaryData]);

  const summaryEmployeeOptions = useMemo(() => {
    const rows = Array.isArray(summaryData?.rows) ? summaryData.rows : [];
    return rows.map((row: any) => ({
      label: row?.name || row?.username || row?.employeeId,
      value: row?.employeeId,
    }));
  }, [summaryData]);

  const summaryMetrics = useMemo(() => {
    const rows = filteredSummaryRows;
    const totals = rows.reduce(
      (acc: any, row: any) => {
        acc.totalDays += Number(row.totalDays || 0);
        acc.onTime += Number(row.onTime || 0);
        acc.late += Number(row.late || 0);
        acc.leave += Number(row.leave || 0);
        acc.absent += Number(row.absent || 0);
        acc.missing += Number(row.missing || 0);
        return acc;
      },
      { totalDays: 0, onTime: 0, late: 0, leave: 0, absent: 0, missing: 0 },
    );
    const present = totals.onTime + totals.late;
    return {
      totalEmployees: rows.length,
      attendanceRate: totals.totalDays
        ? Number(((present / totals.totalDays) * 100).toFixed(2))
        : 0,
      onTime: totals.onTime,
      late: totals.late,
      leave: totals.leave,
      absent: totals.absent + totals.missing,
    };
  }, [filteredSummaryRows]);

  return (
    <Space direction='vertical' size={16} style={{ width: '100%' }}>
      <Card>
        <Title level={3} style={{ marginBottom: 8 }}>Reports</Title>
        <Text type='secondary'>
          Attendance reporting across daily, monthly, and summary views.
        </Text>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={[
          { key: 'daily', label: 'Daily Report' },
          { key: 'monthly', label: 'Monthly Report' },
          { key: 'summary', label: 'Attendance Summary' },
        ]}
      />

      <Card>
        <Space wrap>
          {tab === 'daily' && (
            <DatePicker value={dailyDate} onChange={(value) => setDailyDate(value || dayjs())} />
          )}
          {tab === 'monthly' && (
            <DatePicker picker='month' value={monthDate} onChange={(value) => setMonthDate(value || dayjs())} />
          )}
          {tab === 'summary' && (
            <RangePicker
              value={summaryRange}
              onChange={(values) => {
                if (values && values[0] && values[1]) {
                  setSummaryRange([values[0], values[1]]);
                }
              }}
            />
          )}

          {tab === 'summary' && (
            <>
              <Select
                allowClear
                placeholder='Team'
                style={{ width: 180 }}
                value={summaryTeam}
                onChange={setSummaryTeam}
                options={summaryTeamOptions}
              />
              <Select
                allowClear
                placeholder='Employee'
                style={{ width: 220 }}
                value={summaryEmployee}
                onChange={setSummaryEmployee}
                options={summaryEmployeeOptions}
              />
              <Select
                allowClear
                placeholder='Status'
                style={{ width: 180 }}
                value={summaryStatus}
                onChange={(value) => setSummaryStatus(value as SummaryStatusFilter | undefined)}
                options={[
                  { label: 'ON_TIME', value: 'ON_TIME' },
                  { label: 'LATE', value: 'LATE' },
                  { label: 'LEAVE', value: 'LEAVE' },
                  { label: 'HOLIDAY', value: 'HOLIDAY' },
                  { label: 'ABSENT', value: 'ABSENT' },
                  { label: 'MISSING', value: 'MISSING' },
                ]}
              />
            </>
          )}

          <Button type='primary' onClick={exportCurrent}>
            Export Current View
          </Button>

          <Button
            onClick={() => {
              if (tab === 'daily') void loadDaily();
              else if (tab === 'monthly') void loadMonthly();
              else void loadSummary();
            }}
          >
            Refresh
          </Button>
        </Space>
      </Card>

      {tab === 'daily' && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Present</Text><Title level={4}>{dailyMetrics.present}</Title></Card></Col>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Late</Text><Title level={4}>{dailyMetrics.late}</Title></Card></Col>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Leave</Text><Title level={4}>{dailyMetrics.leave}</Title></Card></Col>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Absent</Text><Title level={4}>{dailyMetrics.absent}</Title></Card></Col>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Work Hours</Text><Title level={4}>{dailyMetrics.workHours}</Title></Card></Col>
            <Col xs={24} md={8} lg={4}><Card loading={loading}><Text type='secondary'>Overtime</Text><Title level={4}>{dailyMetrics.overtime}</Title></Card></Col>
          </Row>

          <Card title='Daily Report'>
            <Table
              rowKey='employeeId'
              loading={loading}
              pagination={{ pageSize: 10 }}
              dataSource={Array.isArray(dailyData?.rows) ? dailyData.rows : []}
              columns={[
                { title: 'Date', dataIndex: 'workDate', render: (value: string) => value || '-' },
                { title: 'Team', dataIndex: 'teamName', render: (value: string) => value || 'N/A' },
                { title: 'Employee', dataIndex: 'name' },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (value: string) => <Tag color={statusColor(value)}>{value || '-'}</Tag>,
                },
                {
                  title: 'Check In',
                  dataIndex: 'checkIn',
                  render: (value: string | null) => (value ? dayjs(value).format('HH:mm:ss') : '-'),
                },
                {
                  title: 'Check Out',
                  dataIndex: 'checkOut',
                  render: (value: string | null) => (value ? dayjs(value).format('HH:mm:ss') : '-'),
                },
                {
                  title: 'Work Hours',
                  dataIndex: 'totalHoursDecimal',
                  render: (value: number | null) => (value != null ? Number(value).toFixed(2) : '-'),
                },
                {
                  title: 'Late (min)',
                  dataIndex: 'lateMinutes',
                  render: (value: number, record: any) =>
                    record.status === 'LATE' && value > 0
                      ? <Tag color='orange'>{value} min</Tag>
                      : <span style={{ color: '#aaa' }}>-</span>,
                },
                {
                  title: 'Early Leave (min)',
                  dataIndex: 'earlyLeaveMinutes',
                  render: (value: number) =>
                    value > 0
                      ? <Tag color='gold'>{value} min</Tag>
                      : <span style={{ color: '#aaa' }}>-</span>,
                },
                {
                  title: 'Overtime',
                  dataIndex: 'otHoursDecimal',
                  render: (value: number | null) => (value != null ? Number(value).toFixed(2) : '0.00'),
                },
              ]}
            />
          </Card>
        </>
      )}

      {tab === 'monthly' && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Total Employees</Text><Title level={4}>{monthlyMetrics.totalEmployees}</Title></Card></Col>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Average Attendance Rate</Text><Title level={4}>{monthlyMetrics.attendanceRate}%</Title></Card></Col>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Leave (Month Total)</Text><Title level={4}>{monthlyMetrics.leave}</Title></Card></Col>
          </Row>

          <Card title='Monthly Trend'>
            <Table
              rowKey='date'
              loading={loading}
              pagination={{ pageSize: 10 }}
              dataSource={Array.isArray(monthlyData?.trend) ? monthlyData.trend : []}
              columns={[
                { title: 'Date', dataIndex: 'date' },
                { title: 'Present', dataIndex: 'present' },
                { title: 'Absent', dataIndex: 'absent' },
                { title: 'Late', render: (_: unknown, row: any) => row?.statusSummary?.late ?? 0 },
                { title: 'Leave', render: (_: unknown, row: any) => row?.statusSummary?.leave ?? 0 },
                {
                  title: 'Attendance %',
                  dataIndex: 'attendanceRate',
                  render: (value: number) => `${Number(value || 0).toFixed(2)}%`,
                },
                {
                  title: 'Overtime',
                  dataIndex: 'totalOtHours',
                  render: (value: number) => Number(value || 0).toFixed(2),
                },
              ]}
            />
          </Card>
        </>
      )}

      {tab === 'summary' && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Total Employees</Text><Title level={4}>{summaryMetrics.totalEmployees}</Title></Card></Col>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Attendance Rate</Text><Title level={4}>{summaryMetrics.attendanceRate}%</Title></Card></Col>
            <Col xs={24} md={8}><Card loading={loading}><Text type='secondary'>Leave</Text><Title level={4}>{summaryMetrics.leave}</Title></Card></Col>
          </Row>

          <Card title='Attendance Summary'>
            <Table
              rowKey='employeeId'
              loading={loading}
              pagination={{ pageSize: 10 }}
              dataSource={filteredSummaryRows}
              columns={[
                { title: 'Team', dataIndex: 'teamName' },
                { title: 'Employee', dataIndex: 'name' },
                { title: 'Username', dataIndex: 'username' },
                { title: 'Total Days', dataIndex: 'totalDays' },
                { title: 'Present', dataIndex: 'present' },
                { title: 'On Time', dataIndex: 'onTime' },
                { title: 'Late', dataIndex: 'late' },
                { title: 'Leave', dataIndex: 'leave' },
                { title: 'Holiday', dataIndex: 'holiday' },
                { title: 'Absent', dataIndex: 'absent' },
                { title: 'Missing', dataIndex: 'missing' },
                {
                  title: 'Attendance %',
                  dataIndex: 'attendanceRate',
                  render: (value: number) => `${Number(value || 0).toFixed(2)}%`,
                },
                {
                  title: 'Work Hours',
                  dataIndex: 'totalHoursDecimal',
                  render: (value: number) => Number(value || 0).toFixed(2),
                },
                {
                  title: 'Late (min)',
                  dataIndex: 'totalLateMinutes',
                  render: (value: number) =>
                    value > 0
                      ? <Tag color='orange'>{value} min</Tag>
                      : <span style={{ color: '#aaa' }}>0</span>,
                },
                {
                  title: 'Early Leave (min)',
                  dataIndex: 'totalEarlyLeaveMinutes',
                  render: (value: number) =>
                    value > 0
                      ? <Tag color='gold'>{value} min</Tag>
                      : <span style={{ color: '#aaa' }}>0</span>,
                },
                {
                  title: 'Overtime',
                  dataIndex: 'otHoursDecimal',
                  render: (value: number) => Number(value || 0).toFixed(2),
                },
              ]}
            />
          </Card>
        </>
      )}
    </Space>
  );
}
