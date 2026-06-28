import type { ReactNode } from "react";
import { Flex, Typography, Space } from "antd";

const { Title, Text } = Typography;

interface Props {
  title: string;
  subtitle?: string;

  /** 右侧操作区（按钮/筛选/搜索都可以放） */
  extra?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  extra,
}: Props) {
  return (
    <Flex
      justify="space-between"
      align="flex-start"
      style={{ marginBottom: 24 }}
    >
      {/* 左侧标题区 */}
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {title}
        </Title>

        {subtitle && (
          <Text type="secondary">
            {subtitle}
          </Text>
        )}
      </div>

      {/* 右侧操作区 */}
      <Space size="middle">
        {extra}
      </Space>
    </Flex>
  );
}