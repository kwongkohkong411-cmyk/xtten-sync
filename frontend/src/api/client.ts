import axios from "axios";

const resolveApiBaseUrl = () => {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envBaseUrl) return envBaseUrl;

  const runtimeBaseUrl = localStorage.getItem("xtten_api_base_url");
  if (runtimeBaseUrl) return runtimeBaseUrl;

  const protocol = window.location.protocol === "https:" ? "https" : "http";

  return `${protocol}://XTIAN:3000`;
};

export const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// =========================
// REQUEST：自动带 token
// =========================
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("xtten_token");
  const userRaw = localStorage.getItem("xtten_user");
  const companyIdFromStorage = localStorage.getItem("company_id");
  let companyIdFromUser: string | null = null;

  if (userRaw) {
    try {
      const user = JSON.parse(userRaw) as { companyId?: string | null };
      companyIdFromUser = user?.companyId || null;
    } catch {
      companyIdFromUser = null;
    }
  }

  const companyId = companyIdFromUser || companyIdFromStorage;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (companyId) {
    config.headers["x-company-id"] = companyId;
  }

  return config;
});

// =========================
// RESPONSE：智能错误处理（修复版）
// =========================
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const message = err?.response?.data?.message || err?.message || 'Network or server error';
    const requestUrl = String(err?.config?.url || '');
    const silentError = requestUrl.includes('/agent/releases');

    if (silentError) {
      return Promise.reject(err);
    }

    console.log("API ERROR:", status, message);

    if (!err?.response) {
      console.warn("Network error: backend may be unavailable or unreachable", err?.message);
      return Promise.reject(err);
    }

    // =========================
    // ❌ 401 处理（关键修复点）
    // =========================
    if (status === 401) {
      const isTokenError =
        message === "Unauthorized" ||
        message === "jwt expired" ||
        message === "invalid token" ||
        message === "Token expired";

      if (isTokenError) {
        // 👉 只有真正登录失效才退出
        localStorage.removeItem("xtten_token");
        localStorage.removeItem("xtten_user");
        localStorage.removeItem("company_id");
        localStorage.removeItem("employee_id");

        window.location.href = "/";
        return Promise.reject(err);
      }

      // 👉 业务类 401（比如 employee not found）
      console.warn("Business 401 (NOT logout):", message);

      return Promise.reject(err);
    }

    // =========================
    // ❌ 403 无权限（不退出）
    // =========================
    if (status === 403) {
      console.warn("No permission:", message);
      return Promise.reject(err);
    }

    // =========================
    // ❌ 其他错误
    // =========================
    return Promise.reject(err);
  }
);

export default api;