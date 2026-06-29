import { Card, Space, Typography, Tag } from "antd";

const { Title, Text } = Typography;

type SystemPageProps = {
  title: string;
  description: string;
};

export default function SystemPage({ title, description }: SystemPageProps) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginBottom: 4 }}>
          {title}
        </Title>
        <Text type="secondary">{description}</Text>
      </Card>

      <Card>
        <Space direction="vertical" size={8}>
          <Tag color="red">System Module</Tag>
          <Text>
            This route is isolated for Super Admin and is now part of the unified
            Route + Sidebar single source architecture.
          </Text>
        </Space>
      </Card>
    </Space>
  );
}
