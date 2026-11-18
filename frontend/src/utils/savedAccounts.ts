// Accounts this browser has signed in to, so the header can switch between them without logging in
// again. Each entry keeps that account's own session token (a Google account's device token, or the
// short-lived token of a plain Riot login); switching just makes one of them the active token.
export type SavedAccount = {
  token: string;
  kind: 'google' | 'riot';
  /** Identity used to avoid listing the same account twice: "g:<email>" or "r:<puuid>". */
  key: string;
  label: string;
  detail: string;
  picture?: string;
  added: number;
};

const KEY = 'saved_accounts';

export function listAccounts(): SavedAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as SavedAccount[]).filter((a) => a && typeof a.token === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('saved-accounts-changed'));
  } catch {
    /* storage unavailable: switching just will not be offered */
  }
}

export function saveAccount(entry: Omit<SavedAccount, 'added'>): void {
  const rest = listAccounts().filter((a) => a.token !== entry.token && a.key !== entry.key);
  write([...rest, { ...entry, added: Date.now() }].sort((a, b) => a.added - b.added));
}

export function getSaved(token: string): SavedAccount | undefined {
  return listAccounts().find((a) => a.token === token);
}

export function removeAccount(token: string | null): void {
  if (!token) return;
  write(listAccounts().filter((a) => a.token !== token));
}
