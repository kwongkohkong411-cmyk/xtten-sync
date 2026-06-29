import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from "antd";
import dayjs from "dayjs";
import { createHoliday, deleteHoliday, getHolidays, updateHoliday } from "../../api/holidays";
import { hasPermission } from "../../utils/auth";

const countryOptions = [
  { label: "Malaysia", value: "Malaysia" },
  { label: "Singapore", value: "Singapore" },
  { label: "China", value: "China" },
  { label: "Cambodia", value: "Cambodia" },
];

export default function HolidaySettings() {
  const [form] = Form.useForm();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"COUNTRY" | "COMPANY">("COUNTRY");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const canManage = hasPermission("holiday:manage");
  const companyId = localStorage.getItem("company_id") || undefined;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getHolidays();
      setHolidays(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to load holidays");
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const rows = useMemo(() => {
    return holidays
      .filter((item) => {
        const scope = String(item?.scope || (item?.companyId ? "COMPANY" : "COUNTRY")).toUpperCase();
        return scope === tab;
      })
      .map((item) => ({
        ...item,
        scope: String(item?.scope || (item?.companyId ? "COMPANY" : "COUNTRY")).toUpperCase(),
      }));
  }, [holidays, tab]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      scope: tab,
      country: "Malaysia",
      status: "ACTIVE",
    });
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      date: row.date ? dayjs(row.date) : null,
      country: row.country,
      scope: row.scope,
      status: row.status,
    });
    setModalOpen(true);
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        date: values.date.format("YYYY-MM-DD"),
        country: values.country,
        scope: values.scope,
        status: values.status,
        companyId: values.scope === "COMPANY" ? companyId : undefined,
      };

      if (editing) {
        await updateHoliday(editing.id, payload);
        message.success("Holiday updated");
      } else {
        await createHoliday(payload as any);
        message.success("Holiday created");
      }

      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || "Failed to save holiday");
    }
  };

  const toggleStatus = async (row: any) => {
    try {
      const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await updateHoliday(row.id, { status: nextStatus });
      message.success("Holiday status updated");
      fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteHoliday(id);
      message.success("Holiday deleted");
      fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to delete holiday");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="Holiday Settings"
        extra={
          canManage ? (
            <Button type="primary" onClick={openCreate}>
              New Holiday
            </Button>
          ) : null
        }
      >
        <Space direction="vertical" size={4}>
          <div>Unified management for public and company holidays; affects absence checks, work-hour stats, monthly reports, and overtime calculations.</div>
        </Space>
      </Card>

      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as "COUNTRY" | "COMPANY")}
          items={[
            { key: "COUNTRY", label: "Public Holidays" },
            { key: "COMPANY", label: "Company Holidays" },
          ]}
        />

        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Name", dataIndex: "name" },
            {
              title: "Date",
              dataIndex: "date",
              render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
            },
            { title: "Country", dataIndex: "country" },
            {
              title: "Scope",
              dataIndex: "scope",
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: "Status",
              dataIndex: "status",
              render: (v: string) => <Tag color={v === "ACTIVE" ? "green" : "default"}>{v}</Tag>,
            },
            {
              title: "Action",
              render: (_: any, row: any) =>
                canManage ? (
                  <Space>
                    <Button size="small" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                    <Button size="small" onClick={() => toggleStatus(row)}>
                      {row.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <Popconfirm
                      title="Delete this holiday?"
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onDelete(row.id)}
                    >
                      <Button size="small" danger>
                        Delete
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : (
                  <Tag>Read only</Tag>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "Edit Holiday" : "New Holiday"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmit}
        okText={editing ? "Update" : "Create"}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Please input holiday name" }]}> 
            <Input placeholder="National Day" />
          </Form.Item>

          <Form.Item name="date" label="Date" rules={[{ required: true, message: "Please select date" }]}> 
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="country" label="Country" rules={[{ required: true, message: "Please select country" }]}> 
            <Select options={countryOptions} />
          </Form.Item>

          <Form.Item name="scope" label="Scope" rules={[{ required: true }]}> 
            <Select
              options={[
                { label: "Country", value: "COUNTRY" },
                { label: "Company", value: "COMPANY" },
              ]}
            />
          </Form.Item>

          <Form.Item name="status" label="Status" rules={[{ required: true }]}> 
            <Select
              options={[
                { label: "ACTIVE", value: "ACTIVE" },
                { label: "INACTIVE", value: "INACTIVE" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
