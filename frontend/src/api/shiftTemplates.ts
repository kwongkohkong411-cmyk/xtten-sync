import client from "./client";

export const getShiftTemplates = () =>
  client.get("/shift-templates");

export const getShiftTemplate = (id: string) =>
  client.get(`/shift-templates/${id}`);

export const createShiftTemplate = (data: any) =>
  client.post("/shift-templates", data);

export const updateShiftTemplate = (id: string, data: any) =>
  client.patch(`/shift-templates/${id}`, data);

export const deleteShiftTemplate = (id: string) =>
  client.delete(`/shift-templates/${id}`);