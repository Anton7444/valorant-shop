// Keeps the saved snapshot fresh from the computer that is signed in to Riot: every so often the page
// signs in again silently (Riot sends a browser that is still signed in straight back, the login helper
// extension catches the redirect) and then saves a new snapshot under the same code.
import * as api from '../api/client';

const ENABLED_KEY = 'autosync';
const LAST_KEY = 'autosync_last';
const CODE_KEY = 'autosync_code';
const PENDING_KEY = 'autosync_pending'; // sessionStorage: a silent sign-in is under way
export const INTERVAL_MS = 30 * 60 * 1000;
export const CHANGE_EVENT = 'autosync-changed';

export const isAutoSyncOn = () => localStorage.getItem(ENABLED_KEY) === '1';
export const lastAutoSync = () => Number(localStorage.getItem(LAST_KEY) ?? 0);
export const rememberedCode = () => localStorage.getItem(CODE_KEY) ?? undefined;

export function rememberCode(code: string): void {
  localStorage.setItem(CODE_KEY, code);
}

export function setAutoSync(on: boolean): void {
  localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Leave for Riot and come back signed in again; LoginPage then calls finishAutoSync. */
export async function startSilentSignIn(): Promise<void> {
  const { auth_url } = await api.getAuthUrl(true);
  sessionStorage.setItem(PENDING_KEY, '1');
  window.location.assign(auth_url);
}

export const isSilentSignInPending = () => sessionStorage.getItem(PENDING_KEY) === '1';

/** After a silent sign-in: save a fresh snapshot under the remembered code. */
export async function finishAutoSync(): Promise<void> {
  sessionStorage.removeItem(PENDING_KEY);
  try {
    const res = await api.createSnapshot(rememberedCode());
    rememberCode(res.code);
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    // Try again at the next interval; the old snapshot stays available meanwhile.
  }
}
