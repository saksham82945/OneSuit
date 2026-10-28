import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Clock, CheckCircle2, MessageSquare, Star, Users } from 'lucide-react';

export const AgentAnalyticsView: React.FC = () => {
  const { t } = useTranslation();

  const agents = [
    {
      name: 'Admin User',
      email: 'admin@admin.com',
      messages_handled: 1840,
      avg_response_time: '42s',
      resolution_rate: '96.4%',
      csat_rating: 4.9,
    },
    {
      name: 'Sarah Connor',
      email: 'sarah.c@company.com',
      messages_handled: 1220,
      avg_response_time: '58s',
      resolution_rate: '94.1%',
      csat_rating: 4.8,
    },
    {
      name: 'James Wilson',
      email: 'j.wilson@company.com',
      messages_handled: 980,
      avg_response_time: '1m 15s',
      resolution_rate: '91.8%',
      csat_rating: 4.7,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.agentAnalytics') || 'Agent Performance & CSAT'}
        subtitle="Monitor response times, resolution velocity and customer satisfaction ratings"
        icon={BarChart3}
        iconGradient="bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardContent className="p-4">
              <span className="text-xs text-white/50 light:text-gray-500">Avg Response Time</span>
              <p className="text-2xl font-bold mt-1 text-emerald-400">48s</p>
              <span className="text-[10px] text-emerald-400/80">↓ 14% vs last week</span>
            </CardContent>
          </Card>

          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardContent className="p-4">
              <span className="text-xs text-white/50 light:text-gray-500">Resolution Rate</span>
              <p className="text-2xl font-bold mt-1 text-blue-400">95.2%</p>
              <span className="text-[10px] text-blue-400/80">↑ 2.1% improvement</span>
            </CardContent>
          </Card>

          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardContent className="p-4">
              <span className="text-xs text-white/50 light:text-gray-500">Customer CSAT</span>
              <p className="text-2xl font-bold mt-1 text-amber-400 flex items-center gap-1">
                4.85 <Star className="h-4 w-4 fill-amber-400 inline" />
              </p>
              <span className="text-[10px] text-white/40 light:text-gray-400">From 540 ratings</span>
            </CardContent>
          </Card>

          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
            <CardContent className="p-4">
              <span className="text-xs text-white/50 light:text-gray-500">Active Human Agents</span>
              <p className="text-2xl font-bold mt-1 text-purple-400">8 / 10</p>
              <span className="text-[10px] text-purple-400/80">Available online</span>
            </CardContent>
          </Card>
        </div>

        {/* Agent Leaderboard Table */}
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agent Leaderboard</CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Individual agent productivity and support quality benchmarks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-white/[0.08] overflow-hidden light:border-gray-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-white/[0.02] border-b border-white/[0.08] text-white/50 light:bg-gray-50 light:border-gray-200 light:text-gray-500">
                  <tr>
                    <th className="p-3">Agent</th>
                    <th className="p-3">Messages Handled</th>
                    <th className="p-3">Avg Response Time</th>
                    <th className="p-3">Resolution Rate</th>
                    <th className="p-3">CSAT Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] light:divide-gray-100">
                  {agents.map((ag) => (
                    <tr key={ag.email} className="hover:bg-white/[0.02] light:hover:bg-gray-100">
                      <td className="p-3">
                        <p className="font-medium text-white light:text-gray-900">{ag.name}</p>
                        <p className="text-[11px] text-white/40 light:text-gray-400">{ag.email}</p>
                      </td>
                      <td className="p-3 font-mono font-medium">{ag.messages_handled.toLocaleString()}</td>
                      <td className="p-3 font-mono text-emerald-400">{ag.avg_response_time}</td>
                      <td className="p-3 font-mono">{ag.resolution_rate}</td>
                      <td className="p-3">
                        <Badge className="bg-amber-500/20 text-amber-400 border-0 flex items-center gap-1 w-fit">
                          <Star className="h-3 w-3 fill-amber-400" /> {ag.csat_rating}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AgentAnalyticsView;
