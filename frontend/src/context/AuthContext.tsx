import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { AuthAction, AuthState } from '../types';
import * as api from '../api/client';
import { applyAccountSettings } from '../utils/accountSettings';
import { removeAccount, saveAccount } from '../utils/savedAccounts';

const initialState: AuthState = {
  status: 'idle',
  sessionValid: false,
  puuid: null,
  account: null,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, status: 'loading', error: null };
    case 'LOGIN_SUCCESS':
      return {
        status: 'authenticated',
        sessionValid: true,
        puuid: action.puuid,
        account: action.account ?? null,
        error: null,
      };
    case 'LOGIN_ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'LOGOUT':
      removeAccount(api.getStoredToken());
      api.clearToken();
      return { ...initialState };
    case 'SESSION_RESTORED':
      return {
        status: 'authenticated',
        sessionValid: true,
        puuid: action.puuid,
        account: action.account ?? null,
        error: null,
      };
    case 'ACCOUNT_UPDATED':
      return { ...state, puuid: action.account.riot.puuid, account: action.account };
  }
}

const AuthContext = createContext<{
  state: AuthState;
  dispatch: Dispatch<AuthAction>;
}>({
  state: initialState,
  dispatch: () => undefined,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    // Only check session if we have a stored token
    if (!api.getStoredToken()) return;

    api.checkSession().then((res) => {
      if (res.valid && res.account) {
        applyAccountSettings(res.account.settings);
        dispatch({ type: 'SESSION_RESTORED', puuid: res.puuid ?? null, account: res.account });
      } else if (res.valid && res.puuid) {
        dispatch({ type: 'SESSION_RESTORED', puuid: res.puuid });
      } else {
        api.clearToken();
      }
    }).catch(() => {
      api.clearToken();
    });
  }, []);

  // Remember every signed-in account so the header can switch between them.
  useEffect(() => {
    const token = api.getStoredToken();
    if (!state.sessionValid || !token) return;
    const { account, puuid } = state;
    if (account) {
      saveAccount({ token, kind: 'google', key: `g:${account.email}`, label: account.name || account.email, detail: account.email, picture: account.picture ?? undefined });
    } else if (puuid) {
      saveAccount({ token, kind: 'riot', key: `r:${puuid}`, label: `Riot ${puuid.slice(0, 8)}`, detail: puuid.slice(0, 8) });
    }
  }, [state]);

  // Logging in from another tab (the Riot login helper finishes in a new tab)
  // stores the token here too; pick it up so this tab signs in as well.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== 'session_token' || !event.newValue) return;
      // Another tab switched to a different account: this tab's data belongs to the old one.
      if (event.oldValue && event.oldValue !== event.newValue) {
        window.location.reload();
        return;
      }
      api.checkSession().then((res) => {
        if (res.valid && (res.puuid || res.account)) {
          dispatch({ type: 'SESSION_RESTORED', puuid: res.puuid ?? null, account: res.account });
        }
      }).catch(() => {});
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <AuthContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}
