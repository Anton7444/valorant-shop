// Auth types (matching backend models)

export interface SessionResponse {
  valid: boolean;
  puuid?: string;
}

// Store types

export interface SkinLevel {
  uuid: string;
  level_number: number;
  display_icon: string;
  video_url: string | null;
}

export interface SkinOffer {
  uuid: string;
  name: string;
  display_icon: string;
  content_tier_uuid: string;
  content_tier_name: string;
  content_tier_color: string;
  cost: number;
  levels: SkinLevel[];
  owned?: boolean;
}

export interface OwnedSkin {
  uuid: string;
  name: string;
  display_icon: string;
  content_tier_uuid: string;
  content_tier_name: string;
  content_tier_color: string;
  levels: SkinLevel[];
  weapon?: string;
}

export interface CatalogSkin extends OwnedSkin {
  weapon: string;
}

export interface CatalogResponse {
  skins: CatalogSkin[];
  weapons: string[];
}

export interface InventoryResponse {
  skins: OwnedSkin[];
  weapons?: string[];
}

export interface BundleItem {
  uuid: string;
  name: string;
  display_icon: string;
  base_price: number;
  discounted_price: number;
  discount_percent: number;
  levels?: SkinLevel[];
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

export interface AgentInfo {
  uuid: string;
  name: string;
  icon: string;
  owned: boolean;
}

export interface MatchSummary {
  match_id: string;
  map_uuid: string | null;
  map_name: string;
  queue: string;
  started_at: number;
  length_secs: number;
  agent_uuid: string | null;
  agent_name: string;
  agent_icon: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  won: boolean | null;
  rounds_won: number | null;
  rounds_lost: number | null;
}

export interface ProfileResponse {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  level: number | null;
  wallet: Wallet | null;
  agents: AgentInfo[];
  matches: MatchSummary[];
  unavailable: string[];
}

export interface Wallet {
  valorant_points: number;
  radianite_points: number;
  kingdom_credits?: number;
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
