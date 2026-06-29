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
    children: [{ key: "dashboard:view", label: "查看实时状态" }],
  },
  {
    groupKey: "attendance",
    title: "Attendance 打卡考勤",
    children: [
      { key: "attendance:view", label: "查看打卡记录" },
      { key: "attendance:manage", label: "管理打卡记录" },
      { key: "report:export", label: "导出工时报表" },
    ],
  },
  {
    groupKey: "shift",
    title: "Shift 班次管理",
    children: [
      { key: "shift:view", label: "查看班次" },
      { key: "shift:manage", label: "管理排班" },
    ],
  },
  {
    groupKey: "leave",
    title: "Leave 请假审批",
    children: [
      { key: "leave:apply", label: "提交请假" },
      { key: "leave:view", label: "查看请假" },
      { key: "leave:manage", label: "审批请假" },
    ],
  },
  {
    groupKey: "reports",
    title: "Reports 报表",
    children: [
      { key: "report:view", label: "查看报表" },
      { key: "report:export", label: "导出报表" },
    ],
  },
  {
    groupKey: "activity",
    title: "Activity Monitoring 监控",
    children: [
      { key: "activity:view", label: "查看监控" },
      { key: "activity:manage", label: "管理监控" },
    ],
  },
  {
    groupKey: "holiday",
    title: "Holiday Settings",
    children: [
      { key: "holiday:view", label: "查看假期" },
      { key: "holiday:manage", label: "管理假期" },
    ],
  },
  {
    groupKey: "user",
    title: "Users / Roles 管理",
    children: [{ key: "user:manage", label: "管理用户与角色" }],
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
      <Typography.Text strong>权限树（按菜单结构）</Typography.Text>

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
                            未配置
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
          <Typography.Text strong>其他权限</Typography.Text>
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
