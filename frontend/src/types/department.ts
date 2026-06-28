export type Department = {
  id: string;
  name: string;
  code: string;
  status: string;

  company: {
    id: string;
    name: string;
  };

  companyId: string;
};