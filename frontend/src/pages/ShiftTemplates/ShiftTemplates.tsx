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
  TimePicker,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  createShiftTemplate,
  deleteShiftTemplate,
  getShiftTemplates,
  updateShiftTemplate,
} from "../../api/shiftTemplates";
import { getCompanies } from "../../api/company";
import { getStatusColor } from "../../utils/statusColors";

const { Text } = Typography;

export default function ShiftTemplates() {
  const [form] = Form.useForm();

  const [shifts, setShifts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  const startTime = Form.useWatch("startTime", form);
  const endTime = Form.useWatch("endTime", form);
  const breakMinutes = Form.useWatch("breakMinutes", form) ?? 0;

  const calcShiftInfo = () => {
    if (!startTime || !endTime) {
      return {
        crossDay: false,
        totalHours: 0,
        paidHours: 0,
      };
    }

    let start = dayjs(startTime);
    let end = dayjs(endTime);

    const crossDay = end.isBefore(start) || end.isSame(start);

    if (crossDay) {
      end = end.add(1, "day");
    }

    const totalMinutes = end.diff(start, "minute");
    const paidMinutes = Math.max(totalMinutes - Number(breakMinutes || 0), 0);

    return {
      crossDay,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      paidHours: Number((paidMinutes / 60).toFixed(2)),
    };
  };

  const shiftInfo = calcShiftInfo();

  const fetchData = async () => {
    setLoading(true);

    try {
      const [shiftRes, companyRes] = await Promise.all([
        getShiftTemplates(),
        getCompanies(),
      ]);

      setShifts(shiftRes.data);
      setCompanies(companyRes.data);
    } catch (error) {
      message.error("Failed to load shift templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    const keyword = search.toLowerCase();

    return shifts.filter((item) => {
      return (
        item.name?.toLowerCase().includes(keyword) ||
        item.code?.toLowerCase().includes(keyword) ||
        item.company?.name?.toLowerCase().includes(keyword)
      );
    });
  }, [shifts, search]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      breakMinutes: 60,
      lateAfter: 10,
      earlyLeave: 10,
      overtimeAfter: 0,
      color: "#722ed1",
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
      startTime: record.startTime ? dayjs(record.startTime, "HH:mm") : null,
      endTime: record.endTime ? dayjs(record.endTime, "HH:mm") : null,
      breakMinutes: record.breakMinutes,
      lateAfter: record.lateAfter,
      earlyLeave: record.earlyLeave,
      overtimeAfter: record.overtimeAfter,
      color: record.color || "#722ed1",
      isActive: record.isActive,
    });

    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const color =
        typeof values.color === "string"
          ? values.color
          : values.color?.toHexString?.();

      const payload = {
        ...values,
        startTime: values.startTime.format("HH:mm"),
        endTime: values.endTime.format("HH:mm"),
        crossDay: shiftInfo.crossDay,
        color,
      };

      if (editing) {
        await updateShiftTemplate(editing.id, payload);
        message.success("Shift template updated");
      } else {
        await createShiftTemplate(payload);
        message.success("Shift template created");
      }

      setModalOpen(false);
      fetchData();
    } catch (error) {
      message.error("Please check the form");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteShiftTemplate(id);
      message.success("Shift template deleted");
      fetchData();
    } catch (error) {
      message.error("Failed to delete shift template");
    }
  };

  const columns = [
    {
      title: "Shift",
      key: "shift",
      render: (_: any, record: any) => (
        <Space>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: record.color || "#722ed1",
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
      title: "Working Time",
      key: "time",
      render: (_: any, record: any) => (
        <Space>
          <Tag>{record.startTime}</Tag>
          <span>→</span>
          <Tag>{record.endTime}</Tag>
          {record.crossDay && <Tag color="blue">Cross Day</Tag>}
        </Space>
      ),
    },
    {
      title: "Break",
      dataIndex: "breakMinutes",
      render: (value: number) => `${value} min`,
    },
    {
      title: "Rules",
      key: "rules",
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          <span>Grace: {record.lateAfter} min</span>
          <span>Early leave: {record.earlyLeave} min</span>
          <span>OT after: {record.overtimeAfter} min</span>
        </Space>
      ),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      render: (value: boolean) =>
        value ? <Tag color={getStatusColor("ACTIVE")}>ACTIVE</Tag> : <Tag color={getStatusColor("INACTIVE")}>INACTIVE</Tag>,
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
            title="Delete this shift template?"
            description="This may affect future roster settings."
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

  return (
    <Card
      title="Shift Templates"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Shift
        </Button>
      }
    >
      <Input.Search
        placeholder="Search shift, code or company"
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
        title={editing ? "Edit Shift Template" : "New Shift Template"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editing ? "Update" : "Create"}
        destroyOnClose
        width={760}
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
            label="Shift Name"
            name="name"
            rules={[{ required: true, message: "Please enter shift name" }]}
          >
            <Input placeholder="Morning Shift / Night Shift" />
          </Form.Item>

          <Form.Item label="Code" name="code">
            <Input placeholder="MORNING / NIGHT" />
          </Form.Item>

          <Space style={{ width: "100%" }} size="large">
            <Form.Item
              label="Start Time"
              name="startTime"
              rules={[{ required: true, message: "Please select start time" }]}
            >
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>

            <Form.Item
              label="End Time"
              name="endTime"
              rules={[{ required: true, message: "Please select end time" }]}
            >
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>

            <Form.Item label="Break Minutes" name="breakMinutes">
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
          </Space>

          {(startTime && endTime) && (
            <Card size="small" style={{ marginBottom: 16, background: "#fafafa" }}>
              <Space direction="vertical" size={4}>
                <Text strong>Shift Summary</Text>

                <Text>
                  Working Time:{" "}
                  <Tag>{dayjs(startTime).format("HH:mm")}</Tag>
                  →
                  <Tag>{dayjs(endTime).format("HH:mm")}</Tag>
                  {shiftInfo.crossDay && <Tag color="blue">🌙 Cross Day</Tag>}
                </Text>

                <Text>Total Duration: {shiftInfo.totalHours} hours</Text>
                <Text>Break: {breakMinutes} minutes</Text>
                <Text strong>Paid Hours: {shiftInfo.paidHours} hours</Text>
              </Space>
            </Card>
          )}

          <Space style={{ width: "100%" }} size="large">
            <Form.Item label="Grace Period" name="lateAfter">
              <InputNumber min={0} addonAfter="min" />
            </Form.Item>

            <Form.Item label="Early Leave Limit" name="earlyLeave">
              <InputNumber min={0} addonAfter="min" />
            </Form.Item>

            <Form.Item label="OT Starts After" name="overtimeAfter">
              <InputNumber min={0} addonAfter="min" />
            </Form.Item>
          </Space>

          <Form.Item label="Color" name="color">
            <ColorPicker showText />
          </Form.Item>

          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}