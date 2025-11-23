import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  // Allow access when a valid JWT-authenticated user exists OR when a guest profile is present
  // Guest users are stored in context.user with role === 'guest' (set by LoginForm). We treat that as allowed.
  if (!isAuthenticated && !(user && (user as any).role === 'guest')) {
    return <Navigate to="/login" replace />;
  }

  // If the user is a resident and explicitly not verified, redirect them to their profile/portal
  // so they can complete verification or wait for admin approval. This prevents residents from
  // accessing resident-only features (like requesting documents) before verification.
  try {
    const isResident = !!(user && (user as any).role === 'resident');
    const isExplicitlyUnverified = isResident && ((user as any).verified === false);
    if (isExplicitlyUnverified) {
      return <Navigate to="/profile" replace />;
    }
  } catch (err) {
    // if any unexpected shape, fall back to normal routing
  }

  return <>{children}</>;
};

export default PrivateRoute;
