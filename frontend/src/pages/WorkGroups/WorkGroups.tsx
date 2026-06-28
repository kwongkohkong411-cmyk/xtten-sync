import {
  Button,
  Card,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import {
  createWorkGroup,
  deleteWorkGroup,
  getWorkGroups,
  updateWorkGroup,
} from "../../api/workGroups";
import { getCompanies } from "../../api/company";

const { Text } = Typography;

export default function WorkGroups() {
  const [form] = Form.useForm();

  const [workGroups, setWorkGroups] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  const colorValue = Form.useWatch("color", form);
  const groupName = Form.useWatch("name", form);
  const groupCode = Form.useWatch("code", form);

  const fetchData = async () => {
    setLoading(true);

    try {
      const [wgRes, companyRes] = await Promise.all([
        getWorkGroups(),
        getCompanies(),
      ]);

      setWorkGroups(wgRes.data);
      setCompanies(companyRes.data);
    } catch (error) {
      message.error("Failed to load work groups");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    const keyword = search.toLowerCase();

    return workGroups.filter((item) => {
      return (
        item.name?.toLowerCase().includes(keyword) ||
        item.code?.toLowerCase().includes(keyword) ||
        item.company?.name?.toLowerCase().includes(keyword)
      );
    });
  }, [workGroups, search]);

  const getColorHex = (value: any) => {
    if (!value) return "#1677ff";
    if (typeof value === "string") return value;
    return value.toHexString?.() || "#1677ff";
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      color: "#1677ff",
      sortOrder: 0,
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);

    form.setFieldsValue({
      companyId: record.companyId,
      name: record.name,
      code: record.code,
      description: record.description,
      color: record.color || "#1677ff",
      sortOrder: record.sortOrder ?? 0,
      isActive: record.isActive,
    });

    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        ...values,
        color: getColorHex(values.color),
        sortOrder: Number(values.sortOrder ?? 0),
      };

      if (editing) {
        await updateWorkGroup(editing.id, payload);
        message.success("Work group updated");
      } else {
        await createWorkGroup(payload);
        message.success("Work group created");
      }

      setModalOpen(false);
      fetchData();
    } catch (error) {
      message.error("Please check the form");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkGroup(id);
      message.success("Work group deleted");
      fetchData();
    } catch (error) {
      message.error("Failed to delete work group");
    }
  };

  const columns = [
    {
      title: "Group",
      key: "group",
      render: (_: any, record: any) => (
        <Space>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: record.color || "#1677ff",
              display: "inline-block",
            }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {record.code || "-"}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "Company",
      dataIndex: ["company", "name"],
      render: (text: string) => text || "-",
    },
    {
      title: "Employees",
      key: "employees",
      render: (_: any, record: any) => record._count?.employees ?? 0,
    },
    {
      title: "Status",
      dataIndex: "isActive",
      render: (value: boolean) =>
        value ? <Tag color="green">ACTIVE</Tag> : <Tag color="red">INACTIVE</Tag>,
    },
    {
      title: "Sort",
      dataIndex: "sortOrder",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>

          <Popconfirm
            title="Delete this work group?"
            description="Employees in this group will be unassigned."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const previewColor = getColorHex(colorValue);

  return (
    <Card
      title="Work Groups"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Group
        </Button>
      }
    >
      <Input.Search
        placeholder="Search group, code or company"
        allowClear
        style={{ width: 320, marginBottom: 16 }}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredData}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editing ? "Edit Work Group" : "New Work Group"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editing ? "Update" : "Create"}
        destroyOnClose
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Company"
            name="companyId"
            rules={[{ required: true, message: "Please select company" }]}
          >
            <Select placeholder="Select company">
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Group Name"
            name="name"
            rules={[{ required: true, message: "Please enter group name" }]}
          >
            <Input placeholder="A Group / B Group / Night Group" />
          </Form.Item>

          <Form.Item label="Code" name="code">
            <Input placeholder="A / B / NIGHT" />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Optional description" />
          </Form.Item>

          <Card size="small" style={{ marginBottom: 16, background: "#fafafa" }}>
            <Space direction="vertical" size={8}>
              <Text strong>Group Preview</Text>

              <Space>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: previewColor,
                    display: "inline-block",
                  }}
                />
                <Text strong>{groupName || "New Work Group"}</Text>
                <Tag>{groupCode || "CODE"}</Tag>
              </Space>
            </Space>
          </Card>

          <Form.Item label="Color" name="color">
            <ColorPicker showText />
          </Form.Item>

          <Form.Item label="Sort Order" name="sortOrder">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}