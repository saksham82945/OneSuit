import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, CheckCircle2, ShieldAlert, Zap, Globe, MessageSquare } from 'lucide-react';

export const MetaInsightsView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.metaInsights') || 'Meta WhatsApp Health & Limits'}
        subtitle="Official Meta WhatsApp Business API health status, quality rating and tier limits"
        icon={LineChart}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* Tier Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardHeader className="pb-2">
              <span className="text-xs text-white/50 light:text-gray-500">Phone Number Quality</span>
              <CardTitle className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> HIGH (GREEN)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40 light:text-gray-400">
                Low block/report rate. Phone number status is fully verified and healthy.
              </p>
            </CardContent>
          </Card>

          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardHeader className="pb-2">
              <span className="text-xs text-white/50 light:text-gray-500">Daily Messaging Tier</span>
              <CardTitle className="text-xl font-bold text-purple-400">
                100,000 / Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40 light:text-gray-400">
                Tier 3 verified. Automatically upgrades to Unlimited with consistent volume.
              </p>
            </CardContent>
          </Card>

          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardHeader className="pb-2">
              <span className="text-xs text-white/50 light:text-gray-500">24-Hour Service Window</span>
              <CardTitle className="text-xl font-bold text-blue-400">
                Free Form Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40 light:text-gray-400">
                Free-form conversational messages within customer-initiated 24hr window.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown of Message Categories */}
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Meta Conversation Volume Breakdown</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Billing and volume distribution across WhatsApp conversation categories (last 30 days)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-white/80 light:text-gray-800">User-Initiated Service Conversations</span>
                  <span className="font-mono text-emerald-400">12,420 (62%)</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden light:bg-gray-100">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '62%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-white/80 light:text-gray-800">Utility & Order Notifications</span>
                  <span className="font-mono text-blue-400">4,910 (24%)</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden light:bg-gray-100">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '24%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-white/80 light:text-gray-800">Marketing Broadcasts</span>
                  <span className="font-mono text-purple-400">2,850 (14%)</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden light:bg-gray-100">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: '14%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default MetaInsightsView;
