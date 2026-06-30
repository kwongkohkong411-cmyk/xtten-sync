export interface Company {
  id: string;
  name: string;
}

export interface WorkGroup {
  id: string;
  name: string;
  code?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  username: string;
  role: string;
  roleId?: string | null;
  roleRelation?: {
    id: string;
    name: string;
  } | null;
  status: string;
  companyId?: string | null;
  company?: Company | null;
  workGroupId?: string | null;
  workGroup?: WorkGroup | null;
}