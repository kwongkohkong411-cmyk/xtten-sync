import { Card, Typography } from "antd";
import type { ReactNode } from "react";

const { Text } = Typography;

interface Props {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
}

export default function StatCard({ title, value, icon, trend }: Props) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <Text style={{ color: "#64748B", fontWeight: 600 }}>{title}</Text>

          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              marginTop: 10,
              letterSpacing: "-0.04em",
            }}
          >
            {value}
          </div>

          {trend && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "#16A34A",
                fontWeight: 700,
              }}
            >
              {trend}
            </div>
          )}
        </div>

        {icon && (
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              background: "#F1F5F9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}