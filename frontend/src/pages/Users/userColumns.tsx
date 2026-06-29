import { Avatar, Button, Space, Tag } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { User } from "./types";
import { getStatusColor } from "../../utils/statusColors";

export function getUserColumns(
  onEdit: (user: User) => void,
  onDelete: (user: User) => void
): ColumnsType<User> {
  return [
    {
      title: "Employee",
      key: "user",
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 700 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {record.username}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "Company",
      render: (_, record) => record.company?.name || "-",
    },
    {
      title: "Role",
      key: "role",
      render: (_, record) => record.roleRelation?.name || record.role || "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status}
        </Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      align: "right",
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => onEdit(record)}>
            Edit
          </Button>

          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];
}