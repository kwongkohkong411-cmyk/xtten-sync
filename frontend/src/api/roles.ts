import client from "./client";

export const getRoles = () => client.get("/roles");

export const createRole = (data: any) =>
  client.post("/roles", data);

export const updateRole = (id: string, data: any) =>
  client.patch(`/roles/${id}`, data);

export const deleteRole = (id: string) =>
  client.delete(`/roles/${id}`);