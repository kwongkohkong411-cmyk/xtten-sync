import api from "../api/axios";

export async function login(email: string, password: string) {
  const res = await api.post("/auth/login", {
    email,
    password,
  });

  return res.data;
}