import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

import { getEmployee360, updateEmployeeLifecycle } from "../../api/employees";

type SectionResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  loaded: boolean;
};

type Employee360 = {
  profile: {
    id: string;
    employeeNo?: string;
    name: string;
    email?: string;
    phone?: string;
    position?: string;
    status: string;
    createdAt: string;
    company?: { id: string; name: string };
    department?: { id: string; name: string; code?: string } | null;
    workGroup?: { id: string; name: string; code?: string } | null;
    user?: { id: string; username?: string; role?: string } | null;
  };
  attendance: SectionResponse<{
    id: string;
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status: string;
    totalHours?: number | null;
  }>;
  departmentHistory: SectionResponse<{
    id: string;
    changedAt: string;
    fromDepartmentName?: string | null;
    toDepartmentName?: string | null;
    action: string;
    actor?: { id: string; name?: string; username?: string; email?: string } | null;
  }>;
  activity: SectionResponse<{
    id: string;
    action: string;
    scope: string;
    createdAt: string;
    actor?: { id: string; name?: string; username?: string; email?: string } | null;
  }>;
  lifecycle: {
    currentStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LEFT" | string;
    hiredAt?: string | null;
    terminatedAt?: string | null;
    terminationReason?: string | null;
    statusHistory: Array<{
      id: string;
      action: string;
      createdAt: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      actor?: { id: string; name?: string; username?: string; email?: string } | null;
    }>;
    roleHistory: Array<{
      id: string;
      action: string;
      createdAt: string;
      fromRoleName?: string | null;
      toRoleName?: string | null;
      actor?: { id: string; name?: string; username?: string; email?: string } | null;
    }>;
    loaded: boolean;
  };
  timeline: SectionResponse<{
    id: string;
    action: string;
    createdAt: string;
    actor?: { id: string; name?: string; username?: string; email?: string } | null;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
  }>;
  cache?: {
    hit: boolean;
    ttlMs: number;
  };
  generatedAt?: string;
};

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function isInvalidEmployeeId(id?: string) {
  if (!id) return true;
  const normalized = id.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "id" ||
    normalized === ":id" ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "nan" ||
    normalized.startsWith(":")
  );
}

export default function EmployeeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invalidId = isInvalidEmployeeId(id);

  const [loading, setLoading] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [data, setData] = useState<Employee360 | null>(null);
  const [activeTab, setActiveTab] = useState<"attendance" | "department-history" | "activity" | "lifecycle" | "timeline">("attendance");
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendancePageSize, setAttendancePageSize] = useState(10);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(10);
  const [lifecycleStatus, setLifecycleStatus] = useState<"ACTIVE" | "INACTIVE" | "SUSPENDED" | "LEFT">("ACTIVE");
  const [terminationReason, setTerminationReason] = useState("");

  const employee = data?.profile;

  const attendanceColumns = useMemo(
    () => [
      {
        title: "Date",
        dataIndex: "date",
        render: (value: string) => fmtDate(value),
      },
      {
        title: "Check In",
        dataIndex: "checkIn",
        render: (value: string | null) => fmtDateTime(value),
      },
      {
        title: "Check Out",
        dataIndex: "checkOut",
        render: (value: string | null) => fmtDateTime(value),
      },
      {
        title: "Hours",
        dataIndex: "totalHours",
        render: (value: number | null) => (value == null ? "-" : value),
      },
      {
        title: "Status",
        dataIndex: "status",
        render: (status: string) => <Tag color={status === "PRESENT" ? "green" : "blue"}>{status}</Tag>,
      },
    ],
    [],
  );

  const deptHistoryColumns = useMemo(
    () => [
      {
        title: "Changed At",
        dataIndex: "changedAt",
        render: (value: string) => fmtDateTime(value),
      },
      {
        title: "From",
        dataIndex: "fromDepartmentName",
        render: (value: string | null) => value || "Unassigned",
      },
      {
        title: "To",
        dataIndex: "toDepartmentName",
        render: (value: string | null) => value || "Unassigned",
      },
      {
        title: "Action",
        dataIndex: "action",
      },
      {
        title: "Operator",
        key: "actor",
        render: (_: unknown, record: any) =>
          record.actor?.name || record.actor?.username || record.actor?.email || "-",
      },
    ],
    [],
  );

  const activityColumns = useMemo(
    () => [
      {
        title: "Time",
        dataIndex: "createdAt",
        render: (value: string) => fmtDateTime(value),
      },
      {
        title: "Action",
        dataIndex: "action",
      },
      {
        title: "Scope",
        dataIndex: "scope",
      },
      {
        title: "Operator",
        key: "actor",
        render: (_: unknown, record: any) =>
          record.actor?.name || record.actor?.username || record.actor?.email || "-",
      },
    ],
    [],
  );

  const lifecycleStatusColumns = useMemo(
    () => [
      {
        title: "Time",
        dataIndex: "createdAt",
        render: (value: string) => fmtDateTime(value),
      },
      {
        title: "From",
        dataIndex: "fromStatus",
        render: (value: string | null) => value || "-",
      },
      {
        title: "To",
        dataIndex: "toStatus",
        render: (value: string | null) => (value ? <Tag>{value}</Tag> : "-"),
      },
      {
        title: "Action",
        dataIndex: "action",
      },
      {
        title: "Operator",
        key: "actor",
        render: (_: unknown, record: any) =>
          record.actor?.name || record.actor?.username || record.actor?.email || "-",
      },
    ],
    [],
  );

  const lifecycleRoleColumns = useMemo(
    () => [
      {
        title: "Time",
        dataIndex: "createdAt",
        render: (value: string) => fmtDateTime(value),
      },
      {
        title: "From Role",
        dataIndex: "fromRoleName",
        render: (value: string | null) => value || "-",
      },
      {
        title: "To Role",
        dataIndex: "toRoleName",
        render: (value: string | null) => value || "-",
      },
      {
        title: "Action",
        dataIndex: "action",
      },
      {
        title: "Operator",
        key: "actor",
        render: (_: unknown, record: any) =>
          record.actor?.name || record.actor?.username || record.actor?.email || "-",
      },
    ],
    [],
  );

  const timelineColumns = useMemo(
    () => [
      {
        title: "Time",
        dataIndex: "createdAt",
        render: (value: string) => fmtDateTime(value),
      },
      {
        title: "Action",
        dataIndex: "action",
      },
      {
        title: "Operator",
        key: "actor",
        render: (_: unknown, record: any) =>
          record.actor?.name || record.actor?.username || record.actor?.email || "-",
      },
      {
        title: "Summary",
        key: "summary",
        render: (_: unknown, record: any) => {
          const fromStatus = record?.beforeData?.status;
          const toStatus = record?.afterData?.status;
          if (fromStatus || toStatus) {
            return `${fromStatus || "-"} -> ${toStatus || "-"}`;
          }
          return "-";
        },
      },
    ],
    [],
  );

  useEffect(() => {
    if (!invalidId) return;
    message.warning("Invalid employee link. Redirected to employee list.");
    navigate("/employees", { replace: true });
  }, [invalidId, navigate]);

  useEffect(() => {
    if (!data?.lifecycle) return;
    const nextStatus = (data.lifecycle.currentStatus || "ACTIVE") as "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LEFT";
    setLifecycleStatus(nextStatus);
    setTerminationReason(data.lifecycle.terminationReason || "");
  }, [data?.lifecycle?.currentStatus, data?.lifecycle?.terminationReason]);

  useEffect(() => {
    if (!id || invalidId) return;

    const fetchReadModel = async () => {
      setLoading(true);
      try {
        const res = await getEmployee360(id, {
          includeAttendance: activeTab === "attendance",
          includeActivity: activeTab === "activity",
          includeDepartmentHistory: activeTab === "department-history",
          includeLifecycle: activeTab === "lifecycle",
          includeTimeline: activeTab === "timeline",
          attendancePage,
          attendancePageSize,
          activityPage,
          activityPageSize,
          departmentHistoryPage: historyPage,
          departmentHistoryPageSize: historyPageSize,
          timelinePage,
          timelinePageSize,
        });
        setData(res.data);
      } catch (error: any) {
        message.error(error?.response?.data?.message || "Failed to load employee details");
      } finally {
        setLoading(false);
      }
    };

    fetchReadModel();
  }, [id, invalidId, activeTab, attendancePage, attendancePageSize, activityPage, activityPageSize, historyPage, historyPageSize, timelinePage, timelinePageSize]);

  if (!id || invalidId) {
    return <Empty description="Missing employee id" />;
  }

  const handleLifecycleSave = async () => {
    try {
      setSavingLifecycle(true);
      await updateEmployeeLifecycle(id, {
        status: lifecycleStatus,
        terminationReason: lifecycleStatus === "LEFT" ? terminationReason || null : null,
      });
      message.success("Employee lifecycle updated");
      const refreshed = await getEmployee360(id, {
        includeLifecycle: true,
        includeTimeline: true,
        timelinePage,
        timelinePageSize,
      });
      setData((prev) => ({
        ...(prev || refreshed.data),
        ...refreshed.data,
      }));
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to update lifecycle");
    } finally {
      setSavingLifecycle(false);
    }
  };

  return (
    <Card loading={loading} variant="borderless">
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/employees")}>
            Back
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Employee Details
          </Typography.Title>
        </Space>

        {!employee ? (
          <Empty description="Employee not found" />
        ) : (
          <>
            <Card size="small" title="Profile">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Employee No">{employee.employeeNo || "-"}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={employee.status === "ACTIVE" ? "green" : "red"}>{employee.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Name">{employee.name}</Descriptions.Item>
                <Descriptions.Item label="Email">{employee.email || "-"}</Descriptions.Item>
                <Descriptions.Item label="Position">{employee.position || "-"}</Descriptions.Item>
                <Descriptions.Item label="User">{employee.user?.username || "-"}</Descriptions.Item>
                <Descriptions.Item label="Company">{employee.company?.name || "-"}</Descriptions.Item>
                <Descriptions.Item label="Department">{employee.department?.name || "Unassigned"}</Descriptions.Item>
                <Descriptions.Item label="Team">{employee.workGroup?.name || "Unassigned"}</Descriptions.Item>
                <Descriptions.Item label="Created At">{fmtDateTime(employee.createdAt)}</Descriptions.Item>
              </Descriptions>
              <Space style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">Read Model Cache:</Typography.Text>
                <Tag color={data?.cache?.hit ? "blue" : "green"}>
                  {data?.cache?.hit ? "CACHE HIT" : "LIVE"}
                </Tag>
                <Typography.Text type="secondary">
                  Generated: {fmtDateTime(data?.generatedAt)}
                </Typography.Text>
              </Space>
            </Card>

            <Segmented
              value={activeTab}
              onChange={(value) => setActiveTab(value as any)}
              options={[
                { label: "Attendance", value: "attendance" },
                { label: "Department History", value: "department-history" },
                { label: "Activity", value: "activity" },
                { label: "Lifecycle", value: "lifecycle" },
                { label: "Timeline", value: "timeline" },
              ]}
            />

            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as any)}
              items={[
                {
                  key: "attendance",
                  label: "Attendance",
                  children: data?.attendance?.items?.length ? (
                      <Table
                        rowKey="id"
                        columns={attendanceColumns as any}
                        dataSource={data.attendance.items}
                        pagination={{
                          current: data.attendance.page,
                          pageSize: data.attendance.pageSize,
                          total: data.attendance.total,
                          showSizeChanger: true,
                          onChange: (page, pageSize) => {
                            setAttendancePage(page);
                            setAttendancePageSize(pageSize);
                          },
                        }}
                      />
                    ) : (
                      <Empty description="No attendance records" />
                    ),
                },
                {
                  key: "department-history",
                  label: "Department History",
                  children: data?.departmentHistory?.items?.length ? (
                      <Table
                        rowKey="id"
                        columns={deptHistoryColumns as any}
                        dataSource={data.departmentHistory.items}
                        pagination={{
                          current: data.departmentHistory.page,
                          pageSize: data.departmentHistory.pageSize,
                          total: data.departmentHistory.total,
                          showSizeChanger: true,
                          onChange: (page, pageSize) => {
                            setHistoryPage(page);
                            setHistoryPageSize(pageSize);
                          },
                        }}
                      />
                    ) : (
                      <Empty description="No department history yet" />
                    ),
                },
                {
                  key: "activity",
                  label: "Activity",
                  children: data?.activity?.items?.length ? (
                      <Table
                        rowKey="id"
                        columns={activityColumns as any}
                        dataSource={data.activity.items}
                        pagination={{
                          current: data.activity.page,
                          pageSize: data.activity.pageSize,
                          total: data.activity.total,
                          showSizeChanger: true,
                          onChange: (page, pageSize) => {
                            setActivityPage(page);
                            setActivityPageSize(pageSize);
                          },
                        }}
                      />
                    ) : (
                      <Empty description="No activity logs" />
                    ),
                },
                {
                  key: "lifecycle",
                  label: "Lifecycle",
                  children: (
                    <Space direction="vertical" style={{ width: "100%" }} size={16}>
                      <Card size="small" title="Lifecycle State">
                        <Space wrap>
                          <Select
                            value={lifecycleStatus}
                            style={{ width: 220 }}
                            onChange={(value) => setLifecycleStatus(value)}
                            options={[
                              { label: "ACTIVE", value: "ACTIVE" },
                              { label: "INACTIVE", value: "INACTIVE" },
                              { label: "SUSPENDED", value: "SUSPENDED" },
                              { label: "LEFT", value: "LEFT" },
                            ]}
                          />
                          <Input
                            placeholder="Termination reason"
                            style={{ width: 320 }}
                            disabled={lifecycleStatus !== "LEFT"}
                            value={terminationReason}
                            onChange={(e) => setTerminationReason(e.target.value)}
                          />
                          <Button type="primary" loading={savingLifecycle} onClick={handleLifecycleSave}>
                            Save Lifecycle
                          </Button>
                        </Space>
                        <Space style={{ marginTop: 12 }} wrap>
                          <Tag color="blue">Current: {data?.lifecycle?.currentStatus || "-"}</Tag>
                          <Typography.Text type="secondary">
                            Hired At: {fmtDateTime(data?.lifecycle?.hiredAt)}
                          </Typography.Text>
                          <Typography.Text type="secondary">
                            Terminated At: {fmtDateTime(data?.lifecycle?.terminatedAt)}
                          </Typography.Text>
                        </Space>
                      </Card>

                      <Card size="small" title="Status History">
                        {data?.lifecycle?.statusHistory?.length ? (
                          <Table
                            rowKey="id"
                            columns={lifecycleStatusColumns as any}
                            dataSource={data.lifecycle.statusHistory}
                            pagination={false}
                          />
                        ) : (
                          <Empty description="No lifecycle status history" />
                        )}
                      </Card>

                      <Card size="small" title="Role History">
                        {data?.lifecycle?.roleHistory?.length ? (
                          <Table
                            rowKey="id"
                            columns={lifecycleRoleColumns as any}
                            dataSource={data.lifecycle.roleHistory}
                            pagination={false}
                          />
                        ) : (
                          <Empty description="No role history" />
                        )}
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: "timeline",
                  label: "Timeline",
                  children: data?.timeline?.items?.length ? (
                    <Table
                      rowKey="id"
                      columns={timelineColumns as any}
                      dataSource={data.timeline.items}
                      pagination={{
                        current: data.timeline.page,
                        pageSize: data.timeline.pageSize,
                        total: data.timeline.total,
                        showSizeChanger: true,
                        onChange: (page, pageSize) => {
                          setTimelinePage(page);
                          setTimelinePageSize(pageSize);
                        },
                      }}
                    />
                  ) : (
                    <Empty description="No timeline events" />
                  ),
                },
              ]}
            />
          </>
        )}
      </Space>
    </Card>
  );
}
