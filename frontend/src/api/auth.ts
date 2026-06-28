import api from "./client";

// =========================
// LOGIN（企业版统一字段）
// =========================
export const login = (account: string, password: string) => {
  return api.post("/auth/login", {
    account,
    password,
  });
};