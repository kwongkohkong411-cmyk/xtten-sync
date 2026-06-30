import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { createRole, deleteRole, getRoles, updateRole } from "../../api/roles";
import PermissionTree from "../../components/PermissionTree";
import { getCurrentUser, isSuperAdminOwner } from "../../utils/auth";

const SYSTEM_ROLE_NAMES = new Set([
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "HR",
  "MANAGER",
  "TEAM_LEAD",
  "EMPLOYEE",
  "AUDITOR",
]);

export default function Roles() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [form] = Form.useForm();
  const canSeeSuperAdmin = isSuperAdminOwner(getCurrentUser());

  const loadRoles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRoles();
      const allRoles = res.data || [];
      setRoles(
        canSeeSuperAdmin
          ? allRoles
          : allRoles.filter((role: any) => role?.name !== "SUPER_ADMIN"),
      );
      setError(null);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to load roles';
      setError(errorMsg);
      setRoles([]);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setSelectedPermissionIds([]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    // Prevent editing system roles
    if (isProtectedSystemRole(record)) {
      message.error("System roles cannot be edited");
      return;
    }
    setEditingRole(record);
    form.setFieldsValue(record);
    // Extract permission keys from the role's permissions
    const permissionKeys = record.permissions?.map((item: any) => item.permission.key) || [];
    setSelectedPermissionIds(permissionKeys);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    
    // Prevent creating roles with system role names
    if (!editingRole && SYSTEM_ROLE_NAMES.has(values.name)) {
      message.error(`"${values.name}" is a reserved system role name`);
      return;
    }

    const payload = {
      ...values,
      permissionIds: selectedPermissionIds,
    };

    try {
      if (editingRole) {
        await updateRole(editingRole.id, payload);
        message.success("Role updated");
      } else {
        await createRole(payload);
        message.success("Role created");
      }

      setModalOpen(false);
      loadRoles();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to save role');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteRole(id);
    message.success("Role deleted");
    loadRoles();
  };

  const isProtectedSystemRole = (record: any) => {
    return !!record?.isSystem || SYSTEM_ROLE_NAMES.has(record?.name);
  };

  const columns = [
    {
      title: "Role",
      dataIndex: "name",
      render: (text: string, record: any) => (
        <Space>
          <b>{text}</b>
          {isProtectedSystemRole(record) && <Tag color="blue">SYSTEM</Tag>}
        </Space>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
    },
    {
      title: "Users",
      render: (_: any, record: any) => record.users?.length || 0,
    },
    {
      title: "Actions",
      width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
            disabled={isProtectedSystemRole(record)}
          >
            Edit
          </Button>

          <Popconfirm
            title="Delete role?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            disabled={isProtectedSystemRole(record)}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={isProtectedSystemRole(record)}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Roles"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Role
        </Button>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: "12px", backgroundColor: "#fff2f0", color: "#d9534f", borderRadius: "4px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={roles}
        loading={loading}
        locale={{
          emptyText: loading ? "Loading..." : error ? "Failed to load roles" : "No roles found",
        }}
      />

      <Modal
        title={editingRole ? "Edit Role" : "New Role"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText="Save"
        okButtonProps={{ disabled: editingRole && isProtectedSystemRole(editingRole) }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Role Name"
            name="name"
            rules={[{ required: true, message: "Please enter role name" }]}
          >
            <Input 
              placeholder="e.g. HR_MANAGER" 
              disabled={editingRole && isProtectedSystemRole(editingRole)}
              readOnly={editingRole && isProtectedSystemRole(editingRole)}
            />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea 
              rows={3} 
              placeholder="Role description"
              disabled={editingRole && isProtectedSystemRole(editingRole)}
              readOnly={editingRole && isProtectedSystemRole(editingRole)}
            />
          </Form.Item>

          <Form.Item label="Permissions">
            <PermissionTree
              selectedPermissionIds={selectedPermissionIds}
              onChange={editingRole && isProtectedSystemRole(editingRole) ? undefined : setSelectedPermissionIds}
              disabled={editingRole && isProtectedSystemRole(editingRole)}
            />
          </Form.Item>

          {editingRole && isProtectedSystemRole(editingRole) && (
            <div style={{ padding: "8px 12px", backgroundColor: "#e8f5e9", color: "#2e7d32", borderRadius: "4px", marginTop: "8px" }}>
              <strong>System Role:</strong> This is a system role and cannot be edited
            </div>
          )}
        </Form>
      </Modal>
    </Card>
  );
}