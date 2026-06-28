export interface Company {
  id: string;

  name: string;

  code: string;

  country?: string;

  timezone: string;

  logo?: string;

  plan: string;

  status: string;

  users?: Array<{
    id: string;
    email: string;
    username: string;
    name: string;
    role: string;
    roleId?: string | null;
    roleRelation?: {
      id: string;
      name: string;
    } | null;
    status: string;
    createdAt?: string;
  }>;

  createdAt: string;

  updatedAt: string;
}