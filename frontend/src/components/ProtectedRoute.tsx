import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();

  if (state.status === 'idle') {
    // Still checking session
    return null;
  }

  if (!state.sessionValid) {
    return <Navigate to="/" replace />;
  }

  // Signed in with Google but no Riot login linked (or it expired): linking happens in Settings.
  if (state.account && state.account.riot.state !== 'linked') {
    return <Navigate to="/settings" replace />;
  }

  return <>{children}</>;
}
