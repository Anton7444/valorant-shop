// Auth types (matching backend models)

export interface SessionResponse {
  valid: boolean;
  puuid?: string;
}

// Store types

export interface SkinOffer {
  uuid: string;
  name: string;
  display_icon: string;
  content_tier_uuid: string;
  content_tier_name: string;
  content_tier_color: string;
  cost: number;
}

export interface BundleItem {
  uuid: string;
  name: string;
  display_icon: string;
  base_price: number;
  discounted_price: number;
  discount_percent: number;
}

export interface Bundle {
  uuid: string;
  name: string;
  display_icon: string | null;
  items: BundleItem[];
  total_base_price: number;
  total_discounted_price: number;
  duration_remaining_secs: number;
}

export interface Wallet {
  valorant_points: number;
  radianite_points: number;
}

export interface DailyStoreResponse {
  offers: SkinOffer[];
  seconds_remaining: number;
}

export interface BundleResponse {
  bundles: Bundle[];
}

// Auth state

export interface AuthState {
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  sessionValid: boolean;
  puuid: string | null;
  error: string | null;
}

export type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; puuid: string }
  | { type: 'LOGIN_ERROR'; error: string }
  | { type: 'LOGOUT' }
  | { type: 'SESSION_RESTORED'; puuid: string };
