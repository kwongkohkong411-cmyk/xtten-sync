import { Card, Space, Typography, Tag } from "antd";

const { Title, Text } = Typography;

type BillingPageProps = {
  title: string;
  description: string;
};

export default function BillingPage({ title, description }: BillingPageProps) {
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
          <Tag color="blue">Billing Module</Tag>
          <Text>
            This route is isolated for Company Admin and is now part of the unified
            Route + Sidebar single source architecture.
          </Text>
        </Space>
      </Card>
    </Space>
  );
}
