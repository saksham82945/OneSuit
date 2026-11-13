import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signedOutInThisTab, useAuthStore } from '@/stores/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  action?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permission,
  action = 'read',
}) => {
  const location = useLocation();
  const { isAuthenticated, restoreSession, hasPermission } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      restoreSession();
    }
  }, [isAuthenticated, restoreSession]);

  if (!isAuthenticated && !restoreSession()) {
    // After signing out, app pages (e.g. reached with Back) show the landing
    // page instead of trapping the user on the login page.
    if (signedOutInThisTab()) {
      return <Navigate to="/" replace />;
    }
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (permission && !hasPermission(permission, action)) {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
};
