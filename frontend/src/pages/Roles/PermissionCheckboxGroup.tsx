import { Checkbox, Col, Row } from 'antd';

const getPermissionDisplayName = (permission: any) => {
  if (permission?.label) return permission.label;
  if (permission?.desc) return permission.desc;
  if (permission?.key) return permission.key;
  if (permission?.module && permission?.action) return `${permission.module}:${permission.action}`;
  return '-';
};

export default function PermissionCheckboxGroup({
  permissions,
  selectedIds,
  onChange,
}: {
  permissions: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Row gutter={[12, 12]}>
      {permissions.map((permission) => (
        <Col key={permission.id} span={8}>
          <Checkbox
            value={permission.id}
            checked={selectedIds.includes(permission.id)}
            onChange={(event) => {
              if (event.target.checked) {
                onChange([...selectedIds, permission.id]);
              } else {
                onChange(selectedIds.filter((id) => id !== permission.id));
              }
            }}
          >
            {getPermissionDisplayName(permission)}
          </Checkbox>
        </Col>
      ))}
    </Row>
  );
}
