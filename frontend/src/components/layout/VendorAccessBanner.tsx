import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import { exitVendorAccount, getImpersonatedVendorName, isInsideClient } from '@/services/superAdmin';

/** Shown while a super admin is inside a client's account, with a way back. */
export const VendorAccessBanner: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [leaving, setLeaving] = useState(false);

  if (!isInsideClient(user)) return null;

  const handleExit = async () => {
    setLeaving(true);
    try {
      await exitVendorAccount();
      navigate('/super-admin/clients');
    } catch {
      toast.error('Could not leave the client account');
      setLeaving(false);
    }
  };

  return (
    <div className="sticky top-12 md:top-0 z-30 flex items-center justify-between gap-3 bg-violet-600 px-4 py-1.5 text-xs text-white shrink-0">
      <span className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          You're viewing <strong>{getImpersonatedVendorName() || user?.organization_name || 'a client account'}</strong> as Super Admin
        </span>
      </span>
      <button onClick={handleExit} disabled={leaving} className="shrink-0 rounded-md bg-white/15 px-2.5 py-0.5 font-medium hover:bg-white/25 disabled:opacity-60 light:bg-gray-50 light:hover:bg-gray-100">
        {leaving ? 'Returning…' : 'Return to Super Admin'}
      </button>
    </div>
  );
};
