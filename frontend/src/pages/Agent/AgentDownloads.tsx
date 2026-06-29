import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloudDownloadOutlined,
  LaptopOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getAgentReleases,
  openAgentDownload,
  type AgentArtifact,
  type AgentReleasesResponse,
} from '../../api/agent';

const { Title, Text, Paragraph } = Typography;

function formatBytes(size: number | null) {
  if (!size || size <= 0) return 'Pending';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function renderArtifactButton(platform: 'windows' | 'macos', artifact: AgentArtifact) {
  return (
    <Button
      key={`${platform}-${artifact.format}`}
      type={artifact.available ? 'primary' : 'default'}
      icon={<CloudDownloadOutlined />}
      disabled={!artifact.available}
      onClick={() => {
        if (!artifact.available) {
          message.info('This package is not published yet.');
          return;
        }
        openAgentDownload(platform, artifact.format);
      }}
    >
      {`Download ${artifact.format.toUpperCase()} (${formatBytes(artifact.size)})`}
    </Button>
  );
}

export default function AgentDownloads() {
  const [loading, setLoading] = useState(false);
  const [releases, setReleases] = useState<AgentReleasesResponse | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await getAgentReleases();
        setReleases(res.data);
      } catch (err: any) {
        message.error(err?.response?.data?.message || 'Failed to load agent release info');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const windowsArtifacts = useMemo(
    () => releases?.platforms?.windows?.artifacts || [],
    [releases],
  );
  const macArtifacts = useMemo(
    () => releases?.platforms?.macos?.artifacts || [],
    [releases],
  );

  return (
    <Space direction='vertical' size={16} style={{ width: '100%' }}>
      <Card loading={loading}>
        <Space direction='vertical' size={6}>
          <Title level={4} style={{ margin: 0 }}>Agent Download Center</Title>
          <Text type='secondary'>Distribute employee desktop agent installers by platform.</Text>
          <Descriptions column={2} size='small'>
            <Descriptions.Item label='Current Version'>
              <Tag color='blue'>{releases?.version || 'N/A'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label='Last Refreshed'>
              {releases?.generatedAt ? dayjs(releases.generatedAt).format('YYYY-MM-DD HH:mm:ss') : 'N/A'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<Space><WindowsOutlined />Windows Agent</Space>}>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Text>Version: {releases?.platforms?.windows?.version || '-'}</Text>
              <Space wrap>
                {windowsArtifacts.map((artifact) => renderArtifactButton('windows', artifact))}
              </Space>
              <Divider style={{ margin: '10px 0' }} />
              <Paragraph style={{ marginBottom: 6 }}>
                Install steps (Windows)
              </Paragraph>
              <Text>1. Download EXE or MSI package.</Text>
              <Text>2. Install and open XTTEN Agent.</Text>
              <Text>3. Log in with employee account.</Text>
              <Text>4. Keep app running in tray for telemetry upload.</Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<Space><LaptopOutlined />macOS Agent</Space>}>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Text>Version: {releases?.platforms?.macos?.version || 'coming-soon'}</Text>
              <Space wrap>
                {macArtifacts.map((artifact) => renderArtifactButton('macos', artifact))}
              </Space>
              <Alert
                type='info'
                showIcon
                message='macOS release is scheduled after Windows.'
                description='Planned follow-up includes Screen Recording and Accessibility permission onboarding.'
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
