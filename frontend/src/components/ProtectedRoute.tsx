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

  return <>{children}</>;
}
