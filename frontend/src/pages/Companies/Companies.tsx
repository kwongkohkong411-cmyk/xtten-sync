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
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import PageHeader from "../../components/ui/PageHeader/PageHeader";
import SearchBar from "../../components/ui/SearchBar";
import type { Company } from "../../types/company";

import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "@/api/company";

export default function Companies() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [form] = Form.useForm();

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await getCompanies();
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

    const result = companies.filter((c) => {
      return (
        c.name?.toLowerCase().includes(keyword) ||
        c.code?.toLowerCase().includes(keyword) ||
        c.country?.toLowerCase().includes(keyword)
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

  const openEditModal = (record: Company) => {
    setEditingCompany(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingCompany) {
        await updateCompany(editingCompany.id, values);
        message.success("Company updated successfully");
      } else {
        await createCompany(values);
        message.success("Company created successfully");
      }

      setModalOpen(false);
      fetchCompanies();
    } catch (error: any) {
      const rawMessage = error?.response?.data?.message;
      const normalized = Array.isArray(rawMessage)
        ? rawMessage.join(", ")
        : rawMessage;
      message.error(normalized || "Something went wrong");
    }
  };

  const getEmployeeCount = (record: Company) => {
    return record.users?.length ?? 0;
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompany(id);
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
      render: (text: string, record: Company) => (
        <div>
          <strong>{text}</strong>
          <div style={{ fontSize: 12, color: "#888" }}>{record.code}</div>
        </div>
      ),
    },
    {
      title: "Country",
      dataIndex: "country",
      render: (value?: string) => value || "-",
    },
    {
      title: "Timezone",
      dataIndex: "timezone",
    },
    {
      title: "Employees",
      render: (_: unknown, record: Company) => getEmployeeCount(record),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      render: (value: string) =>
        value ? new Date(value).toLocaleDateString() : "-",
    },
    {
      title: "Plan",
      dataIndex: "plan",
      render: (plan: string) => <Tag color="blue">{plan}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : "volcano"}>
          {status}
        </Tag>
      ),
    },
    {
      title: "Action",
      render: (_: any, record: Company) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => navigate(`/companies/${record.id}`)}
          >
            View
          </Button>

          <Button
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
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
    <Card variant="borderless">
      <PageHeader
        title={t("company.title")}
        subtitle={t("company.subtitle")}
        extra={
          <Space>
            <Button>Export</Button>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              {t("company.new")}
            </Button>
          </Space>
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
        title={editingCompany ? t("company.edit") : t("company.new")}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingCompany ? t("company.update") : t("company.create")}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="code" label="Company Code" rules={[{ required: true }]}>
            <Input disabled={!!editingCompany} />
          </Form.Item>

          <Form.Item name="logo" label="Logo URL">
            <Input placeholder="https://example.com/logo.png" />
          </Form.Item>

          <Form.Item name="country" label="Country" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="timezone" label="Timezone">
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

          <Form.Item name="plan" label="Plan">
            <Select
              options={[
                { value: "FREE", label: "FREE" },
                { value: "PRO", label: "PRO" },
                { value: "ENTERPRISE", label: "ENTERPRISE" },
              ]}
            />
          </Form.Item>

          <Form.Item name="status" label="Status">
            <Select
              options={[
                { value: "ACTIVE", label: "ACTIVE" },
                { value: "SUSPENDED", label: "SUSPENDED" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}