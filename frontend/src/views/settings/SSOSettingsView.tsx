import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, Save } from 'lucide-react';
import { toast } from 'sonner';

export const SSOSettingsView: React.FC = () => {
  const { t } = useTranslation();

  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [entityId] = useState(() => `${typeof window !== 'undefined' ? window.location.origin : 'https://auth'}/saml/metadata`);
  const [ssoUrl, setSsoUrl] = useState('');
  const [cert, setCert] = useState('');

  const handleSave = () => {
    toast.success('SSO configuration saved');
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.sso') || 'Enterprise Single Sign-On (SSO)'}
        subtitle="Configure SAML 2.0 / OIDC identity providers (Okta, Google Workspace, Azure AD)"
        icon={ShieldCheck}
        iconGradient="bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20"
        backLink="/settings"
        actions={
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save SSO Settings
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">SAML 2.0 Identity Provider</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Enforce single sign-on authentication for all agents and administrators in your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div>
                <p className="font-medium text-xs text-white light:text-gray-900">Enforce SSO Authentication</p>
                <p className="text-[11px] text-white/40 light:text-gray-400">Require users to log in through your corporate identity provider</p>
              </div>
              <Switch checked={ssoEnabled} onCheckedChange={setSsoEnabled} />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="spEntity" className="text-xs">Service Provider (SP) Entity ID</Label>
              <Input id="spEntity" value={entityId} readOnly className="font-mono bg-white/[0.02] opacity-70 light:bg-gray-50" />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="idpUrl" className="text-xs">IdP Single Sign-On Target URL *</Label>
              <Input
                id="idpUrl"
                placeholder="https://company.okta.com/app/custom/sso/saml"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="cert" className="text-xs">X.509 Public Certificate (PEM format) *</Label>
              <Textarea
                id="cert"
                rows={4}
                placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default SSOSettingsView;
