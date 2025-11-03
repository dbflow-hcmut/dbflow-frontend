export const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
export const FE_BASE = process.env.NEXT_PUBLIC_APP_URL;

export const API_LOGIN = `${API_BASE}/auth/login`;

export const PROXY_BASE = `${FE_BASE}/api/proxy`;

export const PROXY_USERS = `${PROXY_BASE}/users`;
export const PROXY_USERS_ME = `${PROXY_USERS}/me`;
