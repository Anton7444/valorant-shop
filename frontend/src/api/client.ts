import type {
  BundleResponse,
  DailyStoreResponse,
  SessionResponse,
  Wallet,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'session_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth

export interface LoginResponse {
  status: 'success' | 'error';
  session_token?: string | null;
  puuid?: string | null;
  error?: string | null;
}

export function getAuthUrl(): Promise<{ auth_url: string }> {
  return request('/api/auth/url');
}

export function submitToken(url: string): Promise<LoginResponse> {
  return request('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function logout(): Promise<{ status: string }> {
  return request('/api/auth/logout', { method: 'POST' });
}

export function checkSession(): Promise<SessionResponse> {
  return request('/api/auth/session');
}

// Store

export function getDailyStore(): Promise<DailyStoreResponse> {
  return request('/api/store/daily');
}

export function getBundles(): Promise<BundleResponse> {
  return request('/api/store/bundle');
}

export function getWallet(): Promise<Wallet> {
  return request('/api/store/wallet');
}
