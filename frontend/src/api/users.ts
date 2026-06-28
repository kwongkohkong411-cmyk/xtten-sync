import client from "./client";

export const getUsers = () =>
  client.get("/users");

export const getUsersByCompany = (companyId: string) =>
  client.get(`/users/company/${companyId}`);

export const createUser = (data: any) =>
  client.post("/users", data);

export const updateUser = (
  id: string,
  data: any
) =>
  client.patch(`/users/${id}`, data);

export const updateUserStatus = (id: string, status: string) =>
  client.patch(`/users/${id}/status`, { status });

export const assignUserRole = (id: string, roleId: string) =>
  client.patch(`/users/${id}/role`, { roleId });

export const resetUserPassword = (id: string, newPassword: string) =>
  client.patch(`/users/${id}/reset-password`, { newPassword });

export const deleteUser = (
  id: string
) =>
  client.delete(`/users/${id}`);