import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Clock, Loader2, Phone, Plus } from 'lucide-react';
import { useBranding } from '@/services/branding';
import { useEmbeddedSignup, type EmbeddedSignupResult } from './useEmbeddedSignup';

// Dedicated page for WhatsApp Embedded Signup: one click opens Meta's popup
// and the number is connected straight to this workspace.
export const EmbeddedSignupView: React.FC = () => {
  const branding = useBranding();
  const [name, setName] = useState('');
  const [result, setResult] = useState<EmbeddedSignupResult | null>(null);
  const onConnected = useCallback((r: EmbeddedSignupResult) => setResult(r), []);
  const { loading, connecting, embeddedAvailable, manualAvailable, embeddedLabel, manualLabel, launch } =
    useEmbeddedSignup(onConnected);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Connect WhatsApp"
        description="Sign up your WhatsApp Business number directly with Meta"
        icon={Phone}
        backLink="/settings/accounts"
      />
      <div className="flex-1 overflow-auto p-6">
        <Card className="max-w-xl mx-auto">
          {loading ? (
            <CardContent className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          ) : result ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {result.status === 'connected' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-500" />
                  )}
                  {result.status === 'connected' ? 'Number connected' : 'Number added — registration pending'}
                </CardTitle>
                <CardDescription>
                  {result.status === 'connected'
                    ? `${result.name || 'Your number'} is ready to send and receive messages.`
                    : 'Finish phone registration from Settings → Accounts before you start sending.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.pin && (
                  <p className="text-sm">
                    Two-step verification PIN: <code className="font-mono font-semibold">{result.pin}</code>. Keep it safe.
                  </p>
                )}
                <Button asChild>
                  <Link to="/settings/accounts">Go to Accounts</Link>
                </Button>
              </CardContent>
            </>
          ) : embeddedAvailable ? (
            <>
              <CardHeader>
                <CardTitle>Connect with Meta</CardTitle>
                <CardDescription>
                  A Facebook window opens. Pick or create your Business Manager, WhatsApp Business account and phone
                  number, then confirm. Your number is added here automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="es-name">Account name (optional)</Label>
                  <Input
                    id="es-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sales line"
                    maxLength={100}
                    disabled={connecting}
                  />
                </div>
                <Button
                  className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white"
                  onClick={() => launch(name)}
                  disabled={connecting}
                >
                  {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {embeddedLabel}
                </Button>
                {manualAvailable && (
                  <p className="text-xs text-muted-foreground text-center">
                    Already have API details?{' '}
                    <Link to="/settings/accounts" className="underline">
                      {manualLabel}
                    </Link>
                  </p>
                )}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Direct signup isn’t available
                </CardTitle>
                <CardDescription>
                  The platform administrator hasn’t turned on Embedded Signup yet.
                  {branding.support_email && ` Contact ${branding.support_email} for help.`}
                </CardDescription>
              </CardHeader>
              {manualAvailable && (
                <CardContent>
                  <Button asChild variant="outline">
                    <Link to="/settings/accounts">
                      <Plus className="h-4 w-4 mr-1.5" />
                      {manualLabel}
                    </Link>
                  </Button>
                </CardContent>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default EmbeddedSignupView;
