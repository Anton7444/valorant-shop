import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import { CHANGE_EVENT, INTERVAL_MS, isAutoSyncOn, lastAutoSync, startSilentSignIn } from '../utils/autoSync';

/** Runs the snapshot auto-update timer on the computer that is signed in to Riot (renders nothing). */
export default function AutoSync() {
  const { state } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    // Not while viewing a snapshot, not signed out, not mid-login.
    if (!state.sessionValid || pathname === '/' || api.getSnapshotTime() !== null) return;

    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (!isAutoSyncOn()) return;
      const wait = Math.max(5000, lastAutoSync() + INTERVAL_MS - Date.now());
      timer = window.setTimeout(() => void startSilentSignIn().catch(() => {}), wait);
    };
    schedule();
    window.addEventListener(CHANGE_EVENT, schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHANGE_EVENT, schedule);
    };
  }, [state.sessionValid, pathname]);

  return null;
}
