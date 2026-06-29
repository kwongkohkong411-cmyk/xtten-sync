import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader/PageHeader';
import SearchBar from '../../components/ui/SearchBar';
import { createLeave, getLeaves, updateLeave } from '@/api/leaves';
import { getUsers } from '@/api/users';
import {
  createLeaveApprover,
  createLeaveBalanceSetting,
  createLeaveType,
  deleteLeaveApprover,
  deleteLeaveBalanceSetting,
  deleteLeaveType,
  getLeaveApprovers,
  getLeaveBalanceSettings,
  getLeaveTypes,
  updateLeaveApprover,
  updateLeaveBalanceSetting,
  updateLeaveType,
  type LeaveApproverDto,
  type LeaveBalanceSettingDto,
  type LeaveTypeCategory,
  type LeaveTypeDto,
} from '@/api/leave-settings';
import { hasPermission } from '@/utils/auth';

type LeaveRequest = {
  id: string;
  employeeId?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type UserOption = {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  companyId?: string | null;
};

function formatRange(startDate: string, endDate: string) {
  return `${dayjs(startDate).format('YYYY-MM-DD')} - ${dayjs(endDate).format('YYYY-MM-DD')}`;
}

function getStatusColor(status: LeaveRequest['status']) {
  if (status === 'APPROVED') return 'green';
  if (status === 'REJECTED') return 'red';
  return 'orange';
}

export default function Leaves() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentCompanyId = localStorage.getItem('company_id') || undefined;

  const [loading, setLoading] = useState(false);
  const [settingLoading, setSettingLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalanceSettingDto[]>([]);
  const [leaveApprovers, setLeaveApprovers] = useState<LeaveApproverDto[]>([]);

  const [searchText, setSearchText] = useState('');
  const [rootTab, setRootTab] = useState<'requests' | 'settings'>('requests');
  const [requestTab, setRequestTab] = useState<'apply' | 'all' | 'pending'>('all');
  const [settingsTab, setSettingsTab] = useState<'types' | 'balances' | 'approvers'>('types');

  const [applyForm] = Form.useForm();
  const [typeForm] = Form.useForm();
  const [balanceForm] = Form.useForm();
  const [approverForm] = Form.useForm();

  const canApplyLeave = hasPermission('leave:apply') || hasPermission('leave:manage');
  const canApproveLeave = hasPermission('leave:approve') || hasPermission('leave:manage');
  const canEditSettings = hasPermission('leave:edit_settings') || hasPermission('leave:manage');
  const canViewSettings = hasPermission('leave:view_settings') || canEditSettings;

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getLeaves();
      setLeaves(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Unable to load leave requests');
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

  const loadLeaveSettings = useCallback(async () => {
    if (!canViewSettings) return;

    setSettingLoading(true);
    try {
      const [typesRes, balancesRes, approversRes] = await Promise.all([
        getLeaveTypes(currentCompanyId),
        getLeaveBalanceSettings(currentCompanyId),
        getLeaveApprovers(currentCompanyId),
      ]);

      setLeaveTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
      setLeaveBalances(Array.isArray(balancesRes.data) ? balancesRes.data : []);
      setLeaveApprovers(Array.isArray(approversRes.data) ? approversRes.data : []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Unable to load leave settings');
      setLeaveTypes([]);
      setLeaveBalances([]);
      setLeaveApprovers([]);
    } finally {
      setSettingLoading(false);
    }
  }, [canViewSettings, currentCompanyId]);

  useEffect(() => {
    void loadLeaves();
    void loadUsers();
  }, [loadLeaves, loadUsers]);

  useEffect(() => {
    if (location.pathname.startsWith('/leave-settings')) {
      setRootTab('settings');
      void loadLeaveSettings();
      return;
    }

    setRootTab('requests');
  }, [location.pathname, loadLeaveSettings]);

  const activeLeaveTypes = useMemo(() => leaveTypes.filter((item) => item.active), [leaveTypes]);

  const companyUsers = useMemo(() => {
    if (!currentCompanyId) return users;
    return users.filter((user) => !user.companyId || user.companyId === currentCompanyId);
  }, [users, currentCompanyId]);

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
    () => filteredAllRequests.filter((item) => item.status === 'PENDING'),
    [filteredAllRequests],
  );

  const submitApplyLeave = async () => {
    try {
      const values = await applyForm.validateFields();
      const startDate = (values.startDate as Dayjs).format('YYYY-MM-DD');
      const endDate = (values.endDate as Dayjs).format('YYYY-MM-DD');

      setSaving(true);
      await createLeave({
        type: values.type,
        startDate,
        endDate,
        reason: values.reason,
      });

      message.success('Leave request submitted');
      applyForm.resetFields();
      setRequestTab('all');
      await loadLeaves();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to submit leave request');
    } finally {
      setSaving(false);
    }
  };

  const changeLeaveStatus = async (id: string, status: LeaveRequest['status']) => {
    try {
      await updateLeave(id, { status });
      message.success('Leave status updated');
      await loadLeaves();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to update leave status');
    }
  };

  const handleCreateLeaveType = async () => {
    try {
      const values = await typeForm.validateFields();
      await createLeaveType({
        companyId: currentCompanyId,
        name: String(values.name).trim(),
        category: values.category as LeaveTypeCategory,
        active: Boolean(values.active),
      });
      message.success('Leave type added');
      typeForm.resetFields();
      await loadLeaveSettings();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to add leave type');
    }
  };

  const handleCreateBalance = async () => {
    try {
      const values = await balanceForm.validateFields();
      await createLeaveBalanceSetting({
        companyId: currentCompanyId,
        leaveTypeId: values.leaveTypeId,
        period: values.period,
        days: Number(values.days),
        active: Boolean(values.active),
      });
      message.success('Leave balance setting added');
      balanceForm.resetFields();
      await loadLeaveSettings();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to add leave balance setting');
    }
  };

  const handleCreateApprover = async () => {
    try {
      const values = await approverForm.validateFields();
      await createLeaveApprover({
        companyId: currentCompanyId,
        employeeId: values.employeeId,
        active: Boolean(values.active),
      });
      message.success('Leave approver added');
      approverForm.resetFields();
      await loadLeaveSettings();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to add leave approver');
    }
  };

  const requestColumns = [
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Period',
      key: 'period',
      render: (_: unknown, record: LeaveRequest) => formatRange(record.startDate, record.endDate),
    },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (v: string) => v || '-' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: LeaveRequest['status']) => <Tag color={getStatusColor(status)}>{status}</Tag>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: LeaveRequest) => {
        if (!canApproveLeave) return <Tag>{record.status}</Tag>;

        return (
          <Space>
            <Button
              type='primary'
              size='small'
              disabled={record.status === 'APPROVED'}
              onClick={() => changeLeaveStatus(record.id, 'APPROVED')}
            >
              Approve
            </Button>
            <Button
              danger
              size='small'
              disabled={record.status === 'REJECTED'}
              onClick={() => changeLeaveStatus(record.id, 'REJECTED')}
            >
              Reject
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title='Leave'
        subtitle='Apply leave, manage requests, and configure leave settings'
        extra={
          <Space>
            <Button onClick={() => void loadLeaves()}>Refresh</Button>
            <Button
              type='primary'
              icon={<PlusOutlined />}
              onClick={() => {
                setRequestTab('apply');
                navigate('/leave-requests');
              }}
            >
              Apply Leave
            </Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Tabs
          activeKey={rootTab}
          onChange={(key) => navigate(key === 'settings' ? '/leave-settings' : '/leave-requests')}
          items={[
            { key: 'requests', label: 'Leave Request' },
            { key: 'settings', label: 'Leave Settings' },
          ]}
        />
      </Card>

      {rootTab === 'requests' ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchBar
              placeholder='Search leave requests...'
              onChange={(value) => setSearchText(value)}
              width={360}
            />
          </div>

          <Card style={{ marginBottom: 16, borderRadius: 16 }}>
            <Tabs
              activeKey={requestTab}
              onChange={(key) => setRequestTab(key as 'apply' | 'all' | 'pending')}
              items={[
                { key: 'apply', label: 'Apply Leave' },
                { key: 'all', label: 'All Requests' },
                { key: 'pending', label: 'Pending Approval' },
              ]}
            />
          </Card>

          {requestTab === 'apply' ? (
            <Card title='Apply Leave' style={{ borderRadius: 16 }}>
              {!canApplyLeave ? (
                <Empty description='No permission to apply leave' />
              ) : (
                <Form form={applyForm} layout='vertical' style={{ maxWidth: 520 }}>
                  <Form.Item
                    label='Leave Type'
                    name='type'
                    rules={[{ required: true, message: 'Please choose leave type' }]}
                  >
                    <Select
                      placeholder='Select leave type'
                      options={activeLeaveTypes.map((item) => ({ label: item.name, value: item.name }))}
                    />
                  </Form.Item>

                  <Space align='start' style={{ width: '100%' }}>
                    <Form.Item
                      label='Start Date'
                      name='startDate'
                      rules={[{ required: true, message: 'Please choose start date' }]}
                    >
                      <DatePicker style={{ width: 220 }} />
                    </Form.Item>

                    <Form.Item
                      label='End Date'
                      name='endDate'
                      rules={[{ required: true, message: 'Please choose end date' }]}
                    >
                      <DatePicker style={{ width: 220 }} />
                    </Form.Item>
                  </Space>

                  <Form.Item label='Reason' name='reason'>
                    <Input.TextArea rows={4} placeholder='Add reason or notes' />
                  </Form.Item>

                  <Form.Item>
                    <Space>
                      <Button type='primary' loading={saving} onClick={() => void submitApplyLeave()}>
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
                rowKey='id'
                loading={loading}
                dataSource={requestTab === 'pending' ? filteredPendingRequests : filteredAllRequests}
                columns={requestColumns}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No leave requests found' }}
              />
            </Card>
          )}
        </>
      ) : (
        <>
          {!canViewSettings ? (
            <Card style={{ borderRadius: 16 }}>
              <Empty description='No permission to view leave settings' />
            </Card>
          ) : (
            <>
              <Card style={{ marginBottom: 16, borderRadius: 16 }}>
                <Tabs
                  activeKey={settingsTab}
                  onChange={(key) => setSettingsTab(key as 'types' | 'balances' | 'approvers')}
                  items={[
                    { key: 'types', label: 'Leave Types' },
                    { key: 'balances', label: 'Leave Balance' },
                    { key: 'approvers', label: 'Leave Approvers' },
                  ]}
                />
              </Card>

              {settingsTab === 'types' && (
                <Card title='Leave Types' style={{ borderRadius: 16 }} loading={settingLoading}>
                  <Space style={{ width: '100%', marginBottom: 16 }} wrap>
                    <Form form={typeForm} layout='inline' initialValues={{ category: 'PAID', active: true }}>
                      <Form.Item
                        name='name'
                        rules={[{ required: true, message: 'Name required' }]}
                      >
                        <Input placeholder='Type name (e.g. Annual Leave)' style={{ width: 260 }} />
                      </Form.Item>

                      <Form.Item
                        name='category'
                        rules={[{ required: true, message: 'Category required' }]}
                      >
                        <Select
                          style={{ width: 140 }}
                          options={[
                            { label: 'PAID', value: 'PAID' },
                            { label: 'UNPAID', value: 'UNPAID' },
                          ]}
                        />
                      </Form.Item>

                      <Form.Item name='active' valuePropName='checked'>
                        <Switch checkedChildren='Active' unCheckedChildren='Inactive' />
                      </Form.Item>

                      <Form.Item>
                        <Button type='primary' disabled={!canEditSettings} onClick={() => void handleCreateLeaveType()}>
                          Add Type
                        </Button>
                      </Form.Item>
                    </Form>
                  </Space>

                  <Table
                    rowKey='id'
                    dataSource={leaveTypes}
                    pagination={false}
                    columns={[
                      { title: 'Name', dataIndex: 'name' },
                      { title: 'Category', dataIndex: 'category' },
                      {
                        title: 'Status',
                        render: (_: unknown, row: LeaveTypeDto) => (
                          <Badge status={row.active ? 'success' : 'default'} text={row.active ? 'Active' : 'Inactive'} />
                        ),
                      },
                      {
                        title: 'Action',
                        render: (_: unknown, row: LeaveTypeDto) => (
                          <Space>
                            <Button
                              size='small'
                              disabled={!canEditSettings}
                              onClick={async () => {
                                await updateLeaveType(row.id, { active: !row.active });
                                await loadLeaveSettings();
                              }}
                            >
                              {row.active ? 'Disable' : 'Enable'}
                            </Button>
                            <Popconfirm
                              title='Delete this leave type?'
                              disabled={!canEditSettings}
                              onConfirm={async () => {
                                await deleteLeaveType(row.id);
                                await loadLeaveSettings();
                              }}
                            >
                              <Button danger size='small' disabled={!canEditSettings}>Delete</Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}

              {settingsTab === 'balances' && (
                <Card title='Leave Balance' style={{ borderRadius: 16 }} loading={settingLoading}>
                  <Typography.Paragraph type='secondary'>
                    Examples: Monthly 2 Days with carry forward, or Yearly 14 Days.
                  </Typography.Paragraph>

                  <Space style={{ width: '100%', marginBottom: 16 }} wrap>
                    <Form form={balanceForm} layout='inline' initialValues={{ period: 'MONTHLY', active: true }}>
                      <Form.Item
                        name='leaveTypeId'
                        rules={[{ required: true, message: 'Leave type required' }]}
                      >
                        <Select
                          placeholder='Leave type'
                          style={{ width: 220 }}
                          options={leaveTypes.map((item) => ({ label: item.name, value: item.id }))}
                        />
                      </Form.Item>

                      <Form.Item
                        name='period'
                        rules={[{ required: true, message: 'Period required' }]}
                      >
                        <Select
                          style={{ width: 140 }}
                          options={[
                            { label: 'MONTHLY', value: 'MONTHLY' },
                            { label: 'YEARLY', value: 'YEARLY' },
                          ]}
                        />
                      </Form.Item>

                      <Form.Item
                        name='days'
                        rules={[{ required: true, message: 'Days required' }]}
                      >
                        <InputNumber min={0} max={365} placeholder='Days' style={{ width: 120 }} />
                      </Form.Item>

                      <Form.Item name='active' valuePropName='checked'>
                        <Switch checkedChildren='Active' unCheckedChildren='Inactive' />
                      </Form.Item>

                      <Form.Item>
                        <Button type='primary' disabled={!canEditSettings} onClick={() => void handleCreateBalance()}>
                          Add Balance
                        </Button>
                      </Form.Item>
                    </Form>
                  </Space>

                  <Table
                    rowKey='id'
                    dataSource={leaveBalances}
                    pagination={false}
                    columns={[
                      {
                        title: 'Leave Type',
                        render: (_: unknown, row: LeaveBalanceSettingDto) => row.leaveType?.name || row.leaveTypeId,
                      },
                      { title: 'Period', dataIndex: 'period' },
                      {
                        title: 'Days',
                        render: (_: unknown, row: LeaveBalanceSettingDto) => `${Number(row.days)} Day${Number(row.days) > 1 ? 's' : ''}`,
                      },
                      {
                        title: 'Status',
                        render: (_: unknown, row: LeaveBalanceSettingDto) => (
                          <Tag color={row.active ? 'green' : 'default'}>{row.active ? 'Active' : 'Inactive'}</Tag>
                        ),
                      },
                      {
                        title: 'Action',
                        render: (_: unknown, row: LeaveBalanceSettingDto) => (
                          <Space>
                            <Button
                              size='small'
                              disabled={!canEditSettings}
                              onClick={async () => {
                                await updateLeaveBalanceSetting(row.id, { active: !row.active });
                                await loadLeaveSettings();
                              }}
                            >
                              {row.active ? 'Disable' : 'Enable'}
                            </Button>
                            <Popconfirm
                              title='Delete this leave balance setting?'
                              disabled={!canEditSettings}
                              onConfirm={async () => {
                                await deleteLeaveBalanceSetting(row.id);
                                await loadLeaveSettings();
                              }}
                            >
                              <Button danger size='small' disabled={!canEditSettings}>Delete</Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}

              {settingsTab === 'approvers' && (
                <Card title='Leave Approvers' style={{ borderRadius: 16 }} loading={settingLoading}>
                  <Typography.Paragraph type='secondary'>
                    Multiple approvers are supported for company leave approval.
                  </Typography.Paragraph>

                  <Space style={{ width: '100%', marginBottom: 16 }} wrap>
                    <Form form={approverForm} layout='inline' initialValues={{ active: true }}>
                      <Form.Item
                        name='employeeId'
                        rules={[{ required: true, message: 'Approver required' }]}
                      >
                        <Select
                          placeholder='Select approver employee'
                          style={{ width: 320 }}
                          options={companyUsers.map((user) => ({
                            value: user.id,
                            label: `${user.name || user.username || user.id} (${user.role || '-'})`,
                          }))}
                        />
                      </Form.Item>

                      <Form.Item name='active' valuePropName='checked'>
                        <Switch checkedChildren='Active' unCheckedChildren='Inactive' />
                      </Form.Item>

                      <Form.Item>
                        <Button type='primary' disabled={!canEditSettings} onClick={() => void handleCreateApprover()}>
                          Add Approver
                        </Button>
                      </Form.Item>
                    </Form>
                  </Space>

                  <Table
                    rowKey='id'
                    dataSource={leaveApprovers}
                    pagination={false}
                    columns={[
                      {
                        title: 'Name',
                        render: (_: unknown, row: LeaveApproverDto) =>
                          row.employee?.name || row.employee?.user?.username || row.employeeId,
                      },
                      {
                        title: 'Role/Position',
                        render: (_: unknown, row: LeaveApproverDto) => row.employee?.position || '-',
                      },
                      {
                        title: 'Status',
                        render: (_: unknown, row: LeaveApproverDto) => (
                          <Tag color={row.active ? 'green' : 'default'}>{row.active ? 'Active' : 'Inactive'}</Tag>
                        ),
                      },
                      {
                        title: 'Action',
                        render: (_: unknown, row: LeaveApproverDto) => (
                          <Space>
                            <Button
                              size='small'
                              disabled={!canEditSettings}
                              onClick={async () => {
                                await updateLeaveApprover(row.id, { active: !row.active });
                                await loadLeaveSettings();
                              }}
                            >
                              {row.active ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              danger
                              size='small'
                              disabled={!canEditSettings}
                              onClick={async () => {
                                await deleteLeaveApprover(row.id);
                                await loadLeaveSettings();
                              }}
                            >
                              Remove
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                    locale={{ emptyText: 'No leave approvers configured' }}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
