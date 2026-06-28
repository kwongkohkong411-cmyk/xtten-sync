import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Space, Table, Tag, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { createPermission, deletePermission, getPermissions } from "@/api/permissions";

export default function Permissions() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const res = await getPermissions();
      setPermissions(res.data);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Unable to load permissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  const openModal = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    try {
      await createPermission(values);
      message.success("Permission created");
      setModalOpen(false);
      loadPermissions();
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to create permission");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePermission(id);
      message.success("Permission deleted");
      loadPermissions();
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to delete permission");
    }
  };

  const columns = [
    {
      title: "Permission Key",
      key: "key",
      render: (_: any, record: any) =>
        record.key || (record.module && record.action ? `${record.module}:${record.action}` : "-"),
    },
    {
      title: "Description",
      key: "desc",
      render: (_: any, record: any) => record.desc || record.label || "-",
    },
    {
      title: "Legacy",
      key: "legacy",
      render: (_: any, record: any) =>
        record.module && record.action ? `${record.module}:${record.action}` : "-",
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "Action",
      key: "action",
      render: (_: any, record: any) => (
        <Space>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Permissions"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
            New Permission
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={permissions}
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      </Card>

      <Modal
        title="New Permission"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Module"
            name="module"
            rules={[{ required: true, message: "Please enter a module name" }]}
          >
            <Input placeholder="e.g. attendance" />
          </Form.Item>

          <Form.Item
            label="Action"
            name="action"
            rules={[{ required: true, message: "Please enter an action" }]}
          >
            <Input placeholder="e.g. manage" />
          </Form.Item>

          <Form.Item label="Label" name="label">
            <Input placeholder="Readable label, e.g. Manage Attendance" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
