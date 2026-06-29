import { useEffect, useState } from "react";
import { Alert, Card, Empty, Space, Table, Tag, Typography } from "antd";
import { getEmployee360 } from "../../api/employees";

type ProfileResponse = {
  profile?: {
    id?: string;
    employeeNo?: string | null;
    name?: string;
    email?: string | null;
    phone?: string | null;
    position?: string | null;
    status?: string;
    departmentName?: string | null;
    teamName?: string | null;
  };
  activity?: {
    items?: Array<{
      at?: string;
      appName?: string;
      website?: string;
      windowTitle?: string;
      category?: string;
    }>;
  };
};

const { Title, Text } = Typography;

function toDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);

  const employeeId = localStorage.getItem("employee_id") || "";

  useEffect(() => {
    if (!employeeId) {
      setData(null);
      setError("No employee identity found in current session.");
      return;
    }

    setLoading(true);
    setError(null);

    getEmployee360(employeeId, {
      includeAttendance: false,
      includeActivity: true,
      includeDepartmentHistory: false,
      includeLifecycle: false,
      includeTimeline: false,
      activityPage: 1,
      activityPageSize: 20,
    })
      .then((res) => {
        setData(res.data || null);
      })
      .catch((err: any) => {
        setError(err?.response?.data?.message || "Failed to load profile");
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [employeeId]);

  const profile = data?.profile;
  const activityRows = data?.activity?.items || [];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginBottom: 4 }}>
          My Profile
        </Title>
        <Text type="secondary">
          View personal profile, app usage, and website activity history.
        </Text>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Card loading={loading} title="Personal Information">
        {profile ? (
          <Space direction="vertical" size={8}>
            <Text>Name: {profile.name || "-"}</Text>
            <Text>Employee No: {profile.employeeNo || "-"}</Text>
            <Text>Position: {profile.position || "-"}</Text>
            <Text>Department: {profile.departmentName || "-"}</Text>
            <Text>Team: {profile.teamName || "-"}</Text>
            <Text>Status: <Tag color={profile.status === "ACTIVE" ? "green" : "orange"}>{profile.status || "-"}</Tag></Text>
          </Space>
        ) : (
          <Empty description="No profile data" />
        )}
      </Card>

      <Card loading={loading} title="Recent Activity">
        <Table
          rowKey={(_, index) => `activity-${index}`}
          dataSource={activityRows}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "No activity logs" }}
          columns={[
            {
              title: "Time",
              dataIndex: "at",
              render: (value: string) => toDateTime(value),
            },
            {
              title: "Software",
              dataIndex: "appName",
              render: (value: string) => value || "-",
            },
            {
              title: "Website",
              dataIndex: "website",
              render: (value: string) => value || "-",
            },
            {
              title: "Window",
              dataIndex: "windowTitle",
              render: (value: string) => value || "-",
            },
            {
              title: "Category",
              dataIndex: "category",
              render: (value: string) => value || "-",
            },
          ]}
        />
      </Card>
    </Space>
  );
}
