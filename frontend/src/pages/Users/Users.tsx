import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";

import { getCompanies } from "../../api/company";
import { getRoles } from "../../api/roles";
import { getWorkGroups } from "../../api/workGroups";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../../api/users";

import UserModal from "./UserModal";
import { getUserColumns } from "./userColumns";
import type { Company, User } from "./types";
import { getCurrentUser, isSuperAdminOwner } from "../../utils/auth";

export default function Users() {
  const [messageApi, contextHolder] = message.useMessage();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [workGroups, setWorkGroups] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string | undefined>();
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const canSeeSuperAdmin = isSuperAdminOwner(getCurrentUser());

  const loadData = async () => {
    try {
      setLoading(true);

      const [usersRes, companiesRes, rolesRes, workGroupsRes] = await Promise.all([
        getUsers(),
        getCompanies(),
        getRoles(),
        getWorkGroups(),
      ]);

      setUsers(usersRes.data || []);
      setCompanies(companiesRes.data || []);
      const allRoles = rolesRes.data || [];
      setRoles(
        canSeeSuperAdmin
          ? allRoles
          : allRoles.filter((role: any) => role?.name !== "SUPER_ADMIN"),
      );
      setWorkGroups(workGroupsRes.data || []);
    } catch (error) {
      messageApi.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const keyword = search.toLowerCase();
      const effectiveRole = user.roleRelation?.name || user.role || "";

      const matchSearch =
        user.name?.toLowerCase().includes(keyword) ||
        user.username?.toLowerCase().includes(keyword) ||
        effectiveRole.toLowerCase().includes(keyword);

      const matchCompany = companyFilter
        ? user.companyId === companyFilter
        : true;

      const matchRole = roleFilter ? effectiveRole === roleFilter : true;

      return matchSearch && matchCompany && matchRole;
    });
  }, [users, search, companyFilter, roleFilter]);

  const openCreateModal = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      setSaving(true);

      const payload = {
        name: values.name,
        username: values.username,
        password: values.password || undefined,
        companyId: values.companyId || null,
        workGroupId: values.workGroupId || undefined,
        roleId: values.roleId,
        status: values.status,
      };

      if (editingUser) {
        await updateUser(editingUser.id, payload);
        messageApi.success("Employee updated successfully");
      } else {
        await createUser(payload);
        messageApi.success("Employee created successfully");
      }

      setModalOpen(false);
      setEditingUser(null);
      loadData();
    } catch (error) {
      const err = error as {
        response?: { data?: { message?: string | string[] } };
      };
      const rawMessage = err?.response?.data?.message;
      const messageText = Array.isArray(rawMessage)
        ? rawMessage.join(", ")
        : rawMessage || "Failed to save employee";
      messageApi.error(messageText);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (user: User) => {
    Modal.confirm({
      title: "Delete employee?",
      content: `Are you sure you want to delete ${user.name}?`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        await deleteUser(user.id);
        messageApi.success("Employee deleted successfully");
        loadData();
      },
    });
  };

  const columns = getUserColumns(openEditModal, handleDelete);

  return (
    <>
      {contextHolder}

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Employees
            </Typography.Title>

            <Typography.Text type="secondary">
              Create employees and assign role permissions
            </Typography.Text>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            New Employee
          </Button>
        </div>

        <Space style={{ marginBottom: 24 }} wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 320 }}
          />

          <Select
            allowClear
            placeholder="Filter by company"
            value={companyFilter}
            onChange={(value) => setCompanyFilter(value)}
            style={{ width: 220 }}
            options={companies.map((company) => ({
              label: company.name,
              value: company.id,
            }))}
          />

          <Select
            allowClear
            placeholder="Role"
            value={roleFilter}
            onChange={(value) => setRoleFilter(value)}
            style={{ width: 180 }}
            options={roles.map((role) => ({
              label: role.name,
              value: role.name,
            }))}
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredUsers}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} employees`,
          }}
        />
      </Card>

      <UserModal
        open={modalOpen}
        loading={saving}
        editingUser={editingUser}
        companies={companies}
        workGroups={workGroups}
        roles={roles}
        onCancel={() => {
          setModalOpen(false);
          setEditingUser(null);
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}