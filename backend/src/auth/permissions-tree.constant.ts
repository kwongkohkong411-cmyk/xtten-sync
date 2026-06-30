/**
 * Permission Tree Structure
 * 定义所有权限的多层级树结构
 * 格式: module > feature > action
 */

export interface PermissionNode {
  key: string;
  label: string;
  children?: PermissionNode[];
}

/**
 * 完整权限树定义
 */
export const PERMISSION_TREE: PermissionNode[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    children: [
      {
        key: 'dashboard:overview',
        label: 'Overview',
        children: [
          { key: 'dashboard:overview:view', label: 'View' },
        ],
      },
    ],
  },
  {
    key: 'organization',
    label: 'Organization',
    children: [
      {
        key: 'organization:company-manage',
        label: 'Company Manage',
        children: [
          { key: 'organization:company-manage:create', label: 'Create' },
          { key: 'organization:company-manage:edit', label: 'Edit' },
          { key: 'organization:company-manage:delete', label: 'Delete' },
          { key: 'organization:company-manage:view', label: 'View' },
        ],
      },
      {
        key: 'organization:company-users',
        label: 'Company Users',
        children: [
          { key: 'organization:company-users:create', label: 'Create' },
          { key: 'organization:company-users:edit', label: 'Edit' },
          { key: 'organization:company-users:delete', label: 'Delete' },
          { key: 'organization:company-users:view', label: 'View' },
        ],
      },
      {
        key: 'organization:company-roles',
        label: 'Company Roles',
        children: [
          { key: 'organization:company-roles:create', label: 'Create' },
          { key: 'organization:company-roles:edit', label: 'Edit' },
          { key: 'organization:company-roles:delete', label: 'Delete' },
          { key: 'organization:company-roles:view', label: 'View' },
        ],
      },
      {
        key: 'organization:roles-assignment',
        label: 'Roles Assignment',
        children: [
          { key: 'organization:roles-assignment:create', label: 'Create' },
          { key: 'organization:roles-assignment:edit', label: 'Edit' },
          { key: 'organization:roles-assignment:delete', label: 'Delete' },
          { key: 'organization:roles-assignment:view', label: 'View' },
        ],
      },
    ],
  },
  {
    key: 'teams',
    label: 'Teams',
    children: [
      {
        key: 'teams:team',
        label: 'Team',
        children: [
          { key: 'teams:team:create', label: 'Create' },
          { key: 'teams:team:edit', label: 'Edit' },
          { key: 'teams:team:delete', label: 'Delete' },
          { key: 'teams:team:view', label: 'View' },
        ],
      },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    children: [
      {
        key: 'attendance:records',
        label: 'Attendance Records',
        children: [
          { key: 'attendance:records:view', label: 'View' },
        ],
      },
      {
        key: 'attendance:calendar',
        label: 'Attendance Calendar',
        children: [
          { key: 'attendance:calendar:view', label: 'View' },
        ],
      },
      {
        key: 'attendance:summary',
        label: 'Attendance Summary',
        children: [
          { key: 'attendance:summary:view', label: 'View' },
        ],
      },
    ],
  },
  {
    key: 'shift',
    label: 'Shift',
    children: [
      {
        key: 'shift:templates',
        label: 'Shift Templates',
        children: [
          { key: 'shift:templates:create', label: 'Create' },
          { key: 'shift:templates:view', label: 'View' },
          { key: 'shift:templates:edit', label: 'Edit' },
          { key: 'shift:templates:delete', label: 'Delete' },
        ],
      },
      {
        key: 'shift:rosters',
        label: 'Rosters',
        children: [
          { key: 'shift:rosters:create', label: 'Create' },
          { key: 'shift:rosters:view', label: 'View' },
          { key: 'shift:rosters:edit', label: 'Edit' },
          { key: 'shift:rosters:delete', label: 'Delete' },
        ],
      },
    ],
  },
  {
    key: 'leave',
    label: 'Leave',
    children: [
      {
        key: 'leave:apply',
        label: 'Apply Leave',
        children: [
          { key: 'leave:apply:create', label: 'Create' },
          { key: 'leave:apply:view', label: 'View' },
          { key: 'leave:apply:delete', label: 'Delete' },
        ],
      },
      {
        key: 'leave:requests',
        label: 'Requests',
        children: [
          { key: 'leave:requests:view', label: 'View' },
          { key: 'leave:requests:edit', label: 'Edit' },
          { key: 'leave:requests:delete', label: 'Delete' },
          { key: 'leave:requests:approve', label: 'Approve' },
          { key: 'leave:requests:reject', label: 'Reject' },
        ],
      },
      {
        key: 'leave:settings',
        label: 'Settings',
        children: [
          { key: 'leave:settings:create', label: 'Create' },
          { key: 'leave:settings:view', label: 'View' },
          { key: 'leave:settings:edit', label: 'Edit' },
          { key: 'leave:settings:delete', label: 'Delete' },
        ],
      },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    children: [
      {
        key: 'reports:daily',
        label: 'Daily Report',
        children: [
          { key: 'reports:daily:view', label: 'View' },
          { key: 'reports:daily:export', label: 'Export' },
        ],
      },
      {
        key: 'reports:monthly',
        label: 'Monthly Report',
        children: [
          { key: 'reports:monthly:view', label: 'View' },
          { key: 'reports:monthly:export', label: 'Export' },
        ],
      },
      {
        key: 'reports:summary',
        label: 'Summary Report',
        children: [
          { key: 'reports:summary:view', label: 'View' },
          { key: 'reports:summary:export', label: 'Export' },
        ],
      },
    ],
  },
  {
    key: 'users-roles',
    label: 'Users & Roles',
    children: [
      {
        key: 'users-roles:users',
        label: 'Users',
        children: [
          { key: 'users-roles:users:create', label: 'Create' },
          { key: 'users-roles:users:view', label: 'View' },
          { key: 'users-roles:users:edit', label: 'Edit' },
          { key: 'users-roles:users:delete', label: 'Delete' },
        ],
      },
      {
        key: 'users-roles:roles',
        label: 'Roles',
        children: [
          { key: 'users-roles:roles:edit', label: 'Edit' },
          { key: 'users-roles:roles:delete', label: 'Delete' },
        ],
      },
      {
        key: 'users-roles:permissions',
        label: 'Permissions Assignment',
        children: [
          { key: 'users-roles:permissions:create', label: 'Create' },
          { key: 'users-roles:permissions:edit', label: 'Edit' },
        ],
      },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    children: [
      {
        key: 'billing:plan',
        label: 'Plan',
        children: [
          { key: 'billing:plan:view', label: 'View' },
        ],
      },
      {
        key: 'billing:invoice',
        label: 'Invoice',
        children: [
          { key: 'billing:invoice:view', label: 'View' },
        ],
      },
    ],
  },
  {
    key: 'screenshot',
    label: 'Screenshot Wall',
    children: [
      {
        key: 'screenshot:wall',
        label: 'Screenshot Wall',
        children: [
          { key: 'screenshot:wall:view', label: 'View' },
          { key: 'screenshot:wall:export', label: 'Export' },
        ],
      },
    ],
  },
  {
    key: 'profile',
    label: 'Profile',
    children: [
      {
        key: 'profile:profile',
        label: 'Profile',
        children: [
          { key: 'profile:profile:view', label: 'View' },
        ],
      },
    ],
  },
];

/**
 * 获取所有叶子节点权限 (最底层的权限)
 */
export function getAllLeafPermissions(
  tree: PermissionNode[] = PERMISSION_TREE,
): string[] {
  const permissions: string[] = [];

  function traverse(nodes: PermissionNode[]) {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        // 叶子节点
        permissions.push(node.key);
      } else {
        // 递归遍历子节点
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return permissions;
}

/**
 * 检查权限 key 是否有效
 */
export function isValidPermissionKey(key: string): boolean {
  const allLeafPermissions = getAllLeafPermissions();
  return allLeafPermissions.includes(key);
}

/**
 * 从权限集合获取所有父权限
 * 例: 如果有 'dashboard:overview:view'，则返回 'dashboard', 'dashboard:overview'
 */
export function getParentPermissions(permissionKey: string): string[] {
  const parents: string[] = [];
  const parts = permissionKey.split(':');

  for (let i = 1; i < parts.length; i++) {
    parents.push(parts.slice(0, i).join(':'));
  }

  return parents;
}

/**
 * 获取某个权限节点的所有子权限 (叶子节点)
 */
export function getChildPermissions(
  parentKey: string,
  tree: PermissionNode[] = PERMISSION_TREE,
): string[] {
  const children: string[] = [];

  function traverse(nodes: PermissionNode[]) {
    for (const node of nodes) {
      if (node.key === parentKey) {
        // 找到了父节点，获取所有子权限
        if (node.children) {
          getLeafNodes(node.children);
        }
        return;
      }

      if (node.children) {
        traverse(node.children);
      }
    }
  }

  function getLeafNodes(nodes: PermissionNode[]) {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        children.push(node.key);
      } else {
        getLeafNodes(node.children);
      }
    }
  }

  traverse(tree);
  return children;
}

/**
 * 角色权限预设矩阵
 */
export const ROLE_PERMISSIONS_PRESETS: Record<string, string[]> = {
  SUPER_ADMIN: getAllLeafPermissions(), // 全部权限

  COMPANY_ADMIN: [
    // Dashboard
    'dashboard:overview:view',
    // Organization
    'organization:company-manage:create',
    'organization:company-manage:edit',
    'organization:company-manage:delete',
    'organization:company-manage:view',
    'organization:company-users:create',
    'organization:company-users:edit',
    'organization:company-users:delete',
    'organization:company-users:view',
    'organization:company-roles:view',
    'organization:company-roles:edit',
    'organization:company-roles:delete',
    'organization:roles-assignment:create',
    'organization:roles-assignment:edit',
    'organization:roles-assignment:delete',
    'organization:roles-assignment:view',
    // Teams
    'teams:team:create',
    'teams:team:edit',
    'teams:team:delete',
    'teams:team:view',
    // Attendance
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    // Shift
    'shift:templates:create',
    'shift:templates:view',
    'shift:templates:edit',
    'shift:templates:delete',
    'shift:rosters:create',
    'shift:rosters:view',
    'shift:rosters:edit',
    'shift:rosters:delete',
    // Leave
    'leave:apply:create',
    'leave:apply:view',
    'leave:apply:delete',
    'leave:requests:view',
    'leave:requests:edit',
    'leave:requests:delete',
    'leave:requests:approve',
    'leave:requests:reject',
    'leave:settings:create',
    'leave:settings:view',
    'leave:settings:edit',
    'leave:settings:delete',
    // Reports
    'reports:daily:view',
    'reports:daily:export',
    'reports:monthly:view',
    'reports:monthly:export',
    'reports:summary:view',
    'reports:summary:export',
    // Users & Roles
    'users-roles:users:create',
    'users-roles:users:view',
    'users-roles:users:edit',
    'users-roles:users:delete',
    'users-roles:roles:edit',
    'users-roles:roles:delete',
    'users-roles:permissions:create',
    'users-roles:permissions:edit',
    // Billing
    'billing:plan:view',
    'billing:invoice:view',
    // Profile
    'profile:profile:view',
    // Screenshot Wall
    'screenshot:wall:view',
    'screenshot:wall:export',
  ],

  TEAM_LEAD: [
    // Dashboard
    'dashboard:overview:view',
    // Teams
    'teams:team:create',
    'teams:team:edit',
    'teams:team:delete',
    'teams:team:view',
    // Attendance
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    // Shift
    'shift:templates:create',
    'shift:templates:view',
    'shift:templates:edit',
    'shift:templates:delete',
    'shift:rosters:create',
    'shift:rosters:view',
    'shift:rosters:edit',
    'shift:rosters:delete',
    // Leave
    'leave:apply:create',
    'leave:apply:view',
    'leave:requests:view',
    'leave:requests:edit',
    'leave:requests:approve',
    'leave:requests:reject',
    // Reports
    'reports:daily:view',
    'reports:daily:export',
    'reports:monthly:view',
    'reports:monthly:export',
    'reports:summary:view',
    'reports:summary:export',
    // Users & Roles
    'users-roles:users:create',
    'users-roles:users:view',
    'users-roles:users:edit',
    'users-roles:users:delete',
    // Profile
    'profile:profile:view',
    // Screenshot Wall
    'screenshot:wall:view',
    'screenshot:wall:export',
  ],

  EMPLOYEE: [
    // Dashboard
    'dashboard:overview:view',
    // Teams
    'teams:team:view',
    // Attendance
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    // Leave
    'leave:apply:create',
    'leave:apply:view',
    'leave:apply:delete',
    'leave:requests:view',
    // Profile
    'profile:profile:view',
  ],
};
