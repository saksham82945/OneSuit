import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bot, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export const ChatbotSettingsView: React.FC = () => {
  const { t } = useTranslation();

  const [botEnabled, setBotEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [greeting, setGreeting] = useState('Hi there! Welcome to onesuit support. How can I assist you today?');
  const [fallback, setFallback] = useState('Sorry, I did not catch that. Let me connect you with an available agent.');
  const [timeout, setTimeoutVal] = useState(30);

  const handleSave = () => {
    toast.success('Chatbot configuration saved successfully');
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.chatbot') || 'Chatbot Engine Settings'}
        subtitle="Global bot automation settings, session duration, and AI response parameters"
        icon={Bot}
        iconGradient="bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/20"
        backLink="/settings"
        actions={
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Bot Settings
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Engine Core Controls</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Enable or disable automated conversation interceptors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div>
                <p className="font-medium text-xs text-white light:text-gray-900">Master Chatbot Toggle</p>
                <p className="text-[11px] text-white/40 light:text-gray-400">Intercept and reply to inbound WhatsApp customer messages</p>
              </div>
              <Switch checked={botEnabled} onCheckedChange={setBotEnabled} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div>
                <p className="font-medium text-xs text-white flex items-center gap-1.5 light:text-gray-900">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> GPT-4 Generative AI Fallback
                </p>
                <p className="text-[11px] text-white/40 light:text-gray-400">When no keyword or visual flow matches, query knowledge base AI</p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="greet" className="text-xs">Initial Inbound Welcome Message</Label>
              <Textarea
                id="greet"
                rows={2}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="fall" className="text-xs">Unmatched / Fallback Message</Label>
              <Textarea
                id="fall"
                rows={2}
                value={fallback}
                onChange={(e) => setFallback(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="to" className="text-xs">Session Inactivity Timeout (Minutes)</Label>
              <Input
                id="to"
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutVal(Number(e.target.value))}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default ChatbotSettingsView;
