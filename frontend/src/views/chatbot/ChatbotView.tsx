import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatbotService } from '@/services/api';
import { readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  Key,
  Workflow,
  Sparkles,
  Power,
  Settings,
  TrendingUp,
  Users,
  MessageSquare,
  Clock,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';

// Shapes of GET /api/chatbot/settings -> data: { settings, stats } (only the fields this screen shows).
interface ChatbotSettings {
  enabled: boolean;
  greeting_message: string;
  fallback_message: string;
  session_timeout_minutes: number;
  ai_enabled: boolean;
  ai_provider: string; // 'openai' | 'anthropic' | 'google' | ''
  ai_model: string;
}

interface ChatbotStats {
  total_sessions: number;
  active_sessions: number;
  messages_handled: number;
  ai_responses: number;
  keywords_count: number;
  flows_count: number;
  ai_contexts_count: number;
}

const AI_PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

export const ChatbotView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isSuperAdmin = !!user?.is_super_admin;

  // Defaults mirror what the backend returns before settings are first saved.
  const [settings, setSettings] = useState<ChatbotSettings>({
    enabled: false,
    greeting_message: '',
    fallback_message: '',
    session_timeout_minutes: 30,
    ai_enabled: false,
    ai_provider: '',
    ai_model: '',
  });

  const [stats, setStats] = useState<ChatbotStats>({
    total_sessions: 0,
    active_sessions: 0,
    messages_handled: 0,
    ai_responses: 0,
    keywords_count: 0,
    flows_count: 0,
    ai_contexts_count: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [showToggleModal, setShowToggleModal] = useState(false);

  useEffect(() => {
    chatbotService.getSettings().then((res) => {
      const data = readData<{ settings?: Partial<ChatbotSettings>; stats?: Partial<ChatbotStats> }>(res);
      if (data?.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      if (data?.stats) setStats((prev) => ({ ...prev, ...data.stats }));
    }).catch(() => {
      toast.error('Failed to load chatbot settings');
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      const newState = !settings.enabled;
      await chatbotService.updateSettings({ enabled: newState });
      setSettings((prev) => ({ ...prev, enabled: newState }));
      toast.success(newState ? 'Chatbot enabled' : 'Chatbot disabled');
      setShowToggleModal(false);
    } catch {
      toast.error('Failed to toggle chatbot');
    } finally {
      setIsToggling(false);
    }
  };

  const aiProviderLabel = !settings.ai_enabled
    ? 'AI responses disabled'
    : [AI_PROVIDER_LABELS[settings.ai_provider] || settings.ai_provider, settings.ai_model]
        .filter(Boolean)
        .join(' · ') || 'Not configured';

  const statCards = [
    { title: t('chatbot.totalSessions') || 'Total Sessions', value: stats.total_sessions, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { title: t('chatbot.activeSessions') || 'Active Sessions', value: stats.active_sessions, icon: MessageSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { title: t('chatbot.messagesHandled') || 'Messages Handled', value: stats.messages_handled, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { title: t('chatbot.aiResponses') || 'AI Responses', value: stats.ai_responses, icon: Sparkles, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('chatbot.title') || 'Chatbot Studio'}
        subtitle={t('chatbot.subtitle') || 'Automate customer support with keyword rules, visual flows and AI'}
        icon={Bot}
        iconGradient="bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/20"
        actions={
          <div className="flex items-center gap-3">
            <Badge
              className={
                settings.enabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-0 text-[10px]'
                  : 'bg-white/[0.08] text-white/50 border-0 text-[10px] light:bg-gray-100 light:text-gray-500'
              }
            >
              {settings.enabled ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => setShowToggleModal(true)}
              className={
                settings.enabled
                  ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                  : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
              }
            >
              <Power className="h-4 w-4 mr-2" />
              {settings.enabled ? 'Disable Bot' : 'Enable Bot'}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div
              key={card.title}
              className="card-depth rounded-xl border border-white/[0.08] bg-[#141415] p-5 text-white light:border-gray-200 light:bg-white light:text-gray-900"
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs text-white/50 light:text-gray-500">{card.title}</span>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold mt-1">{(card.value ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Quick Nav Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            to="/chatbot/keywords"
            className="card-depth rounded-xl border border-white/[0.08] bg-[#141415] p-6 hover:border-emerald-500/30 transition-all group text-white block light:border-gray-200 light:bg-white light:text-gray-900"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Key className="h-5 w-5 text-white light:text-gray-900" />
              </div>
              <div>
                <h3 className="font-semibold text-base group-hover:text-emerald-400 transition-colors">
                  Keyword Rules
                </h3>
                <p className="text-xs text-white/40 light:text-gray-400">{stats.keywords_count} rules configured</p>
              </div>
            </div>
            <p className="text-xs text-white/50 leading-relaxed light:text-gray-500">
              Match specific customer phrases, regex or keywords to trigger automated replies and actions.
            </p>
            <div className="mt-4 flex items-center text-xs text-emerald-400 font-medium">
              Manage Rules <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/chatbot/flows"
            className="card-depth rounded-xl border border-white/[0.08] bg-[#141415] p-6 hover:border-purple-500/30 transition-all group text-white block light:border-gray-200 light:bg-white light:text-gray-900"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Workflow className="h-5 w-5 text-white light:text-gray-900" />
              </div>
              <div>
                <h3 className="font-semibold text-base group-hover:text-purple-400 transition-colors">
                  Visual Flows
                </h3>
                <p className="text-xs text-white/40 light:text-gray-400">{stats.flows_count} visual flows built</p>
              </div>
            </div>
            <p className="text-xs text-white/50 leading-relaxed light:text-gray-500">
              Drag-and-drop conversational decision trees with buttons, conditional branching and webhook calls.
            </p>
            <div className="mt-4 flex items-center text-xs text-purple-400 font-medium">
              Open Canvas <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* AI Contexts card — visible only to super admins */}
          {isSuperAdmin ? (
            <Link
              to="/chatbot/ai"
              className="card-depth rounded-xl border border-white/[0.08] bg-[#141415] p-6 hover:border-orange-500/30 transition-all group text-white block light:border-gray-200 light:bg-white light:text-gray-900"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Sparkles className="h-5 w-5 text-white light:text-gray-900" />
                </div>
                <div>
                  <h3 className="font-semibold text-base group-hover:text-amber-400 transition-colors">
                    AI Agents
                  </h3>
                  <p className="text-xs text-white/40 light:text-gray-400">{stats.ai_contexts_count} knowledge docs active</p>
                </div>
              </div>
              <p className="text-xs text-white/50 leading-relaxed light:text-gray-500">
                Equip your bot with your company knowledge base, PDF guides, and GPT-4 prompts.
              </p>
              <div className="mt-4 flex items-center text-xs text-amber-400 font-medium">
                Configure AI <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ) : (
            <div className="card-depth rounded-xl border border-white/[0.04] bg-[#141415]/50 p-6 text-white opacity-40 cursor-not-allowed select-none light:border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-white/[0.06] flex items-center justify-center light:bg-gray-100">
                  <Lock className="h-5 w-5 text-white/30 light:text-gray-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-white/50 light:text-gray-500">AI Agents</h3>
                  <p className="text-xs text-white/25 light:text-gray-300">Super Admin only</p>
                </div>
              </div>
              <p className="text-xs text-white/30 leading-relaxed light:text-gray-400">
                AI knowledge base and GPT-4 context management is restricted to platform administrators.
              </p>
            </div>
          )}
        </div>

        {/* Current Active Configuration */}
        <div className="card-depth rounded-xl border border-white/[0.08] bg-[#141415] p-6 text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4 light:border-gray-200">
            <div>
              <h3 className="font-semibold text-base">Active Chatbot Engine</h3>
              <p className="text-xs text-white/40 light:text-gray-400">Core parameters and routing fallback rules</p>
            </div>
            <Link to="/settings/chatbot">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Configure Settings
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <span className="text-[11px] text-white/40 font-medium light:text-gray-400">Default Welcome Greeting</span>
              <p className="text-xs text-white/80 mt-1 light:text-gray-800">{settings.greeting_message || 'Not set'}</p>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
              <span className="text-[11px] text-white/40 font-medium light:text-gray-400">Fallback / Unrecognized Message</span>
              <p className="text-xs text-white/80 mt-1 light:text-gray-800">{settings.fallback_message || 'Not set'}</p>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between light:bg-gray-50 light:border-gray-200">
              <div>
                <span className="text-[11px] text-white/40 font-medium light:text-gray-400">Inactivity Timeout</span>
                <p className="text-xs text-white/80 mt-1 light:text-gray-800">{settings.session_timeout_minutes} minutes</p>
              </div>
              <Clock className="h-5 w-5 text-white/20 light:text-gray-300" />
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between light:bg-gray-50 light:border-gray-200">
              <div>
                <span className="text-[11px] text-white/40 font-medium light:text-gray-400">AI Model Provider</span>
                <p className="text-xs text-white/80 mt-1 light:text-gray-800">{aiProviderLabel}</p>
              </div>
              <Sparkles className="h-5 w-5 text-amber-400/40" />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showToggleModal} onOpenChange={setShowToggleModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{settings.enabled ? 'Disable Chatbot' : 'Enable Chatbot'}</DialogTitle>
            <DialogDescription>
              {settings.enabled
                ? 'Are you sure you want to pause automated replies? All incoming messages will route directly to human agents.'
                : 'Turn on automated replies? Incoming customer messages will be processed by keyword rules, visual flows and AI.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowToggleModal(false)}>
              Cancel
            </Button>
            <Button
              variant={settings.enabled ? 'destructive' : 'default'}
              disabled={isToggling}
              onClick={handleToggle}
              className={!settings.enabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : ''}
            >
              {isToggling ? 'Updating...' : (settings.enabled ? 'Disable Bot' : 'Enable Bot')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default ChatbotView;
