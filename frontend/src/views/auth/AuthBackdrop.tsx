import React from 'react';
import { cn } from '@/lib/utils';
import './auth-motion.css';

/**
 * Slowly drifting, blurred brand-coloured shapes behind the auth pages.
 * Decorative only; the parent must be `relative` (and ideally `overflow-hidden`).
 */
export const AuthBackdrop: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden className={cn('auth-backdrop', className)}>
    <div className="auth-blob auth-blob-1" />
    <div className="auth-blob auth-blob-2" />
    <div className="auth-blob auth-blob-3" />
    <div className="auth-grid" />
  </div>
);

export default AuthBackdrop;
