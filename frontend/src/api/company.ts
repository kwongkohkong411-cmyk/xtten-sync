import client from "./client";

export const getCompanies = () => client.get("/companies");
export const getCompanyById = (id: string) => client.get(`/companies/${id}`);

export const createCompany = (data: any) =>
  client.post("/companies", data);

export const updateCompany = (id: string, data: any) =>
  client.patch(`/companies/${id}`, data);

export const deleteCompany = (id: string) =>
  client.delete(`/companies/${id}`);