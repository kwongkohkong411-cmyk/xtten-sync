export interface Employee {
  id: string;

  employeeNo?: string;

  name: string;

  email?: string;

  phone?: string;

  position?: string;

  status: string;

  companyId: string;

  departmentId?: string;

  company?: {
    id: string;
    name: string;
  };

  department?: {
    id: string;
    name: string;
  };

  createdAt: string;
  updatedAt: string;
}