// Auth types (matching backend models)

export interface SessionResponse {
  valid: boolean;
  puuid?: string;
  snapshot_at?: number | null;
}

// Store types

export interface SkinLevel {
  uuid: string;
  level_number: number;
  display_icon: string;
  video_url: string | null;
}

export interface SkinChroma {
  uuid: string;
  name: string;
  display_icon: string;
  swatch: string;
  video_url: string | null;
}

export interface SkinOffer {
  alt_icons?: string[];
  chromas?: SkinChroma[];
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
  alt_icons?: string[];
  chromas?: SkinChroma[];
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
  alt_icons?: string[];
  chromas?: SkinChroma[];
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
  role: string;
}

export interface PlayerRow {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  team_id: string;
  agent_uuid: string | null;
  agent_name: string;
  agent_icon: string;
  level: number | null;
  rank: string;
  score: number;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  plus_minus: number;
  kd: number;
  dda: number;
  adr: number;
  hs_pct: number;
  first_kills: number;
  first_deaths: number;
  is_me: boolean;
}

export interface TeamSummary {
  team_id: string;
  won: boolean | null;
  rounds_won: number | null;
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
  teams: TeamSummary[];
  players: PlayerRow[];
}

export interface MatchesResponse {
  matches: MatchSummary[];
  has_more: boolean;
}

export interface ProfileResponse {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  level: number | null;
  wallet: Wallet | null;
  agents: AgentInfo[];
  matches: MatchSummary[];
  has_more_matches: boolean;
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

export interface AccessoryOffer {
  uuid: string;
  item_type: 'spray' | 'buddy' | 'card' | 'title' | 'other';
  name: string;
  display_icon: string;
  cost: number;
}

export interface AccessoryStoreResponse {
  offers: AccessoryOffer[];
  seconds_remaining: number;
}

export interface PassReward {
  uuid: string;
  kind: 'skin' | 'buddy' | 'spray' | 'card' | 'title' | 'currency' | 'agent' | 'other';
  name: string;
  icon: string;
  amount: number;
}

export interface PassLevel {
  level: number;
  chapter: number;
  epilogue: boolean;
  xp: number;
  cumulative_xp: number;
  reached: boolean;
  reward: PassReward | null;
}

export interface FreeReward {
  chapter: number;
  level_required: number;
  reached: boolean;
  reward: PassReward;
}

export interface BattlePassResponse {
  name: string;
  icon: string;
  level: number;
  max_level: number;
  total_xp: number;
  xp_into_level: number;
  xp_for_next: number;
  xp_remaining: number;
  ends_at: string | null;
  premium_owned: boolean | null;
  levels: PassLevel[];
  free_rewards: FreeReward[];
}
