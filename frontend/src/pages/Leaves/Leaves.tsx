import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Select, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../components/ui/PageHeader/PageHeader';
import SearchBar from '../../components/ui/SearchBar';
import { createLeave, getLeaves, updateLeave } from '@/api/leaves';
import { hasPermission } from '@/utils/auth';

const leaveTypes = [
  { label: 'Annual Leave', value: 'ANNUAL' },
  { label: 'Sick Leave', value: 'SICK' },
  { label: 'Personal Leave', value: 'PERSONAL' },
  { label: 'Overtime', value: 'OVERTIME' },
  { label: 'Other', value: 'OTHER' },
];

const leaveStatuses = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

export default function Leaves() {
  const { t } = useTranslation();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [filteredLeaves, setFilteredLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [form] = Form.useForm();
  const canManageLeave = hasPermission('leave:manage');

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const res = await getLeaves();
      setLeaves(res.data || []);
      setFilteredLeaves(res.data || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Unable to load leave requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleSearch = (value: string) => {
    const keyword = value.toLowerCase();
    const source = activeTab === 'pending' ? leaves.filter((item) => item.status === 'PENDING') : leaves;
    setFilteredLeaves(source.filter((item) => {
      return (
        item.type?.toLowerCase().includes(keyword) ||
        item.status?.toLowerCase().includes(keyword) ||
        item.reason?.toLowerCase().includes(keyword)
      );
    }));
  };

  const applyTabFilter = (tab: 'all' | 'pending') => {
    setActiveTab(tab);
    const source = tab === 'pending' ? leaves.filter((item) => item.status === 'PENDING') : leaves;
    setFilteredLeaves(source);
  };

  const openCreateForm = () => {
    form.resetFields();
    setFormVisible(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createLeave(values);
      message.success('Leave request submitted');
      setFormVisible(false);
      fetchLeaves();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to submit leave request');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateLeave(id, { status });
      message.success('Leave status updated');
      fetchLeaves();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to update leave');
    }
  };

  useEffect(() => {
    applyTabFilter(activeTab);
  }, [leaves]);

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Period',
      dataIndex: 'startDate',
      key: 'period',
      render: (_: string, record: any) =>
        `${new Date(record.startDate).toLocaleDateString()} - ${new Date(record.endDate).toLocaleDateString()}`,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          {canManageLeave ? (
            <>
              <Button
                type='primary'
                size='small'
                disabled={record.status === 'APPROVED'}
                onClick={() => handleStatusChange(record.id, 'APPROVED')}
              >
                Approve
              </Button>
              <Button
                danger
                size='small'
                disabled={record.status === 'REJECTED'}
                onClick={() => handleStatusChange(record.id, 'REJECTED')}
              >
                Reject
              </Button>
              <Select
                value={record.status}
                options={leaveStatuses}
                onChange={(value) => handleStatusChange(record.id, value)}
                style={{ width: 140 }}
              />
            </>
          ) : (
            <Tag>{record.status}</Tag>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title={t('page.attendance')}
        subtitle='Submit leave requests and track approvals'
        extra={
          <Button type='primary' icon={<PlusOutlined />} onClick={openCreateForm}>
            New Leave
          </Button>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <SearchBar placeholder='Search leave requests...' onChange={handleSearch} width={360} />
      </div>

      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => applyTabFilter(key as 'all' | 'pending')}
          items={[
            { key: 'all', label: 'All Requests' },
            { key: 'pending', label: 'Pending Approval' },
          ]}
        />
      </Card>

      <Card style={{ borderRadius: 16 }}>
        <Table
          rowKey='id'
          loading={loading}
          dataSource={filteredLeaves}
          columns={columns}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: 'No leave requests found' }}
        />
      </Card>

      <Card
        title='New Leave Request'
        style={{ marginTop: 24, borderRadius: 16 }}
        hidden={!formVisible}
      >
        <Form form={form} layout='vertical' onFinish={handleFormSubmit}>
          <Form.Item
            label='Leave Type'
            name='type'
            rules={[{ required: true, message: 'Please choose a leave type' }]}
          >
            <Select options={leaveTypes} placeholder='Select leave type' />
          </Form.Item>

          <Form.Item
            label='Start Date'
            name='startDate'
            rules={[{ required: true, message: 'Please choose a start date' }]}
          >
            <Input type='date' />
          </Form.Item>

          <Form.Item
            label='End Date'
            name='endDate'
            rules={[{ required: true, message: 'Please choose an end date' }]}
          >
            <Input type='date' />
          </Form.Item>

          <Form.Item label='Reason' name='reason'>
            <Input.TextArea rows={3} placeholder='Add reason or notes' />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type='primary' htmlType='submit'>Submit</Button>
              <Button onClick={() => setFormVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
