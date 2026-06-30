import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import type { Company, User, WorkGroup } from "./types";

interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean;
}

interface Props {
  open: boolean;
  loading: boolean;
  editingUser: User | null;
  companies: Company[];
  workGroups: WorkGroup[];
  roles: Role[];
  onCancel: () => void;
  onSubmit: (values: any) => void;
}

export default function UserModal({
  open,
  loading,
  editingUser,
  companies,
  workGroups,
  roles,
  onCancel,
  onSubmit,
}: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (editingUser) {
        form.setFieldsValue({
          name: editingUser.name,
          username: editingUser.username,
          companyId: editingUser.companyId,
          workGroupId: editingUser.workGroupId,
          roleId: editingUser.roleId,
          status: editingUser.status,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          roleId: null,
          workGroupId: null,
          status: "ACTIVE",
        });
      }
    }
  }, [open, editingUser, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values);
  };

  return (
    <Modal
      title={editingUser ? "Edit Employee" : "New Employee"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText={editingUser ? "Update" : "Create"}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 20 }}
        autoComplete="off"
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: "Please enter name" }]}
        >
          <Input placeholder="John Smith" />
        </Form.Item>

        <Form.Item
          label="Username"
          name="username"
          rules={[{ required: true, message: "Please enter username" }]}
        >
          <Input placeholder="john" autoComplete="new-username" />
        </Form.Item>

        {!editingUser && (
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter password" }]}
          >
            <Input.Password
              placeholder="Enter password"
              autoComplete="new-password"
            />
          </Form.Item>
        )}

        {editingUser && (
          <Form.Item label="New Password" name="password">
            <Input.Password
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
            />
          </Form.Item>
        )}

        <Form.Item label="Company" name="companyId">
          <Select
            allowClear
            placeholder="Select company"
            options={companies.map((company) => ({
              label: company.name,
              value: company.id,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Team"
          name="workGroupId"
          rules={[{ required: true, message: "Please select team" }]}
        >
          <Select
            placeholder="Select team"
            options={workGroups.map((group) => ({
              label: group.name,
              value: group.id,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Permission Assignment"
          name="roleId"
          rules={[{ required: true, message: "Please select role" }]}
        >
          <Select
            placeholder="Select role/permission template"
            options={roles.map((role) => ({
              label: role.name,
              value: role.id,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Status"
          name="status"
          rules={[{ required: true, message: "Please select status" }]}
        >
          <Select
            options={[
              { label: "ACTIVE", value: "ACTIVE" },
              { label: "DISABLED", value: "DISABLED" },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}