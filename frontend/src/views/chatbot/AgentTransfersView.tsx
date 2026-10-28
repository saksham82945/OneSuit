import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { UserX, Save, Clock, Users, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export const AgentTransfersView: React.FC = () => {
  const { t } = useTranslation();

  const [autoAssign, setAutoAssign] = useState(true);
  const [roundRobin, setRoundRobin] = useState(true);
  const [offlineMessage, setOfflineMessage] = useState(
    'Our team is currently offline. Your message has been received and our agents will respond first thing in the morning.'
  );
  const [escalationTimeout, setEscalationTimeout] = useState(15);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Agent transfer routing rules saved');
    }, 500);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('chatbot.transfers') || 'Human Agent Transfers'}
        subtitle="Manage queue assignment, fallback rules, and bot-to-human handover policies"
        icon={UserX}
        iconGradient="bg-gradient-to-br from-red-500 to-rose-600 shadow-rose-500/20"
        backLink="/chatbot"
        actions={
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            disabled={isSaving}
            onClick={handleSave}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Routing Rules'}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Queue Distribution</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              How conversations are handed over when the chatbot or user requests human assistance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Automatic Agent Assignment</Label>
                <p className="text-[11px] text-white/40 light:text-gray-400">Immediately assign incoming transfers to online agents</p>
              </div>
              <Switch checked={autoAssign} onCheckedChange={setAutoAssign} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Round-Robin Load Balancing</Label>
                <p className="text-[11px] text-white/40 light:text-gray-400">Evenly distribute chats across all active and available team members</p>
              </div>
              <Switch checked={roundRobin} onCheckedChange={setRoundRobin} />
            </div>

            <div className="grid gap-1.5 pt-2">
              <Label htmlFor="escalation" className="text-xs">
                Unanswered Escalation Timeout (Minutes)
              </Label>
              <Input
                id="escalation"
                type="number"
                value={escalationTimeout}
                onChange={(e) => setEscalationTimeout(Number(e.target.value))}
                className="max-w-xs"
              />
              <span className="text-[11px] text-white/40 light:text-gray-400">
                If the assigned agent does not respond within this time, reassign to next available agent.
              </span>
            </div>

            <div className="grid gap-1.5 pt-2 border-t border-white/[0.06] light:border-gray-200">
              <Label htmlFor="offline" className="text-xs">
                After-Hours / Offline Automatic Notice
              </Label>
              <Input
                id="offline"
                value={offlineMessage}
                onChange={(e) => setOfflineMessage(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AgentTransfersView;
