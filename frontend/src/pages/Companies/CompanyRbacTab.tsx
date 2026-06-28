import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";

import { createRole, getRoles, updateRole } from "../../api/roles";
import { getPermissions } from "../../api/permissions";
import { assignUserRole, getUsersByCompany } from "../../api/users";
import { getCurrentUser, isSuperAdminOwner } from "../../utils/auth";

type Permission = {
  id: string;
  module?: string;
  action?: string;
  key?: string;
  desc?: string;
  label?: string;
};

const getPermissionDisplayName = (permission: Permission) => {
  if (permission.label) return permission.label;
  if (permission.desc) return permission.desc;
  if (permission.key) return permission.key;
  if (permission.module && permission.action) return `${permission.module}:${permission.action}`;
  return '-';
};

type Role = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions?: Array<{
    permission: Permission;
  }>;
};

type CompanyUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  roleId?: string | null;
  roleRelation?: {
    id: string;
    name: string;
  } | null;
  status: string;
};

interface Props {
  companyId: string;
}

export default function CompanyRbacTab({ companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [userRoleDraft, setUserRoleDraft] = useState<Record<string, string>>({});

  const [form] = Form.useForm();
  const canSeeSuperAdmin = isSuperAdminOwner(getCurrentUser());

  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: role.name, value: role.id })),
    [roles],
  );

  const permissionOptions = useMemo(
    () =>
      permissions.map((p) => ({
        label: getPermissionDisplayName(p),
        value: p.id,
      })),
    [permissions],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permissionsRes, usersRes] = await Promise.all([
        getRoles(),
        getPermissions(),
        getUsersByCompany(companyId),
      ]);

      const fetchedRoles: Role[] = rolesRes.data || [];
      const visibleRoles = canSeeSuperAdmin
        ? fetchedRoles
        : fetchedRoles.filter((role) => role?.name !== "SUPER_ADMIN");
      const fetchedUsers: CompanyUser[] = usersRes.data || [];

      setRoles(visibleRoles);
      setPermissions(permissionsRes.data || []);
      setUsers(fetchedUsers);
      setUserRoleDraft(
        fetchedUsers.reduce<Record<string, string>>((acc, user) => {
          if (user.roleId) acc[user.id] = user.roleId;
          return acc;
        }, {}),
      );
    } catch {
      message.error("Failed to load RBAC data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const openCreateRole = () => {
    setEditingRole(null);
    setSelectedPermissionIds([]);
    form.resetFields();
    setRoleModalOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    form.setFieldsValue({
      name: role.name,
      description: role.description,
    });
    setSelectedPermissionIds(role.permissions?.map((rp) => rp.permission.id) || []);
    setRoleModalOpen(true);
  };

  const submitRole = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      permissionIds: selectedPermissionIds,
    };

    setSaving(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, payload);
        message.success("Role updated");
      } else {
        await createRole(payload);
        message.success("Custom role created");
      }
      setRoleModalOpen(false);
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const submitRoleAssignment = async (user: CompanyUser) => {
    const roleId = userRoleDraft[user.id];
    if (!roleId) {
      message.warning("Please choose a role");
      return;
    }

    setSaving(true);
    try {
      await assignUserRole(user.id, roleId);
      message.success(`Role assigned to ${user.name}`);
      await loadData();
    } catch {
      message.error("Failed to assign role");
    } finally {
      setSaving(false);
    }
  };

  const roleColumns = [
    {
      title: "Role",
      render: (_: unknown, role: Role) => (
        <Space>
          <Typography.Text strong>{role.name}</Typography.Text>
          {role.isSystem && <Tag color="blue">SYSTEM</Tag>}
        </Space>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      render: (value?: string) => value || "-",
    },
    {
      title: "Permissions",
      render: (_: unknown, role: Role) => (
        <Space size={[4, 4]} wrap>
          {(role.permissions || []).map((rp) => (
            <Tag key={`${role.id}-${rp.permission.id}`}>
              {getPermissionDisplayName(rp.permission)}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Actions",
      width: 120,
      render: (_: unknown, role: Role) => (
        <Button icon={<EditOutlined />} onClick={() => openEditRole(role)}>
          Edit
        </Button>
      ),
    },
  ];

  const assignmentColumns = [
    {
      title: "User",
      render: (_: unknown, user: CompanyUser) => (
        <div>
          <Typography.Text strong>{user.name}</Typography.Text>
          <div style={{ fontSize: 12, color: "#64748b" }}>{user.email}</div>
        </div>
      ),
    },
    {
      title: "Current Role",
      render: (_: unknown, user: CompanyUser) => user.roleRelation?.name || user.role || "-",
    },
    {
      title: "Assign Role",
      render: (_: unknown, user: CompanyUser) => (
        <Space>
          <Select
            style={{ width: 220 }}
            value={userRoleDraft[user.id] || undefined}
            onChange={(value) =>
              setUserRoleDraft((prev) => ({
                ...prev,
                [user.id]: value,
              }))
            }
            options={roleOptions}
            placeholder="Select role"
          />
          <Button type="primary" onClick={() => submitRoleAssignment(user)}>
            Apply
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="Role & Permission Matrix"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
              New Custom Role
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={roleColumns}
          dataSource={roles}
          pagination={false}
          scroll={{ x: 980 }}
        />
      </Card>

      <Card title="Role Assignment (Users in Company)">
        <Table
          rowKey="id"
          loading={loading}
          columns={assignmentColumns}
          dataSource={users}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={editingRole ? "Edit Role Permissions" : "Create Custom Role"}
        open={roleModalOpen}
        onCancel={() => setRoleModalOpen(false)}
        onOk={submitRole}
        okText="Save"
        confirmLoading={saving}
        width={860}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Role Name"
            name="name"
            rules={[{ required: true, message: "Please enter role name" }]}
          >
            <Input placeholder="e.g. COMPANY_AUDITOR" disabled={editingRole?.isSystem} />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Role description" />
          </Form.Item>

          <Form.Item label="Permissions">
            <Select
              mode="multiple"
              allowClear
              value={selectedPermissionIds}
              onChange={setSelectedPermissionIds}
              options={permissionOptions}
              placeholder="Select permissions"
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
