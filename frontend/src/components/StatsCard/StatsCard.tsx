import { Card, Statistic } from "antd";
import type { ReactNode } from "react";

type StatsCardProps = {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

export default function StatsCard({
  title,
  value,
  prefix,
  suffix,
}: StatsCardProps) {
  return (
    <Card bordered={false}>
      <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />
    </Card>
  );
}