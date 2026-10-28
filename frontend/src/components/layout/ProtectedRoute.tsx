import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

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
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (permission && !hasPermission(permission, action)) {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
};
