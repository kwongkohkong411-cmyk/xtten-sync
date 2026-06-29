import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Tree,
  Typography,
  message,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from "@ant-design/icons";

import PageHeader from "../../components/ui/PageHeader/PageHeader";
import SearchBar from "../../components/ui/SearchBar";
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from "../../api/departments";
import { getCompanies } from "../../api/company";
import { getWorkGroups } from "../../api/workGroups";
import { hasPermission } from "../../utils/auth";
import { getStatusColor } from "../../utils/statusColors";

const { Text } = Typography;

type Company = {
  id: string;
  name: string;
  code?: string;
  users?: Array<{ id: string; name: string; email: string }>;
};

type Team = {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  _count?: {
    employees: number;
  };
};

type Department = {
  id: string;
  name: string;
  code: string;
  status: string;
  companyId: string;
  managerId?: string | null;
  manager?: {
    id: string;
    name: string;
    email?: string;
  } | null;
  company?: Company;
  _count?: {
    employees: number;
    workGroups: number;
  };
  workGroups?: Team[];
};

type WorkGroup = {
  id: string;
  name: string;
  code?: string;
  isActive: boolean;
  companyId: string;
  departmentId?: string | null;
  _count?: {
    employees: number;
  };
};

export default function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const [form] = Form.useForm();

  const canManageDepartment = hasPermission("department.manage") || hasPermission("department:manage");

  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();
    companies.forEach((company) => map.set(company.id, company));
    return map;
  }, [companies]);

  const normalizedDepartments = useMemo(() => {
    return departments.map((department) => {
      const enrichedTeams = (department.workGroups && department.workGroups.length > 0
        ? department.workGroups
        : workGroups.filter((group) => group.departmentId === department.id)
      ).sort((a, b) => a.name.localeCompare(b.name));

      return {
        ...department,
        company: department.company || companyMap.get(department.companyId),
        workGroups: enrichedTeams,
      };
    });
  }, [departments, workGroups, companyMap]);

  const filteredDepartments = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    if (!search) {
      return normalizedDepartments;
    }

    return normalizedDepartments.filter((department) => {
      const managerName = department.manager?.name?.toLowerCase() || "";
      const companyName = department.company?.name?.toLowerCase() || "";
      const teamMatched = department.workGroups?.some((team) => team.name.toLowerCase().includes(search));

      return (
        department.name.toLowerCase().includes(search) ||
        department.code.toLowerCase().includes(search) ||
        companyName.includes(search) ||
        managerName.includes(search) ||
        !!teamMatched
      );
    });
  }, [keyword, normalizedDepartments]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const [departmentRes, companyRes, workGroupRes] = await Promise.all([
        getDepartments(),
        getCompanies(),
        getWorkGroups(),
      ]);

      setDepartments(Array.isArray(departmentRes.data) ? departmentRes.data : []);
      setCompanies(Array.isArray(companyRes.data) ? companyRes.data : []);
      setWorkGroups(Array.isArray(workGroupRes.data) ? workGroupRes.data : []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to load organization data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingDepartment(null);
    form.resetFields();
    form.setFieldsValue({ status: "ACTIVE" });
    setModalOpen(true);
  };

  const openEditModal = (record: Department) => {
    setEditingDepartment(record);
    form.setFieldsValue({
      ...record,
      managerId: record.managerId || record.manager?.id || undefined,
    });
    setModalOpen(true);
  };

  const managerOptions = useMemo(() => {
    const selectedCompanyId = form.getFieldValue("companyId") as string | undefined;
    if (!selectedCompanyId) return [];

    const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
    return (selectedCompany?.users || []).map((user) => ({
      value: user.id,
      label: `${user.name} (${user.email})`,
    }));
  }, [companies, form, modalOpen]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingDepartment) {
        await updateDepartment(editingDepartment.id, values);
        message.success("Department updated");
      } else {
        await createDepartment(values);
        message.success("Department created");
      }

      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Something went wrong");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDepartment(id);
      message.success("Department deleted");
      fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to delete department");
    }
  };

  const buildTreeData = (department: Department) => {
    const teamNodes = (department.workGroups || []).map((team) => ({
      key: `team-${team.id}`,
      title: `${team.name} (${team._count?.employees ?? 0} employees)`,
      icon: <ApartmentOutlined />,
    }));

    return [
      {
        key: `dept-${department.id}`,
        title: `${department.name} (${department._count?.employees ?? 0} employees)`,
        children: teamNodes,
      },
    ];
  };

  return (
    <Card variant="borderless" loading={loading}>
      <PageHeader
        title="Organization Departments"
        subtitle="Departments are organization nodes connected to teams and employees"
        extra={
          canManageDepartment ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              New Department
            </Button>
          ) : null
        }
      />

      <div style={{ marginBottom: 16 }}>
        <SearchBar placeholder="Search department, manager, team or company" onChange={setKeyword} width={420} />
      </div>

      {filteredDepartments.length === 0 ? (
        <Empty description="No departments found" />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredDepartments.map((department) => (
            <Col key={department.id} xs={24} md={12} xl={8}>
              <Card
                title={
                  <Space direction="vertical" size={0}>
                    <Text strong>{department.name}</Text>
                    <Text type="secondary">{department.code}</Text>
                  </Space>
                }
                extra={<Tag color={getStatusColor(department.status)}>{department.status}</Tag>}
                actions={
                  canManageDepartment
                    ? [
                        <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEditModal(department)}>
                          Edit
                        </Button>,
                        <Popconfirm
                          key="delete"
                          title="Delete department?"
                          description="This action cannot be undone."
                          okText="Delete"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleDelete(department.id)}
                        >
                          <Button danger type="link" icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>,
                      ]
                    : undefined
                }
              >
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Text>Company: {department.company?.name || "-"}</Text>
                  <Text>Manager: {department.manager?.name || "Unassigned"}</Text>
                  <Space>
                    <Tag color="blue">Employees: {department._count?.employees ?? 0}</Tag>
                    <Tag color="cyan">Teams: {department._count?.workGroups ?? department.workGroups?.length ?? 0}</Tag>
                  </Space>

                  <Tree
                    showIcon
                    selectable={false}
                    defaultExpandAll
                    treeData={buildTreeData(department)}
                    style={{ background: "#fafafa", padding: 10, borderRadius: 8 }}
                  />
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editingDepartment ? "Edit Department" : "New Department"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingDepartment ? "Update" : "Create"}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Department Name" rules={[{ required: true }]}> 
            <Input />
          </Form.Item>

          <Form.Item name="code" label="Department Code" rules={[{ required: true }]}> 
            <Input disabled={!!editingDepartment} />
          </Form.Item>

          <Form.Item name="companyId" label="Company" rules={[{ required: true }]}> 
            <Select
              placeholder="Select company"
              options={companies.map((company) => ({
                label: company.name,
                value: company.id,
              }))}
              onChange={() => {
                form.setFieldValue("managerId", undefined);
              }}
            />
          </Form.Item>

          <Form.Item name="managerId" label="Department Manager">
            <Select
              allowClear
              placeholder="Select manager"
              options={managerOptions}
            />
          </Form.Item>

          <Form.Item name="status" label="Status">
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
