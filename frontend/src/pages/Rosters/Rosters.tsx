import {
  Button,
  Card,
  DatePicker,
  Form,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
  Input,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

// API（统一入口）
import client from "../../api/client";
import {
  createRoster,
  deleteRoster,
  getRosters,
  updateRoster,
} from "../../api/rosters";

import { getCompanies } from "../../api/company";
import { getWorkGroups } from "../../api/workGroups";
import { getShiftTemplates } from "../../api/shiftTemplates";

export default function Rosters() {
  const [form] = Form.useForm();

  const [rosters, setRosters] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [workGroups, setWorkGroups] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  const selectedCompanyId = Form.useWatch("companyId", form);

  // =========================
  // FETCH DATA
  // =========================
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rosterRes, companyRes, groupRes, shiftRes, empRes] =
        await Promise.all([
          getRosters(),
          getCompanies(),
          getWorkGroups(),
          getShiftTemplates(),
          client.get("/employees"), // ✅ FIX: 不再写死 URL
        ]);

      setRosters(rosterRes.data);
      setCompanies(companyRes.data);
      setWorkGroups(groupRes.data);
      setShifts(shiftRes.data);
      setEmployees(empRes.data);
    } catch (error) {
      message.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =========================
  // FILTERS
  // =========================
  const filteredWorkGroups = useMemo(() => {
    if (!selectedCompanyId) return workGroups;
    return workGroups.filter((i) => i.companyId === selectedCompanyId);
  }, [workGroups, selectedCompanyId]);

  const filteredShifts = useMemo(() => {
    if (!selectedCompanyId) return shifts;
    return shifts.filter((i) => i.companyId === selectedCompanyId);
  }, [shifts, selectedCompanyId]);

  const filteredData = useMemo(() => {
    const keyword = search.toLowerCase();

    return rosters.filter((item) => {
      return (
        item.month?.toLowerCase().includes(keyword) ||
        item.company?.name?.toLowerCase().includes(keyword) ||
        item.workGroup?.name?.toLowerCase().includes(keyword) ||
        item.shift?.name?.toLowerCase().includes(keyword)
      );
    });
  }, [rosters, search]);

  // =========================
  // CREATE
  // =========================
  const openCreate = () => {
    setEditing(null);
    form.resetFields();

    form.setFieldsValue({
      month: dayjs(),
    });

    setModalOpen(true);
  };

  // =========================
  // EDIT
  // =========================
  const openEdit = (record: any) => {
    setEditing(record);

    form.setFieldsValue({
      companyId: record.companyId,
      workGroupId: record.workGroupId,
      shiftId: record.shiftId,
      employeeId: record.employeeId,
      month: record.month ? dayjs(record.month, "YYYY-MM") : dayjs(),
    });

    setModalOpen(true);
  };

  // =========================
  // SUBMIT
  // =========================
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        companyId: values.companyId,
        workGroupId: values.workGroupId,
        shiftId: values.shiftId,
        employeeId: values.employeeId,
        month: values.month.format("YYYY-MM"),
      };

      if (editing) {
        await updateRoster(editing.id, payload);
        message.success("Roster updated");
      } else {
        await createRoster(payload);
        message.success("Roster created");
      }

      setModalOpen(false);
      fetchData();
    } catch {
      message.error("Please check the form");
    }
  };

  // =========================
  // DELETE
  // =========================
  const handleDelete = async (id: string) => {
    try {
      await deleteRoster(id);
      message.success("Roster deleted");
      fetchData();
    } catch {
      message.error("Failed to delete roster");
    }
  };

  // =========================
  // TABLE
  // =========================
  const columns = [
    {
      title: "Month",
      dataIndex: "month",
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "Company",
      dataIndex: ["company", "name"],
    },
    {
      title: "Employee",
      dataIndex: ["employee", "name"],
      render: (v: string) => v || "-",
    },
    {
      title: "Work Group",
      render: (_: any, r: any) => r.workGroup?.name,
    },
    {
      title: "Shift",
      render: (_: any, r: any) => r.shift?.name,
    },
    {
      title: "Action",
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>

          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  // =========================
  // UI
  // =========================
  return (
    <Card
      title="Rosters"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Roster
        </Button>
      }
    >
      <Input
        placeholder="Search..."
        style={{ width: 300, marginBottom: 16 }}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredData}
      />

      <Modal
        open={modalOpen}
        title={editing ? "Edit Roster" : "New Roster"}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
      >
        <Form form={form} layout="vertical">

          <Form.Item name="companyId" label="Company" rules={[{ required: true }]}>
            <Select
              options={companies.map((c) => ({
                label: c.name,
                value: c.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select
              placeholder="Select employee"
              options={employees.map((e) => ({
                label: e.name,
                value: e.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="month" label="Month" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="workGroupId" label="Work Group">
            <Select
              options={filteredWorkGroups.map((g) => ({
                label: g.name,
                value: g.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="shiftId" label="Shift">
            <Select
              options={filteredShifts.map((s) => ({
                label: `${s.name} ${s.startTime}→${s.endTime}`,
                value: s.id,
              }))}
            />
          </Form.Item>

        </Form>
      </Modal>
    </Card>
  );
}