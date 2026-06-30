import {
  Avatar,
  Button,
  Card,
  ColorPicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import {
  addWorkGroupMembers,
  createWorkGroup,
  deleteWorkGroup,
  getWorkGroup,
  getWorkGroupAvailableEmployees,
  getWorkGroups,
  removeWorkGroupMember,
  updateWorkGroup,
} from "../../api/workGroups";
import { getCompanies } from "../../api/company";
import { getStatusColor } from "../../utils/statusColors";

const { Text } = Typography;

export default function WorkGroups() {
  const [form] = Form.useForm();

  const [workGroups, setWorkGroups] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  // Members drawer state
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<any | null>(null);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

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
      message.error("Failed to load teams");
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
        message.success("Team updated");
      } else {
        await createWorkGroup(payload);
        message.success("Team created");
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
      message.success("Team deleted");
      fetchData();
    } catch (error) {
      message.error("Failed to delete team");
    }
  };

  // --- Members drawer ---
  const openMembers = async (record: any) => {
    setActiveGroup(record);
    setSelectedToAdd([]);
    setMemberSearch("");
    setMembersDrawerOpen(true);
    setMembersLoading(true);
    try {
      const [groupRes, empRes] = await Promise.all([
        getWorkGroup(record.id),
        getWorkGroupAvailableEmployees(record.id),
      ]);
      setActiveGroup(groupRes.data);
      setAllEmployees(empRes.data);
    } catch {
      message.error("Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  };

  const refreshActiveGroup = async () => {
    if (!activeGroup?.id) return;
    setMembersLoading(true);
    try {
      const [groupRes, empRes] = await Promise.all([
        getWorkGroup(activeGroup.id),
        getWorkGroupAvailableEmployees(activeGroup.id),
      ]);
      setActiveGroup(groupRes.data);
      setAllEmployees(empRes.data);
      fetchData();
    } finally {
      setMembersLoading(false);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedToAdd.length) return;
    try {
      await addWorkGroupMembers(activeGroup.id, selectedToAdd);
      message.success(`Added ${selectedToAdd.length} member(s)`);
      setSelectedToAdd([]);
      await refreshActiveGroup();
    } catch {
      message.error("Failed to add members");
    }
  };

  const handleRemoveMember = async (employeeId: string) => {
    try {
      await removeWorkGroupMember(activeGroup.id, employeeId);
      message.success("Member removed");
      await refreshActiveGroup();
    } catch {
      message.error("Failed to remove member");
    }
  };

  const currentMemberIds = useMemo(
    () => new Set((activeGroup?.employees ?? []).map((e: any) => e.id)),
    [activeGroup]
  );

  const availableToAdd = useMemo(() => {
    const kw = memberSearch.toLowerCase();
    return allEmployees.filter(
      (e) =>
        !currentMemberIds.has(e.id) &&
        (e.name?.toLowerCase().includes(kw) ||
          e.employeeNo?.toLowerCase().includes(kw) ||
          e.position?.toLowerCase().includes(kw))
    );
  }, [allEmployees, currentMemberIds, memberSearch]);

  const columns = [
    {
      title: "Team",
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
        value ? <Tag color={getStatusColor("ACTIVE")}>ACTIVE</Tag> : <Tag color={getStatusColor("INACTIVE")}>INACTIVE</Tag>,
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
          <Tooltip title="Manage Members">
            <Button
              icon={<TeamOutlined />}
              onClick={() => openMembers(record)}
            >
              Members
            </Button>
          </Tooltip>

          <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>

          <Popconfirm
            title="Delete this team?"
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
      title="Teams"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Team
        </Button>
      }
    >
      <Input.Search
        placeholder="Search team, code or company"
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
        title={editing ? "Edit Team" : "New Team"}
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
            label="Team Name"
            name="name"
            rules={[{ required: true, message: "Please enter team name" }]}
          >
            <Input placeholder="A Team / B Team / Night Team" />
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
                <Text strong>{groupName || "New Team"}</Text>
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

      {/* Members Drawer */}
      <Drawer
        title={
          <Space>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: activeGroup?.color || "#1677ff",
                display: "inline-block",
              }}
            />
            {activeGroup?.name} — Manage Members
          </Space>
        }
        open={membersDrawerOpen}
        onClose={() => setMembersDrawerOpen(false)}
        width={560}
        loading={membersLoading}
      >
        {/* Current Members */}
        <Text strong>
          Current Members ({activeGroup?.employees?.length ?? 0})
        </Text>
        <List
          size="small"
          style={{ marginTop: 8, marginBottom: 16, maxHeight: 280, overflowY: "auto" }}
          dataSource={activeGroup?.employees ?? []}
          locale={{ emptyText: "No members yet" }}
          renderItem={(emp: any) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="remove"
                  title="Remove from team?"
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleRemoveMember(emp.id)}
                >
                  <Button
                    size="small"
                    danger
                    icon={<UserDeleteOutlined />}
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar size="small">
                    {emp.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </Avatar>
                }
                title={emp.name}
                description={
                  <Space size={4}>
                    {emp.employeeNo && <Text type="secondary" style={{ fontSize: 11 }}>{emp.employeeNo}</Text>}
                    {emp.position && <Tag style={{ fontSize: 11 }}>{emp.position}</Tag>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />

        <Divider />

        {/* Add Members */}
        <Text strong>Add Members</Text>
        <Input.Search
          placeholder="Search by name, ID or position"
          allowClear
          style={{ marginTop: 8, marginBottom: 8 }}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
        <Select
          mode="multiple"
          style={{ width: "100%", marginBottom: 12 }}
          placeholder="Select employees to add"
          value={selectedToAdd}
          onChange={setSelectedToAdd}
          optionFilterProp="label"
          options={availableToAdd.map((e) => ({
            value: e.id,
            label: `${e.name}${e.employeeNo ? ` (${e.employeeNo})` : ""}${e.position ? ` — ${e.position}` : ""}`,
          }))}
        />
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          disabled={!selectedToAdd.length}
          onClick={handleAddMembers}
          block
        >
          Add Selected ({selectedToAdd.length})
        </Button>
      </Drawer>
    </Card>
  );
}