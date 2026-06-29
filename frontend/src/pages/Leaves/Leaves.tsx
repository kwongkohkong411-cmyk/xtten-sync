import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import PageHeader from "../../components/ui/PageHeader/PageHeader";
import SearchBar from "../../components/ui/SearchBar";
import { createLeave, getLeaves, updateLeave } from "@/api/leaves";
import { getUsers } from "@/api/users";
import { hasPermission } from "@/utils/auth";

type LeaveRequest = {
  id: string;
  employeeId?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type LeaveTypeItem = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

type LeaveBalanceItem = {
  id: string;
  leaveTypeCode: string;
  period: "MONTHLY" | "YEARLY";
  days: number;
  carryForward: boolean;
};

type UserOption = {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  companyId?: string | null;
};

type StoredLeaveSettings = {
  types: LeaveTypeItem[];
  balances: LeaveBalanceItem[];
  approverIds: string[];
};

const DEFAULT_LEAVE_TYPES: LeaveTypeItem[] = [
  { id: "lt-annual", name: "Annual Leave", code: "ANNUAL", active: true },
  { id: "lt-medical", name: "Medical Leave", code: "MEDICAL", active: true },
  { id: "lt-emergency", name: "Emergency Leave", code: "EMERGENCY", active: true },
  { id: "lt-unpaid", name: "Unpaid Leave", code: "UNPAID", active: true },
  { id: "lt-marriage", name: "Marriage Leave", code: "MARRIAGE", active: true },
  { id: "lt-replacement", name: "Replacement Leave", code: "REPLACEMENT", active: true },
];

function settingsStorageKey(companyId?: string) {
  return `xtten_leave_settings_${companyId || "global"}`;
}

function formatRange(startDate: string, endDate: string) {
  return `${dayjs(startDate).format("YYYY-MM-DD")} - ${dayjs(endDate).format("YYYY-MM-DD")}`;
}

function getStatusColor(status: LeaveRequest["status"]) {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  return "orange";
}

export default function Leaves() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchText, setSearchText] = useState("");

  const [rootTab, setRootTab] = useState<"requests" | "settings">("requests");
  const [requestTab, setRequestTab] = useState<"apply" | "all" | "pending">("all");
  const [settingsTab, setSettingsTab] = useState<"types" | "balances" | "approvers">("types");

  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>(DEFAULT_LEAVE_TYPES);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalanceItem[]>([]);
  const [leaveApproverIds, setLeaveApproverIds] = useState<string[]>([]);

  const [applyForm] = Form.useForm();
  const [typeForm] = Form.useForm();
  const [balanceForm] = Form.useForm();

  const currentCompanyId = localStorage.getItem("company_id") || undefined;
  const canApplyLeave = hasPermission("leave:apply") || hasPermission("leave:submit") || hasPermission("leave:manage");
  const canApproveLeave = hasPermission("leave:approve") || hasPermission("leave:manage");
  const canEditSettings = hasPermission("leave:edit_settings") || hasPermission("leave:manage");
  const canViewSettings = hasPermission("leave:view_settings") || canEditSettings;

  const settingsReadyRef = useRef(false);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getLeaves();
      setLeaves(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Unable to load leave requests");
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const response = await getUsers();
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void loadLeaves();
    void loadUsers();
  }, [loadLeaves, loadUsers]);

  useEffect(() => {
    const key = settingsStorageKey(currentCompanyId);
    const raw = localStorage.getItem(key);

    if (!raw) {
      settingsReadyRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredLeaveSettings>;
      setLeaveTypes(Array.isArray(parsed.types) && parsed.types.length ? parsed.types : DEFAULT_LEAVE_TYPES);
      setLeaveBalances(Array.isArray(parsed.balances) ? parsed.balances : []);
      setLeaveApproverIds(Array.isArray(parsed.approverIds) ? parsed.approverIds : []);
    } catch {
      setLeaveTypes(DEFAULT_LEAVE_TYPES);
      setLeaveBalances([]);
      setLeaveApproverIds([]);
    } finally {
      settingsReadyRef.current = true;
    }
  }, [currentCompanyId]);

  useEffect(() => {
    if (!settingsReadyRef.current) return;

    const payload: StoredLeaveSettings = {
      types: leaveTypes,
      balances: leaveBalances,
      approverIds: leaveApproverIds,
    };

    localStorage.setItem(settingsStorageKey(currentCompanyId), JSON.stringify(payload));
  }, [currentCompanyId, leaveTypes, leaveBalances, leaveApproverIds]);

  const activeLeaveTypes = useMemo(
    () => leaveTypes.filter((item) => item.active),
    [leaveTypes],
  );

  const companyUsers = useMemo(() => {
    if (!currentCompanyId) return users;
    return users.filter((user) => !user.companyId || user.companyId === currentCompanyId);
  }, [users, currentCompanyId]);

  const approverRows = useMemo(() => {
    return leaveApproverIds
      .map((id) => {
        const user = companyUsers.find((item) => item.id === id);
        if (!user) return null;
        return {
          id,
          name: user.name || user.username || user.id,
          role: user.role || "-",
        };
      })
      .filter((item): item is { id: string; name: string; role: string } => Boolean(item));
  }, [leaveApproverIds, companyUsers]);

  const filteredAllRequests = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return leaves;

    return leaves.filter((item) => {
      return (
        item.type?.toLowerCase().includes(keyword) ||
        item.status?.toLowerCase().includes(keyword) ||
        item.reason?.toLowerCase().includes(keyword) ||
        formatRange(item.startDate, item.endDate).toLowerCase().includes(keyword)
      );
    });
  }, [leaves, searchText]);

  const filteredPendingRequests = useMemo(
    () => filteredAllRequests.filter((item) => item.status === "PENDING"),
    [filteredAllRequests],
  );

  const submitApplyLeave = async () => {
    try {
      const values = await applyForm.validateFields();
      const startDate = (values.startDate as Dayjs).format("YYYY-MM-DD");
      const endDate = (values.endDate as Dayjs).format("YYYY-MM-DD");

      setSaving(true);
      await createLeave({
        type: values.type,
        startDate,
        endDate,
        reason: values.reason,
      });

      message.success("Leave request submitted");
      applyForm.resetFields();
      setRequestTab("all");
      await loadLeaves();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || "Failed to submit leave request");
    } finally {
      setSaving(false);
    }
  };

  const changeLeaveStatus = async (id: string, status: LeaveRequest["status"]) => {
    try {
      await updateLeave(id, { status });
      message.success("Leave status updated");
      await loadLeaves();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to update leave status");
    }
  };

  const addLeaveType = async () => {
    try {
      const values = await typeForm.validateFields();
      const code = String(values.code).trim().toUpperCase();
      const name = String(values.name).trim();

      const exists = leaveTypes.some((item) => item.code === code || item.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        message.warning("Leave type already exists");
        return;
      }

      setLeaveTypes((prev) => [
        ...prev,
        {
          id: `lt-${Date.now()}`,
          name,
          code,
          active: true,
        },
      ]);

      typeForm.resetFields();
      message.success("Leave type added");
    } catch {
      // Form validation handles errors.
    }
  };

  const addLeaveBalance = async () => {
    try {
      const values = await balanceForm.validateFields();
      setLeaveBalances((prev) => [
        ...prev,
        {
          id: `lb-${Date.now()}`,
          leaveTypeCode: values.leaveTypeCode,
          period: values.period,
          days: Number(values.days),
          carryForward: Boolean(values.carryForward),
        },
      ]);
      balanceForm.resetFields();
      message.success("Leave balance setting added");
    } catch {
      // Form validation handles errors.
    }
  };

  const requestColumns = [
    { title: "Type", dataIndex: "type", key: "type" },
    {
      title: "Period",
      key: "period",
      render: (_: unknown, record: LeaveRequest) => formatRange(record.startDate, record.endDate),
    },
    { title: "Reason", dataIndex: "reason", key: "reason", render: (v: string) => v || "-" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: LeaveRequest["status"]) => <Tag color={getStatusColor(status)}>{status}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, record: LeaveRequest) => {
        if (!canApproveLeave) return <Tag>{record.status}</Tag>;

        return (
          <Space>
            <Button
              type="primary"
              size="small"
              disabled={record.status === "APPROVED"}
              onClick={() => changeLeaveStatus(record.id, "APPROVED")}
            >
              Approve
            </Button>
            <Button
              danger
              size="small"
              disabled={record.status === "REJECTED"}
              onClick={() => changeLeaveStatus(record.id, "REJECTED")}
            >
              Reject
            </Button>
          </Space>
        );
      },
    },
  ];

  const leaveTypeColumns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Code", dataIndex: "code", key: "code" },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, record: LeaveTypeItem) => (
        <Badge status={record.active ? "success" : "default"} text={record.active ? "Active" : "Inactive"} />
      ),
    },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, record: LeaveTypeItem) => (
        <Space>
          <Button
            size="small"
            disabled={!canEditSettings}
            onClick={() => {
              setLeaveTypes((prev) =>
                prev.map((item) => (item.id === record.id ? { ...item, active: !item.active } : item)),
              );
            }}
          >
            {record.active ? "Disable" : "Enable"}
          </Button>
          <Popconfirm
            title="Delete this leave type?"
            disabled={!canEditSettings}
            onConfirm={() => {
              setLeaveTypes((prev) => prev.filter((item) => item.id !== record.id));
              setLeaveBalances((prev) => prev.filter((item) => item.leaveTypeCode !== record.code));
            }}
          >
            <Button danger size="small" disabled={!canEditSettings}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const leaveBalanceColumns = [
    {
      title: "Leave Type",
      dataIndex: "leaveTypeCode",
      key: "leaveTypeCode",
      render: (value: string) => {
        const matched = leaveTypes.find((item) => item.code === value);
        return matched ? matched.name : value;
      },
    },
    {
      title: "Policy",
      key: "policy",
      render: (_: unknown, record: LeaveBalanceItem) => (
        <span>{record.period === "MONTHLY" ? "Monthly" : "Yearly"}</span>
      ),
    },
    {
      title: "Days",
      dataIndex: "days",
      key: "days",
      render: (days: number) => `${days} Day${days > 1 ? "s" : ""}`,
    },
    {
      title: "Carry Forward",
      dataIndex: "carryForward",
      key: "carryForward",
      render: (carryForward: boolean) => <Tag color={carryForward ? "green" : "default"}>{carryForward ? "Yes" : "No"}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, record: LeaveBalanceItem) => (
        <Popconfirm
          title="Delete this leave balance setting?"
          disabled={!canEditSettings}
          onConfirm={() => setLeaveBalances((prev) => prev.filter((item) => item.id !== record.id))}
        >
          <Button danger size="small" disabled={!canEditSettings}>Delete</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Leave"
        subtitle="Apply leave, manage requests, and configure leave settings"
        extra={
          <Space>
            <Button onClick={() => void loadLeaves()}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRequestTab("apply")}>
              Apply Leave
            </Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Tabs
          activeKey={rootTab}
          onChange={(key) => setRootTab(key as "requests" | "settings")}
          items={[
            { key: "requests", label: "Leave Request" },
            { key: "settings", label: "Leave Settings" },
          ]}
        />
      </Card>

      {rootTab === "requests" ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchBar
              placeholder="Search leave requests..."
              onChange={(value) => setSearchText(value)}
              width={360}
            />
          </div>

          <Card style={{ marginBottom: 16, borderRadius: 16 }}>
            <Tabs
              activeKey={requestTab}
              onChange={(key) => setRequestTab(key as "apply" | "all" | "pending")}
              items={[
                { key: "apply", label: "Apply Leave" },
                { key: "all", label: "All Requests" },
                { key: "pending", label: "Pending Approval" },
              ]}
            />
          </Card>

          {requestTab === "apply" ? (
            <Card title="Apply Leave" style={{ borderRadius: 16 }}>
              {!canApplyLeave ? (
                <Empty description="No permission to apply leave" />
              ) : (
                <Form form={applyForm} layout="vertical" style={{ maxWidth: 520 }}>
                  <Form.Item
                    label="Leave Type"
                    name="type"
                    rules={[{ required: true, message: "Please choose leave type" }]}
                  >
                    <Select
                      placeholder="Select leave type"
                      options={activeLeaveTypes.map((item) => ({ label: item.name, value: item.code }))}
                    />
                  </Form.Item>

                  <Space align="start" style={{ width: "100%" }}>
                    <Form.Item
                      label="Start Date"
                      name="startDate"
                      rules={[{ required: true, message: "Please choose start date" }]}
                    >
                      <DatePicker style={{ width: 220 }} />
                    </Form.Item>

                    <Form.Item
                      label="End Date"
                      name="endDate"
                      rules={[{ required: true, message: "Please choose end date" }]}
                    >
                      <DatePicker style={{ width: 220 }} />
                    </Form.Item>
                  </Space>

                  <Form.Item label="Reason" name="reason">
                    <Input.TextArea rows={4} placeholder="Add reason or notes" />
                  </Form.Item>

                  <Form.Item>
                    <Space>
                      <Button type="primary" loading={saving} onClick={() => void submitApplyLeave()}>
                        Submit
                      </Button>
                      <Button onClick={() => applyForm.resetFields()}>Reset</Button>
                    </Space>
                  </Form.Item>
                </Form>
              )}
            </Card>
          ) : (
            <Card style={{ borderRadius: 16 }}>
              <Table
                rowKey="id"
                loading={loading}
                dataSource={requestTab === "pending" ? filteredPendingRequests : filteredAllRequests}
                columns={requestColumns}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: "No leave requests found" }}
              />
            </Card>
          )}
        </>
      ) : (
        <>
          {!canViewSettings ? (
            <Card style={{ borderRadius: 16 }}>
              <Empty description="No permission to view leave settings" />
            </Card>
          ) : (
            <>
              <Card style={{ marginBottom: 16, borderRadius: 16 }}>
                <Tabs
                  activeKey={settingsTab}
                  onChange={(key) => setSettingsTab(key as "types" | "balances" | "approvers")}
                  items={[
                    { key: "types", label: "Leave Types" },
                    { key: "balances", label: "Leave Balance" },
                    { key: "approvers", label: "Leave Approvers" },
                  ]}
                />
              </Card>

              {settingsTab === "types" && (
                <Card title="Leave Types" style={{ borderRadius: 16 }}>
                  <Space style={{ width: "100%", marginBottom: 16 }} wrap>
                    <Form form={typeForm} layout="inline">
                      <Form.Item
                        name="name"
                        rules={[{ required: true, message: "Name required" }]}
                      >
                        <Input placeholder="Type name (e.g. Annual Leave)" style={{ width: 260 }} />
                      </Form.Item>
                      <Form.Item
                        name="code"
                        rules={[{ required: true, message: "Code required" }]}
                      >
                        <Input placeholder="Code (e.g. ANNUAL)" style={{ width: 200 }} />
                      </Form.Item>
                      <Form.Item>
                        <Button type="primary" disabled={!canEditSettings} onClick={() => void addLeaveType()}>
                          Add Type
                        </Button>
                      </Form.Item>
                    </Form>
                  </Space>

                  <Table rowKey="id" dataSource={leaveTypes} columns={leaveTypeColumns} pagination={false} />
                </Card>
              )}

              {settingsTab === "balances" && (
                <Card title="Leave Balance" style={{ borderRadius: 16 }}>
                  <Typography.Paragraph type="secondary">
                    Examples: Monthly 2 Days with carry forward, or Yearly 14 Days.
                  </Typography.Paragraph>

                  <Space style={{ width: "100%", marginBottom: 16 }} wrap>
                    <Form form={balanceForm} layout="inline" initialValues={{ period: "MONTHLY", carryForward: true }}>
                      <Form.Item
                        name="leaveTypeCode"
                        rules={[{ required: true, message: "Leave type required" }]}
                      >
                        <Select
                          placeholder="Leave type"
                          style={{ width: 220 }}
                          options={leaveTypes.map((item) => ({ label: item.name, value: item.code }))}
                        />
                      </Form.Item>

                      <Form.Item
                        name="period"
                        rules={[{ required: true, message: "Period required" }]}
                      >
                        <Select
                          style={{ width: 140 }}
                          options={[
                            { label: "Monthly", value: "MONTHLY" },
                            { label: "Yearly", value: "YEARLY" },
                          ]}
                        />
                      </Form.Item>

                      <Form.Item
                        name="days"
                        rules={[{ required: true, message: "Days required" }]}
                      >
                        <InputNumber min={0} max={365} placeholder="Days" style={{ width: 120 }} />
                      </Form.Item>

                      <Form.Item name="carryForward" valuePropName="checked">
                        <Switch checkedChildren="Carry Yes" unCheckedChildren="Carry No" />
                      </Form.Item>

                      <Form.Item>
                        <Button type="primary" disabled={!canEditSettings} onClick={() => void addLeaveBalance()}>
                          Add Balance
                        </Button>
                      </Form.Item>
                    </Form>
                  </Space>

                  <Table rowKey="id" dataSource={leaveBalances} columns={leaveBalanceColumns} pagination={false} />
                </Card>
              )}

              {settingsTab === "approvers" && (
                <Card title="Leave Approvers" style={{ borderRadius: 16 }}>
                  <Typography.Paragraph type="secondary">
                    Multiple approvers are supported for company leave approval.
                  </Typography.Paragraph>

                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Select
                      mode="multiple"
                      allowClear
                      disabled={!canEditSettings}
                      value={leaveApproverIds}
                      onChange={setLeaveApproverIds}
                      style={{ width: "100%", maxWidth: 720 }}
                      placeholder="Select leave approvers"
                      options={companyUsers.map((user) => ({
                        value: user.id,
                        label: `${user.name || user.username || user.id} (${user.role || "-"})`,
                      }))}
                    />

                    <Table
                      rowKey="id"
                      dataSource={approverRows}
                      pagination={false}
                      columns={[
                        { title: "Name", dataIndex: "name" },
                        { title: "Role", dataIndex: "role" },
                        {
                          title: "Action",
                          render: (_: unknown, row: { id: string }) => (
                            <Button
                              danger
                              size="small"
                              disabled={!canEditSettings}
                              onClick={() => setLeaveApproverIds((prev) => prev.filter((id) => id !== row.id))}
                            >
                              Remove
                            </Button>
                          ),
                        },
                      ]}
                      locale={{ emptyText: "No leave approvers configured" }}
                    />
                  </Space>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
