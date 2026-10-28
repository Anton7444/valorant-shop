import type {
  BattlePassResponse,
  AccessoryStoreResponse,
  BundleResponse,
  CatalogResponse,
  DailyStoreResponse,
  InventoryResponse,
  MatchesResponse,
  ProfileResponse,
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
  localStorage.removeItem(SNAPSHOT_KEY);
}

// Set when this browser is looking at a saved snapshot instead of a live Riot sign-in.
const SNAPSHOT_KEY = 'snapshot_at';

export function getSnapshotTime(): number | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  return raw ? Number(raw) : null;
}

export function storeSnapshotTime(epochSeconds: number): void {
  localStorage.setItem(SNAPSHOT_KEY, String(epochSeconds));
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
  promo?: boolean;
  snapshot_at?: number | null;
  error?: string | null;
}

export function getAuthUrl(silent = false): Promise<{ auth_url: string }> {
  return request(`/api/auth/url${silent ? '?silent=true' : ''}`);
}

export function submitToken(url: string): Promise<LoginResponse> {
  return request('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function createSnapshot(
  code?: string,
): Promise<{ code: string; taken_at: number; expires_in: number; parts: string[] }> {
  return request('/api/snapshot', { method: 'POST', body: JSON.stringify({ code }) });
}

export function redeemSnapshot(code: string): Promise<LoginResponse> {
  return request('/api/snapshot/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
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

export function getAccessoryStore(): Promise<AccessoryStoreResponse> {
  return request('/api/store/accessories');
}

export function getPublicBundles(): Promise<BundleResponse> {
  return request('/api/store/bundle/public');
}

export function getBundles(): Promise<BundleResponse> {
  return request('/api/store/bundle');
}

export function getWallet(): Promise<Wallet> {
  return request('/api/store/wallet');
}

export function getInventory(): Promise<InventoryResponse> {
  return request('/api/store/inventory');
}

export function getCatalog(): Promise<CatalogResponse> {
  return request('/api/store/catalog');
}

export function getProfile(): Promise<ProfileResponse> {
  return request('/api/profile');
}

export function getBattlePass(): Promise<BattlePassResponse> {
  return request('/api/profile/battlepass');
}

export function getMatches(start: number): Promise<MatchesResponse> {
  return request(`/api/profile/matches?start=${start}`);
}
