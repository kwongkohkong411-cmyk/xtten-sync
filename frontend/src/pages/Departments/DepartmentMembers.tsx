import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { SwapOutlined, UserAddOutlined, UserDeleteOutlined } from "@ant-design/icons";

import PageHeader from "../../components/ui/PageHeader/PageHeader";
import { getDepartments } from "../../api/departments";
import { getEmployees, updateEmployee } from "../../api/employees";

type Department = {
  id: string;
  name: string;
  code: string;
  companyId: string;
  company?: { id: string; name: string };
};

type Employee = {
  id: string;
  employeeNo?: string;
  name: string;
  email?: string;
  position?: string;
  status: string;
  companyId: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
};

function toEmployeePayload(employee: Employee, departmentId: string | null) {
  return {
    employeeNo: employee.employeeNo,
    name: employee.name,
    email: employee.email,
    position: employee.position,
    status: employee.status,
    companyId: employee.companyId,
    departmentId,
  };
}

export default function DepartmentMembers() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>();
  const [targetDepartmentId, setTargetDepartmentId] = useState<string>();
  const [movingEmployee, setMovingEmployee] = useState<Employee | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedMemberRowKeys, setSelectedMemberRowKeys] = useState<string[]>([]);
  const [selectedAssignableRowKeys, setSelectedAssignableRowKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === selectedDepartmentId),
    [departments, selectedDepartmentId],
  );

  const departmentMembers = useMemo(
    () => employees.filter((employee) => employee.departmentId === selectedDepartmentId),
    [employees, selectedDepartmentId],
  );

  const filteredDepartmentMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) {
      return departmentMembers;
    }

    return departmentMembers.filter((employee) => {
      const byName = employee.name?.toLowerCase().includes(keyword);
      const byNo = employee.employeeNo?.toLowerCase().includes(keyword);
      return !!byName || !!byNo;
    });
  }, [departmentMembers, memberSearch]);

  const assignableEmployees = useMemo(() => {
    if (!selectedDepartment) {
      return [];
    }

    return employees.filter((employee) => {
      const sameCompany = employee.companyId === selectedDepartment.companyId;
      const notInCurrentDepartment = employee.departmentId !== selectedDepartment.id;
      return sameCompany && notInCurrentDepartment;
    });
  }, [employees, selectedDepartment]);

  const filteredAssignableEmployees = useMemo(() => {
    const keyword = assignSearch.trim().toLowerCase();
    if (!keyword) {
      return assignableEmployees;
    }

    return assignableEmployees.filter((employee) => {
      const byName = employee.name?.toLowerCase().includes(keyword);
      const byNo = employee.employeeNo?.toLowerCase().includes(keyword);
      return !!byName || !!byNo;
    });
  }, [assignableEmployees, assignSearch]);

  const movableDepartmentOptions = useMemo(() => {
    if (!selectedDepartment) {
      return [];
    }

    return departments
      .filter(
        (department) =>
          department.companyId === selectedDepartment.companyId &&
          department.id !== selectedDepartment.id,
      )
      .map((department) => ({
        label: `${department.name} (${department.code})`,
        value: department.id,
      }));
  }, [departments, selectedDepartment]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [departmentRes, employeeRes] = await Promise.all([
        getDepartments(),
        getEmployees(),
      ]);

      const departmentList = Array.isArray(departmentRes.data) ? departmentRes.data : [];
      const employeeList = Array.isArray(employeeRes.data) ? employeeRes.data : [];

      setDepartments(departmentList);
      setEmployees(employeeList);
      setSelectedMemberRowKeys([]);
      setSelectedAssignableRowKeys([]);

      if (!selectedDepartmentId && departmentList.length > 0) {
        setSelectedDepartmentId(departmentList[0].id);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to load department members data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const assignToDepartment = async (employeeId: string) => {
    if (!selectedDepartmentId) {
      message.warning("Please select a department first");
      return;
    }

    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) {
      return;
    }

    setSaving(true);
    try {
      await updateEmployee(employee.id, toEmployeePayload(employee, selectedDepartmentId));
      message.success("Employee assigned to department");
      await fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to assign employee");
    } finally {
      setSaving(false);
    }
  };

  const removeFromDepartment = async (employee: Employee) => {
    setSaving(true);
    try {
      await updateEmployee(employee.id, toEmployeePayload(employee, null));
      message.success("Employee removed from department");
      await fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to remove employee");
    } finally {
      setSaving(false);
    }
  };

  const openMoveModal = (employee: Employee) => {
    setMovingEmployee(employee);
    setTargetDepartmentId(undefined);
  };

  const confirmMoveEmployee = async () => {
    if (!movingEmployee || !targetDepartmentId) {
      message.warning("Please choose a target department");
      return;
    }

    setSaving(true);
    try {
      await updateEmployee(
        movingEmployee.id,
        toEmployeePayload(movingEmployee, targetDepartmentId),
      );
      message.success("Employee moved successfully");
      setMovingEmployee(null);
      setTargetDepartmentId(undefined);
      await fetchData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to move employee");
    } finally {
      setSaving(false);
    }
  };

  const assignManyToDepartment = async () => {
    if (!selectedDepartmentId) {
      message.warning("Please select a department first");
      return;
    }

    if (selectedAssignableRowKeys.length === 0) {
      message.warning("Please select employees to assign");
      return;
    }

    Modal.confirm({
      title: "Confirm bulk assignment",
      content: `Assign ${selectedAssignableRowKeys.length} employee(s) to ${selectedDepartment?.name || "selected department"}?`,
      okText: "Assign",
      cancelText: "Cancel",
      onOk: async () => {
        setSaving(true);
        try {
          const selectedEmployees = employees.filter((employee) =>
            selectedAssignableRowKeys.includes(employee.id),
          );

          await Promise.all(
            selectedEmployees.map((employee) =>
              updateEmployee(employee.id, toEmployeePayload(employee, selectedDepartmentId)),
            ),
          );

          message.success(`Assigned ${selectedEmployees.length} employee(s)`);
          await fetchData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || "Failed to assign selected employees");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const moveManyEmployees = async () => {
    if (!targetDepartmentId) {
      message.warning("Please select a target department");
      return;
    }

    if (selectedMemberRowKeys.length === 0) {
      message.warning("Please select members to move");
      return;
    }

    const targetDepartment = departments.find((department) => department.id === targetDepartmentId);

    Modal.confirm({
      title: "Confirm bulk move",
      content: `Move ${selectedMemberRowKeys.length} member(s) to ${targetDepartment?.name || "target department"}?`,
      okText: "Move",
      cancelText: "Cancel",
      onOk: async () => {
        setSaving(true);
        try {
          const selectedEmployees = employees.filter((employee) =>
            selectedMemberRowKeys.includes(employee.id),
          );

          await Promise.all(
            selectedEmployees.map((employee) =>
              updateEmployee(employee.id, toEmployeePayload(employee, targetDepartmentId)),
            ),
          );

          message.success(`Moved ${selectedEmployees.length} employee(s)`);
          setTargetDepartmentId(undefined);
          await fetchData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || "Failed to move selected employees");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const removeManyEmployees = async () => {
    if (selectedMemberRowKeys.length === 0) {
      message.warning("Please select members to remove");
      return;
    }

    Modal.confirm({
      title: "Confirm bulk remove",
      content: `Remove ${selectedMemberRowKeys.length} member(s) from ${selectedDepartment?.name || "current department"}?`,
      okText: "Remove",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        setSaving(true);
        try {
          const selectedEmployees = employees.filter((employee) =>
            selectedMemberRowKeys.includes(employee.id),
          );

          await Promise.all(
            selectedEmployees.map((employee) =>
              updateEmployee(employee.id, toEmployeePayload(employee, null)),
            ),
          );

          message.success(`Removed ${selectedEmployees.length} employee(s)`);
          await fetchData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || "Failed to remove selected employees");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const memberColumns = [
    {
      title: "Employee",
      key: "employee",
      render: (_: unknown, record: Employee) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.employeeNo || "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      render: (email: string | undefined) => email || "-",
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (position: string | undefined) => position || "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : "red"}>{status}</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right" as const,
      render: (_: unknown, record: Employee) => (
        <Space>
          <Button icon={<SwapOutlined />} onClick={() => openMoveModal(record)}>
            Move
          </Button>

          <Popconfirm
            title="Remove employee from this department?"
            okText="Remove"
            cancelText="Cancel"
            onConfirm={() => removeFromDepartment(record)}
          >
            <Button danger icon={<UserDeleteOutlined />}>
              Remove
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const assignColumns = [
    {
      title: "Employee",
      key: "employee",
      render: (_: unknown, record: Employee) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.employeeNo || "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Current Department",
      key: "department",
      render: (_: unknown, record: Employee) => record.department?.name || "Unassigned",
    },
    {
      title: "Actions",
      key: "actions",
      align: "right" as const,
      render: (_: unknown, record: Employee) => (
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => assignToDepartment(record.id)}
        >
          Assign
        </Button>
      ),
    },
  ];

  return (
    <Card loading={loading} variant="borderless">
      <PageHeader
        title="Department Members"
        subtitle="Assign, remove and move employees inside department organization"
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap>
          <Typography.Text strong>Select Department:</Typography.Text>
          <Select
            style={{ width: 320 }}
            value={selectedDepartmentId}
            onChange={(value) => setSelectedDepartmentId(value)}
            options={departments.map((department) => ({
              label: `${department.name} (${department.code})`,
              value: department.id,
            }))}
            placeholder="Select department"
          />
          <Tag color="blue">Derived Members: {departmentMembers.length}</Tag>
          <Typography.Text type="secondary">
            Single source of truth: Employee.departmentId
          </Typography.Text>
        </Space>

        <Card
          size="small"
          title={`Members in ${selectedDepartment?.name || "Department"}`}
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <Input.Search
              allowClear
              placeholder="Search by employee name / employee no"
              style={{ width: 320 }}
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <Select
              placeholder="Move selected to department"
              style={{ width: 280 }}
              value={targetDepartmentId}
              onChange={(value) => setTargetDepartmentId(value)}
              options={movableDepartmentOptions}
            />
            <Button
              type="primary"
              icon={<SwapOutlined />}
              disabled={selectedMemberRowKeys.length === 0}
              onClick={moveManyEmployees}
              loading={saving}
            >
              Move Selected ({selectedMemberRowKeys.length})
            </Button>
            <Button
              danger
              icon={<UserDeleteOutlined />}
              disabled={selectedMemberRowKeys.length === 0}
              onClick={removeManyEmployees}
              loading={saving}
            >
              Remove Selected ({selectedMemberRowKeys.length})
            </Button>
          </Space>
          <Table
            rowKey="id"
            loading={saving}
            columns={memberColumns}
            dataSource={filteredDepartmentMembers}
            rowSelection={{
              selectedRowKeys: selectedMemberRowKeys,
              onChange: (keys) => setSelectedMemberRowKeys(keys as string[]),
            }}
            pagination={{ pageSize: 8 }}
          />
        </Card>

        <Card size="small" title="Assignable Employees (same company)">
          <Space wrap style={{ marginBottom: 12 }}>
            <Input.Search
              allowClear
              placeholder="Search by employee name / employee no"
              style={{ width: 320 }}
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
            />
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              disabled={selectedAssignableRowKeys.length === 0}
              onClick={assignManyToDepartment}
              loading={saving}
            >
              Assign Selected ({selectedAssignableRowKeys.length})
            </Button>
          </Space>
          <Table
            rowKey="id"
            loading={saving}
            columns={assignColumns}
            dataSource={filteredAssignableEmployees}
            rowSelection={{
              selectedRowKeys: selectedAssignableRowKeys,
              onChange: (keys) => setSelectedAssignableRowKeys(keys as string[]),
            }}
            pagination={{ pageSize: 8 }}
          />
        </Card>
      </Space>

      <Modal
        title="Move Employee to Another Department"
        open={!!movingEmployee}
        onCancel={() => {
          setMovingEmployee(null);
          setTargetDepartmentId(undefined);
        }}
        onOk={confirmMoveEmployee}
        okText="Move"
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text>
            Employee: <Typography.Text strong>{movingEmployee?.name}</Typography.Text>
          </Typography.Text>
          <Select
            placeholder="Select target department"
            style={{ width: "100%" }}
            value={targetDepartmentId}
            onChange={(value) => setTargetDepartmentId(value)}
            options={movableDepartmentOptions}
          />
        </Space>
      </Modal>
    </Card>
  );
}