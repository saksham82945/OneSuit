import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import type { User } from '@/stores/auth';
import { completeSignIn } from '@/views/public/publicApi';

/**
 * Landing page after "Continue with Google / Facebook": the server has already
 * set the login cookies, so load the account and open the app.
 */
export const SSOCallbackView: React.FC = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get('/me')
      .then((res) => {
        const user = readData<User>(res);
        if (!user?.id) throw new Error('no user');
        completeSignIn(user, navigate);
      })
      .catch(() => setFailed(true));
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] light:bg-gray-50 p-6 text-center">
      {failed ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70 light:text-gray-700">We couldn't finish signing you in.</p>
          <Link to="/login" className="inline-block rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white">
            Back to login
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-white/60 light:text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
        </div>
      )}
    </div>
  );
};

export default SSOCallbackView;
