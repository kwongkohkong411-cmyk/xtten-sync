import React, { useMemo } from 'react';
import { Tree, TreeProps } from 'antd';
import type { TreeDataNode } from 'antd';

export interface PermissionNode {
  key: string;
  label: string;
  children?: PermissionNode[];
}

/**
 * 完整权限树定义（与后端保持同步）
 */
const PERMISSION_TREE: PermissionNode[] = [
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

interface PermissionTreeProps {
  selectedPermissionIds: string[];
  onChange?: (selectedIds: string[]) => void;
  disabled?: boolean;
}

/**
 * 获取所有叶子节点权限 key
 */
function getAllLeafKeys(nodes: PermissionNode[]): string[] {
  const keys: string[] = [];

  function traverse(nodeList: PermissionNode[]) {
    for (const node of nodeList) {
      if (!node.children || node.children.length === 0) {
        keys.push(node.key);
      } else {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return keys;
}

/**
 * 将权限 key 转换为 Tree 数据结构
 */
function convertToTreeData(permissionNodes: PermissionNode[]): TreeDataNode[] {
  return permissionNodes.map((node) => ({
    title: node.label,
    key: node.key,
    children: node.children
      ? convertToTreeData(node.children)
      : undefined,
  }));
}

/**
 * 检查节点的所有子节点是否都被选中
 */
function areAllChildrenSelected(
  nodeKey: string,
  selectedKeys: Set<string>,
  permissionTree: PermissionNode[],
): boolean {
  const childLeafKeys = getAllLeafKeysForNode(nodeKey, permissionTree);
  if (childLeafKeys.length === 0) return false;
  return childLeafKeys.every((key) => selectedKeys.has(key));
}

/**
 * 检查节点是否有部分子节点被选中
 */
function arePartialChildrenSelected(
  nodeKey: string,
  selectedKeys: Set<string>,
  permissionTree: PermissionNode[],
): boolean {
  const childLeafKeys = getAllLeafKeysForNode(nodeKey, permissionTree);
  if (childLeafKeys.length === 0) return false;

  const selectedCount = childLeafKeys.filter((key) =>
    selectedKeys.has(key),
  ).length;

  return selectedCount > 0 && selectedCount < childLeafKeys.length;
}

/**
 * 获取某个节点的所有叶子节点 key
 */
function getAllLeafKeysForNode(
  nodeKey: string,
  permissionTree: PermissionNode[],
): string[] {
  const keys: string[] = [];

  function findNode(nodes: PermissionNode[]): PermissionNode | null {
    for (const node of nodes) {
      if (node.key === nodeKey) {
        return node;
      }
      if (node.children) {
        const found = findNode(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  function getAllLeaves(nodes: PermissionNode[]) {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        keys.push(node.key);
      } else {
        getAllLeaves(node.children);
      }
    }
  }

  const targetNode = findNode(permissionTree);
  if (targetNode && targetNode.children) {
    getAllLeaves(targetNode.children);
  }

  return keys;
}

/**
 * 权限树组件
 * 支持多层级选择，父级勾选自动选中所有子权限
 */
const PermissionTree: React.FC<PermissionTreeProps> = ({
  selectedPermissionIds,
  onChange,
}) => {
  const selectedKeysSet = new Set(selectedPermissionIds);

  const treeData = useMemo(() => {
    const data = convertToTreeData(PERMISSION_TREE);

    const enhanceTreeData = (nodes: TreeDataNode[]): TreeDataNode[] => {
      return nodes.map((node) => {
        const key = node.key as string;
        const allChildLeafKeys = getAllLeafKeysForNode(key, PERMISSION_TREE);

        return {
          ...node,
          checkable: true,
          checked: allChildLeafKeys.every((k) => selectedKeysSet.has(k)),
          indeterminate:
            allChildLeafKeys.length > 0 &&
            !allChildLeafKeys.every((k) => selectedKeysSet.has(k)) &&
            allChildLeafKeys.some((k) => selectedKeysSet.has(k)),
          children: node.children
            ? enhanceTreeData(node.children as TreeDataNode[])
            : undefined,
        };
      });
    };

    return enhanceTreeData(data);
  }, [selectedKeysSet]);

  const handleCheck: TreeProps['onCheck'] = (checkedKeys, info) => {
    if (!onChange) return; // If disabled, don't handle changes

    const newSelectedKeys = new Set<string>();

    // 获取所有叶子节点
    const allLeafKeys = getAllLeafKeys(PERMISSION_TREE);

    // 处理 checkedKeys - 可能是数组或对象
    let keysToProcess: any[] = [];
    if (Array.isArray(checkedKeys)) {
      keysToProcess = checkedKeys;
    } else if (checkedKeys && typeof checkedKeys === 'object' && 'checked' in checkedKeys) {
      keysToProcess = checkedKeys.checked;
    }

    // 遍历所有已勾选的节点
    const processCheckedKeys = (keys: any[]) => {
      for (const key of keys) {
        const keyStr = key.toString();
        const leafKeysForNode = getAllLeafKeysForNode(keyStr, PERMISSION_TREE);

        if (leafKeysForNode.length > 0) {
          // 这是一个非叶子节点，添加所有子叶子节点
          leafKeysForNode.forEach((leafKey) =>
            newSelectedKeys.add(leafKey),
          );
        } else if (allLeafKeys.includes(keyStr)) {
          // 这是一个叶子节点，直接添加
          newSelectedKeys.add(keyStr);
        }
      }
    };

    processCheckedKeys(keysToProcess);

    onChange(Array.from(newSelectedKeys));
  };

  return (
    <Tree
      checkable
      onCheck={handleCheck}
      treeData={treeData}
      defaultExpandAll
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: '2px',
        padding: '8px',
        maxHeight: '600px',
        overflowY: 'auto',
      }}
    />
  );
};

export default PermissionTree;
