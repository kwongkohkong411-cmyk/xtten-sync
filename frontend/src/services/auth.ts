import client from "../api/client";

export async function login(email: string, password: string) {
  const res = await client.post("/auth/login", {
    email,
    password,
  });

  return res.data;
}