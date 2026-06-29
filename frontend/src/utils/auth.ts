export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: string;
  roleId?: string | null;
  permissions?: string[];
  companyId?: string | null;
  company?: {
    id: string;
    name: string;
    logo?: string | null;
  } | null;
  employeeId?: string | null;
}

const SUPER_ADMIN_OWNER_USERNAME = 'sn888xt';

export function getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem('xtten_user');
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function isSuperAdminOwner(user?: CurrentUser | null): boolean {
  const target = user || getCurrentUser();
  return (target?.username || '').trim().toLowerCase() === SUPER_ADMIN_OWNER_USERNAME;
}

export function hasPermission(permission: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;

  // Reserved entry for platform owner only.
  if (permission === 'system:admin') {
    return isSuperAdminOwner(user);
  }

  const permissions = user.permissions || [];
  if (permissions.includes(permission)) return true;

  const aliasPermission = permission.includes('.')
    ? permission.replace('.', ':')
    : permission.replace(':', '.');

  return permissions.includes(aliasPermission);
}
