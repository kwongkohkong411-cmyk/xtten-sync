import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import axios from "axios";

import PageHeader from "../../components/PageHeader/PageHeader";
import SearchBar from "../../components/SearchBar/SearchBar";

const API_URL = "http://localhost:3000";

type Company = {
  id: string;
  name: string;
  code: string;
  country: string;
  timezone: string;
  plan: string;
  status: string;
};

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [form] = Form.useForm();

  const api = axios.create({
    baseURL: API_URL,
  });

  api.interceptors.request.use((config) => {
    const token = localStorage.getItem("xtten_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.get("/companies");
      setCompanies(res.data);
      setFilteredCompanies(res.data);
    } catch {
      message.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSearch = (value: string) => {
    const keyword = value.toLowerCase();

    const result = companies.filter((company) => {
      return (
        company.name?.toLowerCase().includes(keyword) ||
        company.code?.toLowerCase().includes(keyword) ||
        company.country?.toLowerCase().includes(keyword)
      );
    });

    setFilteredCompanies(result);
  };

  const openCreateModal = () => {
    setEditingCompany(null);
    form.resetFields();
    form.setFieldsValue({
      timezone: "Asia/Shanghai",
      plan: "PRO",
      status: "ACTIVE",
    });
    setModalOpen(true);
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    form.setFieldsValue(company);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingCompany) {
        await api.patch(`/companies/${editingCompany.id}`, values);
        message.success("Company updated successfully");
      } else {
        await api.post("/companies", values);
        message.success("Company created successfully");
      }

      setModalOpen(false);
      fetchCompanies();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Something went wrong");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/companies/${id}`);
      message.success("Company deleted successfully");
      fetchCompanies();
    } catch {
      message.error("Failed to delete company");
    }
  };

  const columns = [
    {
      title: "Company",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: Company) => (
        <div>
          <strong>{text}</strong>
          <div style={{ color: "#888", fontSize: 12 }}>{record.code}</div>
        </div>
      ),
    },
    {
      title: "Country",
      dataIndex: "country",
      key: "country",
    },
    {
      title: "Timezone",
      dataIndex: "timezone",
      key: "timezone",
    },
    {
      title: "Plan",
      dataIndex: "plan",
      key: "plan",
      render: (plan: string) => <Tag color="blue">{plan}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : "red"}>{status}</Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, record: Company) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Edit
          </Button>

          <Popconfirm
            title="Delete company?"
            description="This action cannot be undone."
            okText="Delete"
            cancelText="Cancel"
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
    <Card bordered={false}>
      <PageHeader
        title="Companies"
        subtitle="Manage your companies and organizations"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            New Company
          </Button>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <SearchBar
          placeholder="Search company..."
          onChange={handleSearch}
          width={360}
        />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredCompanies}
        scroll={{ x: 1000 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50"],
        }}
      />

      <Modal
        title={editingCompany ? "Edit Company" : "New Company"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingCompany ? "Update" : "Create"}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Company Name"
            rules={[{ required: true, message: "Please enter company name" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="code"
            label="Company Code"
            rules={[{ required: true, message: "Please enter company code" }]}
          >
            <Input disabled={!!editingCompany} />
          </Form.Item>

          <Form.Item
            name="country"
            label="Country"
            rules={[{ required: true, message: "Please enter country" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="timezone"
            label="Timezone"
            rules={[{ required: true, message: "Please select timezone" }]}
          >
            <Select
              options={[
                { value: "Asia/Shanghai", label: "Asia/Shanghai" },
                { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
                { value: "Asia/Singapore", label: "Asia/Singapore" },
                { value: "Asia/Phnom_Penh", label: "Asia/Phnom_Penh" },
                { value: "Asia/Bangkok", label: "Asia/Bangkok" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="plan"
            label="Plan"
            rules={[{ required: true, message: "Please select plan" }]}
          >
            <Select
              options={[
                { value: "FREE", label: "FREE" },
                { value: "PRO", label: "PRO" },
                { value: "ENTERPRISE", label: "ENTERPRISE" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: "Please select status" }]}
          >
            <Select
              options={[
                { value: "ACTIVE", label: "ACTIVE" },
                { value: "DISABLED", label: "DISABLED" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}