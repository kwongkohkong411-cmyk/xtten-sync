import { Table } from "antd";
import type { TableProps } from "antd";

export default function DataTable<T extends object>(props: TableProps<T>) {
  return <Table<T> {...props} />;
}