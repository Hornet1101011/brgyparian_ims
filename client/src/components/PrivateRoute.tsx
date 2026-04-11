import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { message } from 'antd';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Allow access when a valid JWT-authenticated user exists OR when a guest profile is present
  // Guest users are stored in context.user with role === 'guest' (set by LoginForm). We treat that as allowed.
  if (!isAuthenticated && !(user && (user as any).role === 'guest')) {
    return <Navigate to="/login" replace />;
  }

  // If the resident account is restricted, block access to specific routes like Inbox
  try {
    if (user && (user as any).restricted) {
      const blockedPaths = ['/inbox'];
      if (blockedPaths.includes(location.pathname)) {
        try { message.warning('Please visit the barangay to resolve this matter. Access to Inbox is restricted.'); } catch (e) {}
        return <Navigate to="/dashboard" replace />;
      }
    }
  } catch (e) {}

  return <>{children}</>;
};

export default PrivateRoute;
