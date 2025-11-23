import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { message } from 'antd';

interface VerifiedResidentRouteProps {
  children: React.ReactNode;
}

const VerifiedResidentRoute: React.FC<VerifiedResidentRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // If not authenticated, redirect to login
  if (!isAuthenticated && !(user && (user as any).role === 'guest')) {
    return <Navigate to="/login" replace />;
  }

  // If the user is a resident and explicitly not verified, redirect to profile
  try {
    if (user && (user as any).role === 'resident' && (user as any).verified === false) {
      // Friendly message then navigate to profile
      try { message.info('Please verify your account or wait for admin approval before requesting documents. Redirecting to your profile.'); } catch (e) {}
      return <Navigate to="/profile" replace />;
    }
  } catch (err) {
    // ignore unexpected shapes
  }

  return <>{children}</>;
};

export default VerifiedResidentRoute;
