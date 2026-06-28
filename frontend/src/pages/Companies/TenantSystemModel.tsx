import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
  message,
} from "antd";

import { getCompanies, getCompanyById, updateCompany } from "../../api/company";
import { getTenantConfig, upsertTenantConfig } from "../../api/tenantConfig";

type TabKey = "core" | "runtime";

interface Props {
  initialTab?: TabKey;
}

const { Title, Text } = Typography;

export default function TenantSystemModel({ initialTab = "core" }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(false);
  const [savingCore, setSavingCore] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();

  const [coreForm] = Form.useForm();
  const [runtimeForm] = Form.useForm();

  const canSaveAll = useMemo(() => !!selectedCompanyId, [selectedCompanyId]);

  const loadTenantSystem = async (companyId: string) => {
    setLoading(true);
    try {
      const [companyRes, runtimeRes] = await Promise.all([
        getCompanyById(companyId),
        getTenantConfig(companyId),
      ]);

      const company = companyRes.data;
      const runtime = runtimeRes.data;

      coreForm.setFieldsValue({
        name: company.name,
        code: company.code,
        logo: company.logo,
        timezone: company.timezone,
        country: company.country,
        status: company.status,
      });

      runtimeForm.setFieldsValue({
        isolationLevel: runtime.isolationLevel,
        allowCrossTenantReporting: runtime.allowCrossTenantReporting,
        enforceSso: runtime.enforceSso,
        defaultUserLimit: runtime.defaultUserLimit,
        defaultStorageGb: runtime.defaultStorageGb,
        trialDays: runtime.trialDays,
      });
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to load tenant system model");
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
          message.info("No company found. Create a company first.");
          return;
        }

        const firstCompany = list[0];
        setSelectedCompanyId(firstCompany.id);
        await loadTenantSystem(firstCompany.id);
      } catch (e: any) {
        message.error(e?.response?.data?.message || "Failed to initialize tenant system model");
      }
    };

    bootstrap();
  }, []);

  const handleCompanyChange = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    await loadTenantSystem(companyId);
  };

  const saveCore = async () => {
    if (!selectedCompanyId) {
      message.warning("Please select company");
      return;
    }

    const values = await coreForm.validateFields();
    setSavingCore(true);
    try {
      await updateCompany(selectedCompanyId, values);
      message.success("Core Tenant Profile saved");

      setCompanies((prev) =>
        prev.map((item) =>
          item.id === selectedCompanyId
            ? { ...item, name: values.name, code: values.code }
            : item,
        ),
      );
    } catch (e: any) {
      const rawMessage = e?.response?.data?.message;
      const normalized = Array.isArray(rawMessage) ? rawMessage.join(", ") : rawMessage;
      message.error(normalized || "Failed to save Core Tenant Profile");
    } finally {
      setSavingCore(false);
    }
  };

  const saveRuntime = async () => {
    if (!selectedCompanyId) {
      message.warning("Please select company");
      return;
    }

    const values = await runtimeForm.validateFields();
    setSavingRuntime(true);
    try {
      await upsertTenantConfig({
        companyId: selectedCompanyId,
        ...values,
      });
      message.success("Runtime Config saved");
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to save Runtime Config");
    } finally {
      setSavingRuntime(false);
    }
  };

  const saveAll = async () => {
    await saveCore();
    await saveRuntime();
  };

  return (
    <Card>
      <Title level={4}>Tenant System Model</Title>
      <Text type="secondary">
        Core Tenant Profile + Runtime Config unified in one model.
      </Text>

      <div style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <Select
              value={selectedCompanyId}
              onChange={handleCompanyChange}
              placeholder="Select company"
              options={companies.map((company) => ({
                label: `${company.name} (${company.code})`,
                value: company.id,
              }))}
              style={{ width: 360 }}
            />

            <Button type="primary" disabled={!canSaveAll} loading={savingCore || savingRuntime} onClick={saveAll}>
              Save Tenant System Model
            </Button>
          </Space>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
            items={[
              {
                key: "core",
                label: "Core Tenant Profile",
                children: (
                  <Form form={coreForm} layout="vertical" disabled={loading}>
                    <Form.Item label="Company Name" name="name" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>

                    <Form.Item label="Company Code" name="code" rules={[{ required: true }]}>
                      <Input disabled />
                    </Form.Item>

                    <Form.Item label="Logo URL" name="logo">
                      <Input placeholder="https://example.com/logo.png" />
                    </Form.Item>

                    <Form.Item label="Timezone" name="timezone" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: "Asia/Shanghai", label: "Asia/Shanghai" },
                          { value: "Asia/Singapore", label: "Asia/Singapore" },
                          { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
                          { value: "Asia/Bangkok", label: "Asia/Bangkok" },
                          { value: "UTC", label: "UTC" },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item label="Country / Region" name="country">
                      <Input />
                    </Form.Item>

                    <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: "ACTIVE", label: "ACTIVE" },
                          { value: "SUSPENDED", label: "SUSPENDED" },
                        ]}
                      />
                    </Form.Item>

                    <Button type="primary" loading={savingCore} onClick={saveCore}>
                      Save Core Profile
                    </Button>
                  </Form>
                ),
              },
              {
                key: "runtime",
                label: "Runtime Config",
                children: (
                  <Form form={runtimeForm} layout="vertical" disabled={loading}>
                    <Form.Item label="Isolation Level" name="isolationLevel" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: "STRICT", label: "STRICT (data schema isolation)" },
                          { value: "LOGICAL", label: "LOGICAL (tenant id filter)" },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Allow Cross-tenant Reporting"
                      name="allowCrossTenantReporting"
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>

                    <Form.Item label="Enforce SSO by default" name="enforceSso" valuePropName="checked">
                      <Switch />
                    </Form.Item>

                    <Space size={16} wrap style={{ width: "100%" }}>
                      <Form.Item label="Default User Limit" name="defaultUserLimit" rules={[{ required: true }]}>
                        <InputNumber min={1} max={100000} />
                      </Form.Item>

                      <Form.Item label="Default Storage (GB)" name="defaultStorageGb" rules={[{ required: true }]}>
                        <InputNumber min={1} max={100000} />
                      </Form.Item>

                      <Form.Item label="Trial Days" name="trialDays" rules={[{ required: true }]}>
                        <InputNumber min={0} max={365} />
                      </Form.Item>
                    </Space>

                    <Button type="primary" loading={savingRuntime} onClick={saveRuntime}>
                      Save Runtime Config
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </Space>
      </div>
    </Card>
  );
}
