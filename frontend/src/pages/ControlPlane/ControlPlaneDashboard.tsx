import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Progress,
  Row,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  AlertOutlined,
  DatabaseOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import {
  getControlPlaneDashboard,
  getDryRunState,
  getGovernancePolicy,
  replayDlqEvent,
  replayGovernanceDecisionTimeline,
  setDryRunState,
  simulateGovernanceDecision,
} from "../../api/controlPlane";

const { Title, Text } = Typography;

type DashboardResponse = {
  metrics: {
    eventQueueDepth: number;
    eventProcessingLatencyMs: number | null;
    projectionStalenessMs: number | null;
    dlqCount: number;
    dlqGrowthLastHour: number;
    retryCountLastHour: number;
    eventsProcessedLastHour: number;
    healthy: boolean;
  };
  health: {
    throttled: boolean;
    healthy: boolean;
  };
  decision: {
    throttleQueue: boolean;
    pauseAutoRepair: boolean;
    freezeDlqReplay: boolean;
    repairBudgetPerMinute: number;
    repairCooldownPerEntityMs: number;
    repairMaxDepth: number;
    reason: string[];
    refreshedAt: string;
    stable: boolean;
    stableForMs: number;
    dryRunEnabled?: boolean;
    dryRunReason?: string;
    decisionId?: string;
    arbitrationVersion?: string;
    governanceTrace?: Array<{
      source: string;
      rule: string;
      priority: string;
      triggered: boolean;
      reason?: string;
    }>;
  };
  decisionTimeline: Array<{
    id: string;
    decisionText: string;
    reason?: string[] | null;
    metrics?: Record<string, unknown> | null;
    stable: boolean;
    stableForMs: number;
    createdAt: string;
  }>;
  repairLocks: Array<{
    id: string;
    companyId: string;
    entityType: string;
    entityId: string;
    owner: string;
    source: string;
    reason?: string | null;
    lockedUntil: string;
    createdAt: string;
    updatedAt: string;
  }>;
  deadLetters: Array<{
    eventLogId: string;
    companyId: string;
    entityType: string;
    entityId: string;
    action: string;
    failedAt: string;
    retryCount: number;
    lastError?: string | null;
  }>;
};

type SimulationResponse = {
  decision?: DashboardResponse["decision"];
  baselineMetrics?: DashboardResponse["metrics"];
  inputMetrics?: DashboardResponse["metrics"];
};

type ReplayResponse = {
  replayed: number;
  decisions: Array<{
    sourceDecisionLogId: string;
    createdAt: string;
    originalDecisionText: string;
    replayedDecision: {
      throttleQueue: boolean;
      pauseAutoRepair: boolean;
      freezeDlqReplay: boolean;
    };
    replayedReason: string[];
  }>;
};

function formatMs(value: number | null | undefined) {
  if (value == null) return "-";
  if (value < 1000) return `${value.toFixed(0)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function statusTag(value: boolean, onLabel: string, offLabel: string) {
  return <Tag color={value ? "red" : "green"}>{value ? onLabel : offLabel}</Tag>;
}

export default function ControlPlaneDashboard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<{ enabled: boolean; reason?: string }>({ enabled: false });
  const [dryRunReason, setDryRunReason] = useState("");
  const [policyPreview, setPolicyPreview] = useState<Record<string, unknown> | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [replayResult, setReplayResult] = useState<ReplayResponse | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dashboardRes, dryRunRes, policyRes] = await Promise.all([
        getControlPlaneDashboard({ limit: 20 }),
        getDryRunState(),
        getGovernancePolicy(),
      ]);
      setData(dashboardRes.data);
      setDryRun({
        enabled: Boolean(dryRunRes.data?.enabled),
        reason: dryRunRes.data?.reason,
      });
      setPolicyPreview(policyRes.data?.policy || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to load control plane dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const summaryCards = useMemo(() => {
    const metrics = data?.metrics;
    const decision = data?.decision;

    return [
      {
        title: "Queue Depth",
        value: metrics?.eventQueueDepth ?? 0,
        icon: <DatabaseOutlined />,
        trend: metrics?.healthy ? "Healthy ingest" : "Infra degraded",
      },
      {
        title: "Projection Lag",
        value: formatMs(metrics?.projectionStalenessMs),
        icon: <ThunderboltOutlined />,
        trend: decision?.pauseAutoRepair ? "Auto repair paused" : "Repair allowed",
      },
      {
        title: "DLQ Count",
        value: metrics?.dlqCount ?? 0,
        icon: <AlertOutlined />,
        trend: decision?.freezeDlqReplay ? "Replay frozen" : "Replay open",
      },
      {
        title: "Repair Budget",
        value: decision?.repairBudgetPerMinute ?? 0,
        icon: <SafetyOutlined />,
        trend: `${decision?.repairCooldownPerEntityMs ?? 0} ms cooldown`,
      },
    ];
  }, [data]);

  const timelineItems = useMemo(
    () =>
      (data?.decisionTimeline || []).map((item) => ({
        children: (
          <Card size="small" style={{ borderRadius: 14 }}>
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Space wrap>
                <Text strong>{item.decisionText}</Text>
                {item.stable ? <Tag color="green">Stable {formatMs(item.stableForMs)}</Tag> : <Tag color="gold">Settling</Tag>}
              </Space>
              <Text type="secondary">{formatTime(item.createdAt)}</Text>
              <Text>{(item.reason || []).join(", ") || "No abnormal condition"}</Text>
            </Space>
          </Card>
        ),
      })),
    [data],
  );

  const auditTimelineItems = useMemo(() => {
    const decisionItems = (data?.decisionTimeline || []).map((item) => ({
      ts: new Date(item.createdAt).getTime(),
      node: (
        <Card size="small" style={{ borderRadius: 14 }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Text strong>Decision Snapshot</Text>
            <Text>{item.decisionText}</Text>
            <Text type="secondary">{formatTime(item.createdAt)}</Text>
          </Space>
        </Card>
      ),
    }));

    const replayItems = (replayResult?.decisions || []).map((item) => ({
      ts: new Date(item.createdAt).getTime(),
      node: (
        <Card size="small" style={{ borderRadius: 14 }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Text strong>Replay Evaluation</Text>
            <Text>{item.originalDecisionText}</Text>
            <Text type="secondary">{formatTime(item.createdAt)}</Text>
            <Text>
              {item.replayedDecision.throttleQueue ? "THROTTLE_ON" : "THROTTLE_OFF"} | {item.replayedDecision.pauseAutoRepair ? "REPAIR_PAUSE_ON" : "REPAIR_PAUSE_OFF"} | {item.replayedDecision.freezeDlqReplay ? "DLQ_FREEZE_ON" : "DLQ_FREEZE_OFF"}
            </Text>
          </Space>
        </Card>
      ),
    }));

    return [...decisionItems, ...replayItems]
      .sort((a, b) => b.ts - a.ts)
      .map((item) => ({ children: item.node }));
  }, [data, replayResult]);

  const handleToggleDryRun = async (enabled: boolean) => {
    try {
      await setDryRunState(enabled, dryRunReason || dryRun.reason);
      message.success(enabled ? "Dry-run enabled" : "Dry-run disabled");
      await loadDashboard();
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Failed to update dry-run state");
    }
  };

  const handleSimulation = async () => {
    try {
      const res = await simulateGovernanceDecision({});
      setSimulation(res.data || null);
      message.success("Simulation completed");
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Simulation failed");
    }
  };

  const handleReplayTimeline = async () => {
    try {
      const res = await replayGovernanceDecisionTimeline({ limit: 20 });
      setReplayResult(res.data || null);
      message.success("Decision timeline replay completed");
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Replay timeline failed");
    }
  };

  const lockColumns = [
    { title: "Entity", render: (_: unknown, row: any) => `${row.entityType} / ${row.entityId}` },
    { title: "Owner", dataIndex: "owner" },
    { title: "Source", dataIndex: "source" },
    { title: "Reason", dataIndex: "reason", render: (value: string | null) => value || "-" },
    { title: "Locked Until", dataIndex: "lockedUntil", render: (value: string) => formatTime(value) },
  ];

  const dlqColumns = [
    { title: "Action", dataIndex: "action" },
    { title: "Entity", render: (_: unknown, row: any) => `${row.entityType} / ${row.entityId}` },
    { title: "Failed At", dataIndex: "failedAt", render: (value: string) => formatTime(value) },
    { title: "Retries", dataIndex: "retryCount" },
    {
      title: "Last Error",
      dataIndex: "lastError",
      render: (value: string | null) => value || "-",
    },
    {
      title: "Action",
      render: (_: unknown, row: any) => (
        <Button
          size="small"
          onClick={async () => {
            setReplaying(row.eventLogId);
            try {
              await replayDlqEvent(row.eventLogId);
              message.success(`Replayed ${row.eventLogId}`);
              await loadDashboard();
            } catch (error: any) {
              message.error(error?.response?.data?.message || "Replay failed");
            } finally {
              setReplaying(null);
            }
          }}
          loading={replaying === row.eventLogId}
        >
          Replay
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: "linear-gradient(180deg, #0b1020 0%, #111827 100%)", minHeight: "100%" }}>
      <div style={{ marginBottom: 20, color: "#fff" }}>
        <Title level={2} style={{ color: "#fff", marginBottom: 4 }}>
          Control Plane Admin Dashboard
        </Title>
        <Text style={{ color: "rgba(255,255,255,0.72)" }}>Control Decision Timeline, Metrics Live Panel, Lock / Repair Activity View, and DLQ Inspector.</Text>
      </div>

      <Row gutter={[16, 16]}>
        {summaryCards.map((card) => (
          <Col key={card.title} xs={24} sm={12} xl={6}>
            <Card style={{ borderRadius: 18, minHeight: 150 }} loading={loading}>
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Space style={{ justifyContent: "space-between", width: "100%" }} align="start">
                  <Text type="secondary">{card.title}</Text>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {card.icon}
                  </div>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>{card.value}</div>
                <Text style={{ color: "#0F766E", fontWeight: 700 }}>{card.trend}</Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ marginTop: 16, borderRadius: 20 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space wrap>
            <Tag color={data?.health?.healthy ? "green" : "red"}>{data?.health?.healthy ? "Healthy" : "Degraded"}</Tag>
            {statusTag(Boolean(data?.decision?.throttleQueue), "Queue Throttled", "Queue Open")}
            {statusTag(Boolean(data?.decision?.pauseAutoRepair), "Auto Repair Paused", "Auto Repair On")}
            {statusTag(Boolean(data?.decision?.freezeDlqReplay), "DLQ Replay Frozen", "DLQ Replay Allowed")}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={loadDashboard} loading={loading}>
            Refresh
          </Button>
        </Space>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} xl={14}>
            <Card title="Control Decision Timeline" style={{ borderRadius: 16, height: "100%" }}>
              {timelineItems.length ? (
                <Timeline items={timelineItems} />
              ) : (
                <Empty description="No decision history yet" />
              )}
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Card title="Metrics Live Panel" style={{ borderRadius: 16 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Queue depth">{data?.metrics?.eventQueueDepth ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Processing latency">{formatMs(data?.metrics?.eventProcessingLatencyMs)}</Descriptions.Item>
                <Descriptions.Item label="Projection staleness">{formatMs(data?.metrics?.projectionStalenessMs)}</Descriptions.Item>
                <Descriptions.Item label="DLQ growth / hour">{data?.metrics?.dlqGrowthLastHour ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Retries / hour">{data?.metrics?.retryCountLastHour ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Processed / hour">{data?.metrics?.eventsProcessedLastHour ?? 0}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Repair budget utilization</Text>
                <Progress
                  percent={Math.min(100, ((data?.decision?.repairBudgetPerMinute ?? 0) / 10) * 100)}
                  strokeColor={{ from: "#1677ff", to: "#13c2c2" }}
                  showInfo={false}
                />
              </div>

              <Alert
                style={{ marginTop: 16 }}
                type={data?.decision?.stable ? "success" : "warning"}
                showIcon
                message={data?.decision?.stable ? "Decision stabilized" : "Decision is still settling"}
                description={`Last refreshed at ${data?.decision?.refreshedAt ? formatTime(data.decision.refreshedAt) : "-"}`}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginTop: 16, borderRadius: 20 }} title="Governance v2 Convergence Layer">
        <Tabs
          items={[
            {
              key: "governance-controls",
              label: "Controls",
              children: (
                <Space direction="vertical" size={14} style={{ width: "100%" }}>
                  <Space wrap>
                    <Text strong>Dry-run Mode</Text>
                    <Switch checked={dryRun.enabled} onChange={handleToggleDryRun} loading={loading} />
                    <Tag color={dryRun.enabled ? "gold" : "green"}>{dryRun.enabled ? "Bypass Active" : "Enforcement Active"}</Tag>
                  </Space>
                  <Input
                    placeholder="Dry-run reason (optional)"
                    value={dryRunReason}
                    onChange={(e) => setDryRunReason(e.target.value)}
                  />
                  <Space wrap>
                    <Button onClick={handleSimulation}>Run Decision Simulation</Button>
                    <Button onClick={handleReplayTimeline}>Replay Decision Timeline</Button>
                    <Button onClick={loadDashboard} icon={<ReloadOutlined />} loading={loading}>
                      Refresh Policy Snapshot
                    </Button>
                  </Space>
                </Space>
              ),
            },
            {
              key: "policy-preview",
              label: "Policy Snapshot",
              children: policyPreview ? (
                <pre
                  style={{
                    margin: 0,
                    background: "#0b1020",
                    color: "#e5e7eb",
                    padding: 12,
                    borderRadius: 12,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(policyPreview, null, 2)}
                </pre>
              ) : (
                <Empty description="Policy not available" />
              ),
            },
            {
              key: "simulation-output",
              label: "Simulation Output",
              children: simulation?.decision ? (
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="Decision ID">{simulation.decision.decisionId || "-"}</Descriptions.Item>
                  <Descriptions.Item label="Arbitration">{simulation.decision.arbitrationVersion || "-"}</Descriptions.Item>
                  <Descriptions.Item label="Throttle Queue">{String(Boolean(simulation.decision.throttleQueue))}</Descriptions.Item>
                  <Descriptions.Item label="Pause Auto Repair">{String(Boolean(simulation.decision.pauseAutoRepair))}</Descriptions.Item>
                  <Descriptions.Item label="Freeze DLQ Replay">{String(Boolean(simulation.decision.freezeDlqReplay))}</Descriptions.Item>
                  <Descriptions.Item label="Reasons">{(simulation.decision.reason || []).join(", ") || "-"}</Descriptions.Item>
                </Descriptions>
              ) : (
                <Empty description="Run simulation to view decision output" />
              ),
            },
            {
              key: "audit-timeline",
              label: "Audit Timeline",
              children: auditTimelineItems.length ? (
                <Timeline items={auditTimelineItems} />
              ) : (
                <Empty description="No audit timeline entries" />
              ),
            },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={10}>
          <Card title="Lock / Repair Activity View" style={{ borderRadius: 16 }}>
            <Table
              rowKey="id"
              columns={lockColumns as any}
              dataSource={data?.repairLocks || []}
              pagination={false}
              locale={{ emptyText: <Empty description="No active repair locks" /> }}
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="DLQ Inspector" style={{ borderRadius: 16 }}>
            <Table
              rowKey="eventLogId"
              loading={loading}
              columns={dlqColumns as any}
              dataSource={data?.deadLetters || []}
              pagination={false}
              locale={{ emptyText: <Empty description="DLQ is empty" /> }}
              scroll={{ x: 900 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}