import client from "./client";

export const getDepartments = () =>
  client.get("/departments");

export const createDepartment = (data: any) =>
  client.post("/departments", data);

export const updateDepartment = (
  id: string,
  data: any
) =>
  client.patch(`/departments/${id}`, data);

export const deleteDepartment = (
  id: string
) =>
  client.delete(`/departments/${id}`);