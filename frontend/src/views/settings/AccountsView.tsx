import { Link } from 'react-router-dom';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { accountsService } from '@/services/api';
import { readList, readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Phone,
  Plus,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Trash2,
  Activity,
  Mail,
  Headphones,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/services/branding';

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string; phone_number_id?: string; waba_id?: string };
          error?: { message?: string };
          status?: string;
        }) => void,
        options: Record<string, unknown>
      ) => void;
    };
  }
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  app_id?: string;
  phone_id: string;
  business_id: string;
  api_version?: string;
  is_default_incoming?: boolean;
  is_default_outgoing?: boolean;
  status: string; // 'active' | 'pending_registration'
  has_access_token?: boolean;
  has_app_secret?: boolean;
  phone_number?: string;
  display_name?: string;
  created_at?: string;
}

interface EmbeddedSignupConfig {
  whatsapp_app_id?: string;
  whatsapp_config_id?: string;
  whatsapp_api_version?: string;
  embedded_enabled: boolean;
  manual_enabled: boolean;
  embedded_label?: string;
  manual_label?: string;
}

const FacebookIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const AccountsView: React.FC = () => {
  const { t } = useTranslation();
  const branding = useBranding();

  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [signupConfig, setSignupConfig] = useState<EmbeddedSignupConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Manual connect dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isConnectingManual, setIsConnectingManual] = useState(false);

  // Delete dialog
  const [accountToDelete, setAccountToDelete] = useState<WhatsAppAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Testing connection state
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await accountsService.list();
      setAccounts(readList<WhatsAppAccount>(res, 'accounts'));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load accounts'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSignupConfig = useCallback(async () => {
    try {
      const res = await accountsService.getEmbeddedConfig();
      const cfg = readData<EmbeddedSignupConfig>(res);
      if (cfg) {
        setSignupConfig(cfg);
      }
    } catch (err) {
      console.warn('Failed to fetch signup config:', err);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchSignupConfig();
  }, [fetchAccounts, fetchSignupConfig]);

  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim() || !phoneId.trim() || !wabaId.trim() || !accessToken.trim()) {
      toast.error('All fields (Line Name, Phone Number ID, WABA ID, and Access Token) are required');
      return;
    }

    setIsConnectingManual(true);
    try {
      await accountsService.create({
        name: accountName.trim(),
        phone_id: phoneId.trim(),
        business_id: wabaId.trim(),
        access_token: accessToken.trim(),
      });
      toast.success('WhatsApp Business line connected manually');
      setCreateOpen(false);
      setAccountName('');
      setPhoneId('');
      setWabaId('');
      setAccessToken('');
      fetchAccounts();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to connect account manually'));
    } finally {
      setIsConnectingManual(false);
    }
  };

  const handleTestConnection = async (account: WhatsAppAccount) => {
    setTestingId(account.id);
    try {
      await accountsService.testConnection(account.id);
      toast.success(`Connection verified for ${account.name}`);
    } catch (err) {
      toast.error(errorMessage(err, `Connection test failed for ${account.name}`));
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await accountsService.delete(accountToDelete.id);
      toast.success('Account disconnected successfully');
      setAccountToDelete(null);
      fetchAccounts();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to disconnect account'));
    } finally {
      setIsDeleting(false);
    }
  };

  const embeddedAvailable = signupConfig?.embedded_enabled === true;
  const manualAvailable = signupConfig?.manual_enabled === true;
  const neitherAvailable = signupConfig && !embeddedAvailable && !manualAvailable;

  const query = searchQuery.trim().toLowerCase();
  const visibleAccounts = query
    ? accounts.filter((acc) =>
        [acc.name, acc.phone_id, acc.business_id, acc.phone_number, acc.display_name]
          .some((v) => v?.toLowerCase().includes(query))
      )
    : accounts;

  const columns: Column<WhatsAppAccount>[] = [
    {
      key: 'name',
      label: 'Account Name',
      sortable: true,
      render: (acc) => (
        <div className="flex flex-col">
          <span className="font-medium text-white light:text-gray-900">{acc.name}</span>
          <span className="text-[11px] font-mono text-white/40 light:text-gray-500">ID: {acc.id}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone Number ID',
      render: (acc) => (
        <code className="text-xs px-2 py-0.5 rounded bg-white/[0.04] text-emerald-400 font-mono light:bg-gray-100 light:text-emerald-700">
          {acc.phone_number || acc.phone_id || '—'}
        </code>
      ),
    },
    {
      key: 'status',
      label: 'Connection Status',
      render: (acc) =>
        acc.status === 'active' ? (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] flex items-center gap-1 light:bg-emerald-100 light:text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> CONNECTED
          </Badge>
        ) : (
          <Badge className="bg-amber-500/20 text-amber-400 border-0 text-[10px] flex items-center gap-1 light:bg-amber-100 light:text-amber-800">
            <Clock className="h-3 w-3" /> {(acc.status || 'pending').replace(/_/g, ' ').toUpperCase()}
          </Badge>
        ),
    },
    {
      key: 'verification',
      label: 'WABA ID',
      render: (acc) => (
        <div className="flex items-center gap-1 text-xs text-blue-400 light:text-blue-600">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-mono">{acc.business_id || '—'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (acc) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleTestConnection(acc)}
            disabled={testingId === acc.id}
            title="Test connection with Meta API"
            className="h-7 px-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.08] light:text-gray-600 light:hover:text-gray-900 light:hover:bg-gray-100"
          >
            {testingId === acc.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5 mr-1" />
            )}
            Test
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAccountToDelete(acc)}
            title="Disconnect account"
            className="h-7 w-7 p-0 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 light:text-gray-400 light:hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden text-foreground">
      <PageHeader
        title={t('nav.accounts') || 'WhatsApp Business Accounts'}
        subtitle="Connect and manage official WhatsApp number lines"
        icon={Phone}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
        backLink="/settings"
        actions={
          <div className="flex items-center gap-2">
            {embeddedAvailable && (
              <Button
                size="sm"
                asChild
                className="bg-[#1877F2] hover:bg-[#166fe5] text-white shadow-md shadow-blue-500/20 text-xs font-medium"
              >
                <Link to="/settings/accounts/connect">
                  <FacebookIcon className="h-4 w-4 mr-2" />
                  {signupConfig?.embedded_label || 'Connect with Facebook'}
                </Link>
              </Button>
            )}

            {manualAvailable && (
              <Button
                size="sm"
                variant={embeddedAvailable ? 'outline' : 'default'}
                className={
                  embeddedAvailable
                    ? 'border-white/[0.1] text-xs hover:bg-white/[0.06] light:border-gray-300 light:hover:bg-gray-100'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white text-xs'
                }
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {signupConfig?.manual_label || 'Configure WABA API'}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Support note when neither signup method is available */}
        {neitherAvailable && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 light:text-amber-800 light:bg-amber-50 text-xs flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">WhatsApp number connection is currently closed.</span>
              <p className="mt-1 text-amber-300/80 light:text-amber-700">
                Automatic and manual number setups have been disabled by the platform administrator. If you need to connect or verify a WhatsApp Business line, please contact support:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium">
                {branding.support_email && (
                  <a href={`mailto:${branding.support_email}`} className="flex items-center gap-1.5 underline hover:text-white light:hover:text-gray-900">
                    <Mail className="h-3.5 w-3.5" /> {branding.support_email}
                  </a>
                )}
                {branding.support_phone && (
                  <a href={`tel:${branding.support_phone}`} className="flex items-center gap-1.5 underline hover:text-white light:hover:text-gray-900">
                    <Headphones className="h-3.5 w-3.5" /> {branding.support_phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <Card className="border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-base font-semibold">Active Phone Lines</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Registered WhatsApp Business Accounts (WABA) sending and receiving messages
                </CardDescription>
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search phone numbers..."
                className="w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              items={visibleAccounts}
              columns={columns}
              isLoading={isLoading}
              emptyIcon={Phone}
              emptyTitle="No WhatsApp accounts connected"
              emptyDescription={
                neitherAvailable
                  ? 'Connecting new accounts is currently disabled. Please contact support.'
                  : 'Connect your official business WhatsApp number via Facebook or manual API keys.'
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Manual Connection Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px] bg-[#141415] border-white/[0.1] text-white light:bg-white light:border-gray-200 light:text-gray-900">
          <form onSubmit={handleManualConnect}>
            <DialogHeader>
              <DialogTitle>Enter WhatsApp Details Manually</DialogTitle>
              <DialogDescription className="text-white/60 light:text-gray-500 text-xs">
                Enter your Meta developer console Phone Number ID, WABA ID, and permanent System User Access Token.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="accName" className="text-xs">Line Label / Name *</Label>
                <Input
                  id="accName"
                  placeholder="e.g. Main Customer Support Line"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="h-9 text-xs bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pId" className="text-xs">Phone Number ID *</Label>
                  <Input
                    id="pId"
                    placeholder="1092837461928"
                    value={phoneId}
                    onChange={(e) => setPhoneId(e.target.value)}
                    className="h-9 text-xs bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900 font-mono"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wId" className="text-xs">WABA ID *</Label>
                  <Input
                    id="wId"
                    placeholder="9823746192837"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="h-9 text-xs bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="token" className="text-xs">Permanent System User Access Token *</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="EAABw..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="h-9 text-xs bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900 font-mono"
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="text-xs border-white/[0.1] light:border-gray-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isConnectingManual}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
              >
                {isConnectingManual ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Connect Line
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={Boolean(accountToDelete)} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <DialogContent className="sm:max-w-[420px] bg-[#141415] border-white/[0.1] text-white light:bg-white light:border-gray-200 light:text-gray-900">
          <DialogHeader>
            <DialogTitle>Disconnect WhatsApp Line?</DialogTitle>
            <DialogDescription className="text-white/60 light:text-gray-500 text-xs leading-relaxed">
              Are you sure you want to disconnect <strong>{accountToDelete?.name}</strong>? Incoming messages to this line will no longer be received. Existing conversation history will be kept.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountToDelete(null)}
              className="text-xs border-white/[0.1] light:border-gray-300"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteAccount}
              className="text-xs bg-rose-600 hover:bg-rose-500 text-white"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsView;
