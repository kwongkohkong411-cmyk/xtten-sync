import { useEffect, useState } from "react";
import { Alert, Button, Card, Select, Space, Table, Tag, Typography, message } from "antd";

import { getCompanies } from "../../api/company";
import { getTenantAuditLogs } from "../../api/tenantAuditLogs";
import { getScopeColor } from "../../utils/statusColors";

const { Title, Text } = Typography;

interface Props {
  initialScope?: "CORE" | "RUNTIME";
}

export default function TenantAuditLogs({ initialScope }: Props) {
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const [scope, setScope] = useState<string | undefined>(initialScope);
  const [rows, setRows] = useState<any[]>([]);

  const loadLogs = async (companyId?: string, currentScope?: string) => {
    if (!companyId) return;

    setLoading(true);
    try {
      const res = await getTenantAuditLogs({
        companyId,
        limit: 200,
        scope: currentScope,
      });
      setRows(res.data || []);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const companiesRes = await getCompanies();
        const list = companiesRes.data || [];
        setCompanies(list);

        if (!list.length) {
          message.info("No company found.");
          return;
        }

        const first = list[0];
        setSelectedCompanyId(first.id);
        await loadLogs(first.id, scope);
      } catch (e: any) {
        message.error(e?.response?.data?.message || "Failed to initialize audit logs");
      }
    };

    bootstrap();
  }, []);

  const columns = [
    {
      title: "Time",
      dataIndex: "createdAt",
      width: 200,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "Scope",
      dataIndex: "scope",
      width: 110,
      render: (value: string) => <Tag color={getScopeColor(value)}>{value}</Tag>,
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 260,
    },
    {
      title: "Entity",
      render: (_: unknown, row: any) => `${row.entityType}${row.entityId ? ` (${row.entityId})` : ""}`,
    },
    {
      title: "Actor",
      render: (_: unknown, row: any) => row.actor?.username || row.actor?.email || row.actorId || "SYSTEM",
    },
  ];

  return (
    <Card>
      <Title level={4}>Tenant Audit Logs</Title>
      <Text type="secondary">Track Core Tenant Profile and Runtime Config changes.</Text>

      <div style={{ marginTop: 12 }}>
        <Alert
          type="info"
          showIcon
          message="Visibility Notice"
          description="Company Admin can only view in-company business operation logs. SUPER_ADMIN platform-level operations are not shown here."
        />
      </div>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={selectedCompanyId}
            onChange={async (companyId) => {
              setSelectedCompanyId(companyId);
              await loadLogs(companyId, scope);
            }}
            placeholder="Select company"
            options={companies.map((company) => ({
              label: `${company.name} (${company.code})`,
              value: company.id,
            }))}
            style={{ width: 320 }}
          />

          <Select
            allowClear
            value={scope}
            onChange={async (value) => {
              setScope(value);
              await loadLogs(selectedCompanyId, value);
            }}
            placeholder="Scope"
            options={[
              { label: "CORE", value: "CORE" },
              { label: "RUNTIME", value: "RUNTIME" },
            ]}
            style={{ width: 180 }}
          />

          <Button onClick={() => loadLogs(selectedCompanyId, scope)}>Refresh</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1100 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["20", "50", "100"],
        }}
      />
    </Card>
  );
}
