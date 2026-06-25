import axios from "axios";

const API_URL = "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const getCompanies = () => {
  return api.get("/companies");
};

export const createCompany = (data) => {
  return api.post("/companies", data);
};

export const updateCompany = (id, data) => {
  return api.patch(`/companies/${id}`, data);
};

export const deleteCompany = (id) => {
  return api.delete(`/companies/${id}`);
};