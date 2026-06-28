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
import { getPermissions } from "../../api/permissions";
import PermissionTree from "./PermissionTree";
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
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [form] = Form.useForm();
  const canSeeSuperAdmin = isSuperAdminOwner(getCurrentUser());

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await getRoles();
      const allRoles = res.data || [];
      setRoles(
        canSeeSuperAdmin
          ? allRoles
          : allRoles.filter((role: any) => role?.name !== "SUPER_ADMIN"),
      );
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const res = await getPermissions();
      setPermissions(res.data);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Unable to load permissions');
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setSelectedPermissionIds([]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingRole(record);
    form.setFieldsValue(record);
    setSelectedPermissionIds(record.permissions?.map((item: any) => item.permission.id) || []);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      permissionIds: selectedPermissionIds,
    };

    if (editingRole) {
      await updateRole(editingRole.id, payload);
      message.success("Role updated");
    } else {
      await createRole(payload);
      message.success("Role created");
    }

    setModalOpen(false);
    loadRoles();
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
      <Table
        rowKey="id"
        columns={columns}
        dataSource={roles}
        loading={loading}
      />

      <Modal
        title={editingRole ? "Edit Role" : "New Role"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Role Name"
            name="name"
            rules={[{ required: true, message: "Please enter role name" }]}
          >
            <Input placeholder="e.g. HR_MANAGER" />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Role description" />
          </Form.Item>

          <Form.Item label="Permissions">
            <PermissionTree
              permissions={permissions}
              selectedIds={selectedPermissionIds}
              onChange={setSelectedPermissionIds}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}