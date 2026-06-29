import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";

import { getCompanyById } from "../../api/company";
import { getRoles } from "../../api/roles";
import {
  assignUserRole,
  createUser,
  getUsersByCompany,
  resetUserPassword,
  updateUserStatus,
} from "../../api/users";
import type { Company } from "../../types/company";
import CompanyRbacTab from "./CompanyRbacTab";
import { getCurrentUser, isSuperAdminOwner } from "../../utils/auth";
import { getStatusColor } from "../../utils/statusColors";

const { Title, Text } = Typography;

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<NonNullable<Company["users"]>>([]);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [resetPassword, setResetPassword] = useState<string>("");
  const [form] = Form.useForm();
  const canSeeSuperAdmin = isSuperAdminOwner(getCurrentUser());

  const load = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const [companyRes, usersRes, rolesRes] = await Promise.all([
        getCompanyById(id),
        getUsersByCompany(id),
        getRoles(),
      ]);
      setCompany(companyRes.data);
      setCompanyUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load company detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleCreateUser = async () => {
    if (!id) return;

    const values = await form.validateFields();
    setSaving(true);
    try {
      await createUser({
        ...values,
        companyId: id,
      });
      message.success("User created");
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (userId: string, status: string) => {
    const next = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      await updateUserStatus(userId, next);
      message.success(`User ${next === "ACTIVE" ? "enabled" : "disabled"}`);
      await load();
    } catch {
      message.error("Failed to update user status");
    }
  };

  const openRoleAssign = (userId: string, roleId?: string | null) => {
    setSelectedUserId(userId);
    setSelectedRoleId(roleId || "");
    setRoleOpen(true);
  };

  const submitRoleAssign = async () => {
    if (!selectedUserId || !selectedRoleId) {
      message.warning("Please choose a role");
      return;
    }

    setSaving(true);
    try {
      await assignUserRole(selectedUserId, selectedRoleId);
      message.success("Role assigned");
      setRoleOpen(false);
      await load();
    } catch {
      message.error("Failed to assign role");
    } finally {
      setSaving(false);
    }
  };

  const openResetPassword = (userId: string) => {
    setSelectedUserId(userId);
    setResetPassword("");
    setPasswordOpen(true);
  };

  const submitResetPassword = async () => {
    if (!selectedUserId || !resetPassword) {
      message.warning("Please enter new password");
      return;
    }

    setSaving(true);
    try {
      await resetUserPassword(selectedUserId, resetPassword);
      message.success("Password reset success");
      setPasswordOpen(false);
    } catch {
      message.error("Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Spin />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert type="error" message={error} />
      </Card>
    );
  }

  if (!company) {
    return (
      <Card>
        <Empty description="Company not found" />
      </Card>
    );
  }

  const userColumns = [
    { title: "Name", dataIndex: "name" },
    { title: "Email", dataIndex: "email" },
    { title: "Username", dataIndex: "username" },
    {
      title: "Role",
      render: (_: unknown, row: any) => row.roleRelation?.name || row.role,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (value: string) => (
        <Tag color={getStatusColor(value)}>{value}</Tag>
      ),
    },
    {
      title: "Action",
      render: (_: unknown, row: any) => (
        <Space>
          <Button size="small" onClick={() => openRoleAssign(row.id, row.roleId)}>
            Assign Role
          </Button>
          <Button size="small" onClick={() => openResetPassword(row.id)}>
            Reset Password
          </Button>
          <Popconfirm
            title={row.status === "ACTIVE" ? "Disable this user?" : "Enable this user?"}
            onConfirm={() => handleToggleStatus(row.id, row.status)}
            okText="Confirm"
            cancelText="Cancel"
          >
            <Button size="small" danger={row.status === "ACTIVE"}>
              {row.status === "ACTIVE" ? "Disable" : "Enable"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const visibleRoles = canSeeSuperAdmin
    ? roles
    : roles.filter((role) => role?.name !== "SUPER_ADMIN");

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 8 }}>
        {company.name}
      </Title>
      <Text type="secondary">Tenant Core / Company Detail</Text>

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: "overview",
            label: "Overview",
            children: (
              <>
                <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Company Name">{company.name}</Descriptions.Item>
                  <Descriptions.Item label="Company Code">{company.code}</Descriptions.Item>
                  <Descriptions.Item label="Timezone">{company.timezone}</Descriptions.Item>
                  <Descriptions.Item label="Country / Region">{company.country || "-"}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={getStatusColor(company.status)}>{company.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Created At">
                    {new Date(company.createdAt).toLocaleString()}
                  </Descriptions.Item>
                </Descriptions>

                <Card size="small" title={`Users in Company (${company.users?.length ?? 0})`}>
                  <div style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                      Add User
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    columns={userColumns}
                    dataSource={companyUsers || []}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "rbac",
            label: "RBAC",
            children: <CompanyRbacTab companyId={company.id} />,
          },
        ]}
      />

      <Modal
        title="Add User"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreateUser}
        okText="Create"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="roleId" label="Role" rules={[{ required: true }]}>
            <Select
              options={visibleRoles.map((r) => ({ label: r.name, value: r.id }))}
              placeholder="Select role"
            />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="ACTIVE">
            <Select
              options={[
                { label: "ACTIVE", value: "ACTIVE" },
                { label: "DISABLED", value: "DISABLED" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Assign Role"
        open={roleOpen}
        onCancel={() => setRoleOpen(false)}
        onOk={submitRoleAssign}
        okText="Assign"
        confirmLoading={saving}
      >
        <Select
          style={{ width: "100%" }}
          value={selectedRoleId || undefined}
          onChange={setSelectedRoleId}
          options={visibleRoles.map((r) => ({ label: r.name, value: r.id }))}
          placeholder="Select role"
        />
      </Modal>

      <Modal
        title="Reset Password"
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        onOk={submitResetPassword}
        okText="Reset"
        confirmLoading={saving}
      >
        <Input.Password
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          placeholder="Enter new password"
        />
      </Modal>
    </Card>
  );
}
