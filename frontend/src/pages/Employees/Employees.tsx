import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  SearchOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../../api/employees";
import { getCompanies } from "../../api/company";
import { getDepartments } from "../../api/departments";


interface Company {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  companyId: string;
}

interface Employee {
  id: string;
  employeeNo?: string;
  name: string;
  email?: string;
  position?: string;
  status: string;
  companyId: string;
  departmentId?: string;
  company?: Company;
  department?: Department;
}

export default function Employees() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();

  const [messageApi, contextHolder] = message.useMessage();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();

  const fetchData = async () => {
    try {
      setLoading(true);

      const [employeeRes, companyRes, departmentRes] = await Promise.all([
        getEmployees(),
        getCompanies(),
        getDepartments(),
      ]);

      setEmployees(employeeRes.data || []);
      setCompanies(companyRes.data || []);
      setDepartments(departmentRes.data || []);
    } catch (error) {
      messageApi.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (location.pathname === "/employees/add") {
      setEditingEmployee(null);
      setSelectedCompanyId(undefined);
      form.resetFields();
      form.setFieldsValue({ status: "ACTIVE" });
      setModalOpen(true);
    }
  }, [location.pathname, form]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const keyword = search.toLowerCase();

      const matchSearch =
        employee.name?.toLowerCase().includes(keyword) ||
        employee.employeeNo?.toLowerCase().includes(keyword) ||
        employee.email?.toLowerCase().includes(keyword) ||
        employee.position?.toLowerCase().includes(keyword);

      const matchCompany = companyFilter
        ? employee.companyId === companyFilter
        : true;

      const matchDepartment = departmentFilter
        ? employee.departmentId === departmentFilter
        : true;

      return matchSearch && matchCompany && matchDepartment;
    });
  }, [employees, search, companyFilter, departmentFilter]);

  const filteredDepartments = useMemo(() => {
    if (!companyFilter) return departments;
    return departments.filter((dept) => dept.companyId === companyFilter);
  }, [departments, companyFilter]);

  const modalDepartments = useMemo(() => {
    if (!selectedCompanyId) return [];
    return departments.filter((dept) => dept.companyId === selectedCompanyId);
  }, [departments, selectedCompanyId]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setSelectedCompanyId(undefined);
    form.resetFields();
    form.setFieldsValue({
      status: "ACTIVE",
    });
    setModalOpen(true);
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setSelectedCompanyId(employee.companyId);

    form.setFieldsValue({
      employeeNo: employee.employeeNo,
      name: employee.name,
      email: employee.email,
      position: employee.position,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      status: employee.status,
    });

    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const payload = {
        employeeNo: values.employeeNo,
        name: values.name,
        email: values.email,
        position: values.position,
        companyId: values.companyId,
        departmentId: values.departmentId || null,
        status: values.status,
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
        messageApi.success("Employee updated successfully");
      } else {
        await createEmployee(payload);
        messageApi.success("Employee created successfully");
      }

      setModalOpen(false);
      if (location.pathname === "/employees/add") {
        navigate("/employees", { replace: true });
      }
      form.resetFields();
      fetchData();
    } catch (error) {
      if (error) {
        messageApi.error("Please check the form");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (employee: Employee) => {
    Modal.confirm({
      title: "Delete employee?",
      content: `Are you sure you want to delete ${employee.name}?`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        await deleteEmployee(employee.id);
        messageApi.success("Employee deleted successfully");
        fetchData();
      },
    });
  };

  const columns = [
    {
      title: "Employee",
      key: "employee",
      render: (_: any, record: Employee) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 700 }}>{record.name}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.employeeNo || "-"}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      render: (email: string) => email || "-",
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (position: string) => position || "-",
    },
    {
      title: "Company",
      render: (_: any, record: Employee) => record.company?.name || "-",
    },
    {
      title: "Department",
      render: (_: any, record: Employee) => record.department?.name || "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : status === "SUSPENDED" ? "orange" : status === "LEFT" ? "red" : "gold"}>
          {status}
        </Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      align: "right" as const,
      render: (_: any, record: Employee) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => navigate(`/employees/${record.id}`)}
          >
            Details
          </Button>

          <Button
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            Edit
          </Button>

          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

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
              {t("menu.employees") || "Employees"}
            </Typography.Title>

            <Typography.Text type="secondary">
              Manage your employees and workforce
            </Typography.Text>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/employees/add")}
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
            onChange={(value) => {
              setCompanyFilter(value);
              setDepartmentFilter(undefined);
            }}
            style={{ width: 220 }}
            options={companies.map((company) => ({
              label: company.name,
              value: company.id,
            }))}
          />

          <Select
            allowClear
            placeholder="Filter by department"
            value={departmentFilter}
            onChange={(value) => setDepartmentFilter(value)}
            style={{ width: 220 }}
            options={filteredDepartments.map((dept) => ({
              label: dept.name,
              value: dept.id,
            }))}
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredEmployees}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} employees`,
          }}
        />
      </Card>

      <Modal
        title={editingEmployee ? "Edit Employee" : "New Employee"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          if (location.pathname === "/employees/add") {
            navigate("/employees");
          }
        }}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText={editingEmployee ? "Update" : "Create"}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 20 }}
        >
          <Form.Item
            label="Employee No"
            name="employeeNo"
          >
            <Input placeholder="EMP001" />
          </Form.Item>

          <Form.Item
            label="Full Name"
            name="name"
            rules={[
              {
                required: true,
                message: "Please enter employee name",
              },
            ]}
          >
            <Input placeholder="John Smith" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
          >
            <Input placeholder="john@company.com" />
          </Form.Item>

          <Form.Item
            label="Position"
            name="position"
          >
            <Input placeholder="HR Manager" />
          </Form.Item>

          <Form.Item
            label="Company"
            name="companyId"
            rules={[
              {
                required: true,
                message: "Please select company",
              },
            ]}
          >
            <Select
              placeholder="Select company"
              onChange={(value) => {
                setSelectedCompanyId(value);
                form.setFieldValue("departmentId", undefined);
              }}
              options={companies.map((company) => ({
                label: company.name,
                value: company.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="Department"
            name="departmentId"
          >
            <Select
              allowClear
              placeholder="Select department"
              disabled={!selectedCompanyId}
              options={modalDepartments.map((dept) => ({
                label: dept.name,
                value: dept.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="Status"
            name="status"
            rules={[
              {
                required: true,
                message: "Please select status",
              },
            ]}
          >
            <Select
              options={[
                {
                  label: "ACTIVE",
                  value: "ACTIVE",
                },
                {
                  label: "INACTIVE",
                  value: "INACTIVE",
                },
                {
                  label: "SUSPENDED",
                  value: "SUSPENDED",
                },
                {
                  label: "LEFT",
                  value: "LEFT",
                },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}