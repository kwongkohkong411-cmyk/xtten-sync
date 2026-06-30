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
      workGroupIds: record.workGroupId ? [record.workGroupId] : [],
      month: record.month ? dayjs(record.month, "YYYY-MM") : dayjs(),
      shiftId: record.shiftId,
      employeeId: record.employeeId,
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
        workGroupIds: values.workGroupIds || [],
        shiftId: values.shiftId,
        employeeId: values.employeeId || undefined,
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
    } catch (error: any) {
      // Extract error message from API response or use default
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          "Please check the form";
      message.error(errorMessage);
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
      title: "Team",
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

          <Form.Item name="companyId" label="Company" rules={[{ required: true, message: "Please select company" }]}>
            <Select
              placeholder="Select company"
              options={companies.map((c) => ({
                label: c.name,
                value: c.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="workGroupIds" label="Team" rules={[{ required: true, message: "Please select at least one team" }]}>
            <Select
              mode="multiple"
              placeholder="Select one or more teams"
              options={filteredWorkGroups.map((g) => ({
                label: g.name,
                value: g.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="month" label="Month" rules={[{ required: true, message: "Please select month" }]}>
            <DatePicker picker="month" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="shiftId" label="Shift" rules={[{ required: true, message: "Please select shift" }]}>
            <Select
              placeholder="Select shift"
              options={filteredShifts.map((s) => ({
                label: `${s.name} ${s.startTime}→${s.endTime}`,
                value: s.id,
              }))}
            />
          </Form.Item>

          <Form.Item 
            name="employeeId" 
            label="Employee"
            rules={[
              {
                validator: (_, value) => {
                  // If no employee selected, it's team-level - always valid
                  if (!value) return Promise.resolve();

                  // Get form values
                  const selectedTeamIds = form.getFieldValue("workGroupIds");
                  if (!selectedTeamIds || selectedTeamIds.length === 0) {
                    return Promise.resolve();
                  }

                  // Find the selected employee
                  const selectedEmployee = employees.find(e => e.id === value);
                  if (!selectedEmployee) {
                    return Promise.reject(new Error("Employee not found"));
                  }

                  // Check if employee belongs to all selected teams
                  // For now, we require employee to belong to at least one of the selected teams
                  const employeeInTeams = selectedTeamIds.some(
                    teamId => selectedEmployee.workGroupId === teamId
                  );

                  if (!employeeInTeams) {
                    return Promise.reject(
                      new Error("Employee does not belong to the selected Team")
                    );
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <Select
              placeholder="Select employee (optional)"
              allowClear
              options={employees.map((e) => ({
                label: e.name,
                value: e.id,
              }))}
            />
          </Form.Item>

        </Form>
      </Modal>
    </Card>
  );
}