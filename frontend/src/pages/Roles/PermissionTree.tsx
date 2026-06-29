import { Checkbox, Collapse, Divider, Tag, Typography } from "antd";

type Permission = {
  id: string;
  key?: string;
  module?: string;
  action?: string;
  desc?: string;
  label?: string;
};

type PermissionGroup = {
  groupKey: string;
  title: string;
  children: Array<{
    key: string;
    label: string;
  }>;
};

const GROUPS: PermissionGroup[] = [
  {
    groupKey: "dashboard",
    title: "Dashboard",
    children: [{ key: "dashboard:view", label: "View Real-time Status" }],
  },
  {
    groupKey: "attendance",
    title: "Attendance",
    children: [
      { key: "attendance:view", label: "View Attendance Records" },
      { key: "attendance:manage", label: "Manage Attendance Records" },
      { key: "report:export", label: "Export Work-hour Reports" },
    ],
  },
  {
    groupKey: "shift",
    title: "Shift",
    children: [
      { key: "shift:view", label: "View Shifts" },
      { key: "shift:manage", label: "Manage Rosters" },
    ],
  },
  {
    groupKey: "leave",
    title: "Leave",
    children: [
      { key: "leave:apply", label: "Apply Leave" },
      { key: "leave:view", label: "View Leave" },
      { key: "leave:manage", label: "Approve Leave" },
    ],
  },
  {
    groupKey: "reports",
    title: "Reports",
    children: [
      { key: "report:view", label: "View Reports" },
      { key: "report:export", label: "Export Reports" },
    ],
  },
  {
    groupKey: "activity",
    title: "Screenshot Wall",
    children: [
      { key: "activity:view", label: "View Screenshot Monitoring" },
      { key: "activity:manage", label: "Manage Screenshot Monitoring" },
    ],
  },
  {
    groupKey: "holiday",
    title: "Holiday Settings",
    children: [
      { key: "holiday:view", label: "View Holidays" },
      { key: "holiday:manage", label: "Manage Holidays" },
    ],
  },
  {
    groupKey: "user",
    title: "Users & Roles",
    children: [{ key: "user:manage", label: "Manage Users and Roles" }],
  },
];

const resolvePermissionKey = (permission: Permission) => {
  if (permission.key) return permission.key;
  if (permission.module && permission.action) return `${permission.module}:${permission.action}`;
  return "";
};

const getPermissionFallbackLabel = (permission: Permission) => {
  return permission.label || permission.desc || resolvePermissionKey(permission) || "-";
};

export default function PermissionTree({
  permissions,
  selectedIds,
  onChange,
}: {
  permissions: Permission[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const permissionByKey = new Map<string, Permission>();

  permissions.forEach((permission) => {
    const key = resolvePermissionKey(permission);
    if (key) {
      permissionByKey.set(key, permission);
    }
  });

  const mappedKeys = new Set(GROUPS.flatMap((group) => group.children.map((item) => item.key)));
  const unknownPermissions = permissions.filter((permission) => {
    const key = resolvePermissionKey(permission);
    return key && !mappedKeys.has(key);
  });

  const toggleGroup = (group: PermissionGroup, checked: boolean) => {
    const next = new Set(selectedIds);

    group.children.forEach((child) => {
      const permission = permissionByKey.get(child.key);
      if (!permission?.id) return;

      if (checked) {
        next.add(permission.id);
      } else {
        next.delete(permission.id);
      }
    });

    onChange(Array.from(next));
  };

  const togglePermission = (permissionId: string, checked: boolean) => {
    const next = new Set(selectedIds);

    if (checked) {
      next.add(permissionId);
    } else {
      next.delete(permissionId);
    }

    onChange(Array.from(next));
  };

  return (
    <div style={{ maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
      <Typography.Text strong>Permission Tree (By Menu Structure)</Typography.Text>

      <div style={{ marginTop: 12 }}>
        <Collapse
          size="small"
          defaultActiveKey={GROUPS.map((group) => group.groupKey)}
          items={GROUPS.map((group) => {
            const availableChildren = group.children.filter((child) => permissionByKey.get(child.key)?.id);
            const selectedCount = availableChildren.filter((child) => {
              const permission = permissionByKey.get(child.key);
              return permission?.id ? selectedSet.has(permission.id) : false;
            }).length;

            const parentChecked = availableChildren.length > 0 && selectedCount === availableChildren.length;
            const parentIndeterminate = selectedCount > 0 && selectedCount < availableChildren.length;

            return {
              key: group.groupKey,
              label: (
                <Checkbox
                  checked={parentChecked}
                  indeterminate={parentIndeterminate}
                  disabled={availableChildren.length === 0}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => toggleGroup(group, event.target.checked)}
                >
                  <Typography.Text strong>{group.title}</Typography.Text>
                </Checkbox>
              ),
              children: (
                <div style={{ marginLeft: 8, display: "grid", gap: 8 }}>
                  {group.children.map((child) => {
                    const permission = permissionByKey.get(child.key);
                    const isAvailable = !!permission?.id;
                    const checked = permission?.id ? selectedSet.has(permission.id) : false;

                    return (
                      <div key={`${group.groupKey}-${child.key}`}>
                        <Checkbox
                          checked={checked}
                          disabled={!isAvailable}
                          onChange={(event) => {
                            if (!permission?.id) return;
                            togglePermission(permission.id, event.target.checked);
                          }}
                        >
                          {child.label}
                        </Checkbox>
                        <Tag style={{ marginLeft: 8 }} color={isAvailable ? "blue" : "default"}>
                          {child.key}
                        </Tag>
                        {!isAvailable && (
                          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                            Not Configured
                          </Typography.Text>
                        )}
                      </div>
                    );
                  })}
                </div>
              ),
            };
          })}
        />
      </div>

      <Divider style={{ margin: "12px 0" }} />

      {unknownPermissions.length > 0 && (
        <>
          <Typography.Text strong>Other Permissions</Typography.Text>
          <div style={{ marginTop: 8, marginLeft: 8, display: "grid", gap: 8 }}>
            {unknownPermissions.map((permission) => (
              <div key={permission.id}>
                <Checkbox
                  checked={selectedSet.has(permission.id)}
                  onChange={(event) => togglePermission(permission.id, event.target.checked)}
                >
                  {getPermissionFallbackLabel(permission)}
                </Checkbox>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
