import axios from "axios";

/**
 * 获取 API 基础 URL（不含 /api 后缀）
 * 根据当前访问的 host 动态确定 API 地址（支持局域网访问）
 * 生产环境使用相对路径，通过宝塔反向代理转发
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (typeof window !== "undefined") {
    const currentHost = window.location.hostname;
    if (currentHost !== "localhost" && currentHost !== "127.0.0.1") {
      // 生产环境使用相对路径，通过宝塔反向代理 /api 转发到后端
      return "";
    }
    return "http://localhost:1031";
  }
  return "";
}

// 设置全局 axios baseURL，确保所有页面使用正确的 API 地址
// 注意：所有请求路径需要包含 /api/ 前缀
axios.defaults.baseURL = getApiBaseUrl();

/**
 * 统一 API 客户端
 * 所有页面都应该使用这个实例发起请求
 * baseURL 已配置为正确的地址，请求路径需要包含 /api/ 前缀
 *
 * 使用示例：
 *   import { api } from '../lib/api'
 *   const resp = await api.get('/api/admin/users')
 *   const resp = await api.post('/api/auth/login', { username, password })
 */
export const api = axios.create({
  baseURL: getApiBaseUrl(),
});

/**
 * 设置认证令牌
 * 登录成功后调用此函数
 */
export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
    delete axios.defaults.headers.common["Authorization"];
  }
}

/**
 * 兼容旧代码的 fetch 封装
 * 新代码建议使用 api 实例
 */
export const apiFetch = (
  url: string,
  options?: RequestInit,
): Promise<Response> => {
  const baseUrl = getApiBaseUrl();
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
  return fetch(fullUrl, options);
};

/**
 * 兼容旧代码的 API_BASE 常量
 * 新代码建议使用 api 实例
 */
export const API_BASE = `${getApiBaseUrl()}/api`;
