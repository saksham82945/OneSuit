import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

/** Renders the nested Super Admin routes only for super admins. */
export const SuperAdminRoute: React.FC = () => {
  const isSuperAdmin = useAuthStore((s) => !!s.user?.is_super_admin);
  return isSuperAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default SuperAdminRoute;
