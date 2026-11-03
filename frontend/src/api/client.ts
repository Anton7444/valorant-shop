import type {
  AccountInfo,
  AccountSettings,
  BattlePassResponse,
  AccessoryStoreResponse,
  BundleResponse,
  CatalogResponse,
  DailyStoreResponse,
  InventoryResponse,
  MatchesResponse,
  NightMarketResponse,
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
  error?: string | null;
}

export function getAuthUrl(silent = false): Promise<{ auth_url: string }> {
  return request(`/api/auth/url${silent ? '?silent=true' : ''}`);
}

export function getAuthConfig(): Promise<{ google_client_id: string | null }> {
  return request('/api/auth/config');
}

export interface GoogleLoginResponse {
  status: 'success' | 'error';
  session_token?: string;
  account?: AccountInfo;
  error?: string;
}

export function googleLogin(accessToken: string): Promise<GoogleLoginResponse> {
  return request('/api/auth/google', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) });
}

export interface AccountActionResponse {
  status: 'success' | 'error';
  account?: AccountInfo;
  error?: string;
}

/** Link (or replace) the Riot login of the signed-in Google account from exported cookies. */
export function linkRiot(cookies: string): Promise<AccountActionResponse> {
  return request('/api/account/riot', { method: 'POST', body: JSON.stringify({ cookies }) });
}

export function unlinkRiot(): Promise<AccountActionResponse> {
  return request('/api/account/riot/unlink', { method: 'POST' });
}

export function saveAccountSettings(patch: Partial<AccountSettings>): Promise<AccountInfo> {
  return request('/api/account/settings', { method: 'PUT', body: JSON.stringify(patch) });
}

export function deleteGoogleAccount(): Promise<{ status: string }> {
  return request('/api/account/delete', { method: 'POST' });
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

export function getNightMarket(): Promise<NightMarketResponse> {
  return request('/api/store/nightmarket');
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
