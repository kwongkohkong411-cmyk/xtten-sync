import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";

type SearchBarProps = {
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  width?: number;
};

export default function SearchBar({
  placeholder = "Search...",
  value,
  onChange,
  width = 320,
}: SearchBarProps) {
  return (
    <Input
      allowClear
      value={value}
      placeholder={placeholder}
      prefix={<SearchOutlined />}
      style={{ width }}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}