import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  QrCode,
  Globe,
  ShieldCheck,
  Copy,
  Download,
  Check,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Smartphone,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

interface ConsentRecord {
  id: string;
  phone: string;
  name: string;
  source: 'Website Widget' | 'QR Scan' | 'Inbound Chat' | 'Checkout Opt-in';
  date: string;
  status: 'active' | 'opted_out';
  ip: string;
}

export const OptInView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'widget' | 'qrcode' | 'audit'>('widget');
  const [copiedCode, setCopiedCode] = useState(false);

  // Widget settings
  const [widgetTitle, setWidgetTitle] = useState('Chat with us on WhatsApp');
  const [widgetSubtitle, setWidgetSubtitle] = useState('We usually reply within a few minutes');
  const [widgetPhone, setWidgetPhone] = useState('+91 98765 43210');
  const [widgetMessage, setWidgetMessage] = useState('Hi! I am interested in OneSuit and would like more information.');
  const [widgetPosition, setWidgetPosition] = useState<'right' | 'left'>('right');

  // QR Code settings
  const [qrPhone, setQrPhone] = useState('+91 98765 43210');
  const [qrCampaignTag, setQrCampaignTag] = useState('in_store_banner');
  const [qrMessage, setQrMessage] = useState('Hello! I scanned your QR code and would like to connect.');

  // Consent logs
  const [consentLogs] = useState<ConsentRecord[]>([
    {
      id: 'c-101',
      phone: '+91 98765 43210',
      name: 'Rohan Sharma',
      source: 'Website Widget',
      date: '2026-10-28 14:22:10',
      status: 'active',
      ip: '103.21.244.18',
    },
    {
      id: 'c-102',
      phone: '+1 (555) 234-5678',
      name: 'John Doe',
      source: 'QR Scan',
      date: '2026-10-28 11:05:44',
      status: 'active',
      ip: '172.56.21.99',
    },
    {
      id: 'c-103',
      phone: '+91 99887 76655',
      name: 'Priya Patel',
      source: 'Checkout Opt-in',
      date: '2026-10-27 19:40:12',
      status: 'active',
      ip: '49.36.128.5',
    },
    {
      id: 'c-104',
      phone: '+1 (555) 876-5432',
      name: 'Sarah Smith',
      source: 'Inbound Chat',
      date: '2026-10-26 09:15:30',
      status: 'opted_out',
      ip: '66.249.79.11',
    },
  ]);

  const cleanPhone = widgetPhone.replace(/[^\d+]/g, '');
  const widgetScriptCode = `<!-- OneSuit WhatsApp Widget Embed Code -->
<script
  src="https://cdn.onesuit.in/widget/v1.js"
  data-phone="${cleanPhone}"
  data-title="${widgetTitle}"
  data-message="${encodeURIComponent(widgetMessage)}"
  data-position="${widgetPosition}"
  async>
</script>`;

  const qrWaLink = `https://wa.me/${qrPhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
    qrMessage + (qrCampaignTag ? ` [ref:${qrCampaignTag}]` : '')
  )}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(widgetScriptCode);
    setCopiedCode(true);
    toast.success('Widget snippet copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadQR = () => {
    toast.success('High-resolution QR Code downloaded (PNG)');
  };

  const handleExportConsentCSV = () => {
    const header = 'Phone,Name,Source,Opt-In Date,Status,IP Address\n';
    const rows = consentLogs
      .map((r) => `"${r.phone}","${r.name}","${r.source}","${r.date}","${r.status}","${r.ip}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onesuit-consent-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Consent Audit CSV exported successfully');
  };

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100 overflow-y-auto">
      <PageHeader
        title="Opt-in & Consent Hub"
        subtitle="Generate website chat widgets, click-to-chat QR codes and track GDPR / Meta compliant consent audit trails"
        icon={Globe}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
      />

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200/80 dark:border-white/10 pb-3">
          <button
            onClick={() => setActiveTab('widget')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'widget'
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 shadow-xs border border-teal-200/60'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
            }`}
          >
            <Globe className="h-4 w-4" />
            Website Chat Widget
          </button>
          <button
            onClick={() => setActiveTab('qrcode')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'qrcode'
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 shadow-xs border border-teal-200/60'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
            }`}
          >
            <QrCode className="h-4 w-4" />
            Click-to-Chat QR Code
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audit'
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 shadow-xs border border-teal-200/60'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Consent Audit Logs
          </button>
        </div>

        {/* Tab 1: Website Widget Generator */}
        {activeTab === 'widget' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Widget Configuration Form */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  Customize Floating WhatsApp Button
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Embed this responsive WhatsApp launcher on your website or landing pages. Visitors can initiate verified chats with 1 click.
                </p>

                <div className="space-y-3 pt-2">
                  <div>
                    <Label className="text-xs font-semibold">WhatsApp Business Phone</Label>
                    <Input
                      value={widgetPhone}
                      onChange={(e) => setWidgetPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Widget Header Title</Label>
                    <Input
                      value={widgetTitle}
                      onChange={(e) => setWidgetTitle(e.target.value)}
                      placeholder="Chat with us on WhatsApp"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Subtitle / Response Time</Label>
                    <Input
                      value={widgetSubtitle}
                      onChange={(e) => setWidgetSubtitle(e.target.value)}
                      placeholder="We usually reply in a few minutes"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Pre-filled Customer Message</Label>
                    <Textarea
                      value={widgetMessage}
                      onChange={(e) => setWidgetMessage(e.target.value)}
                      rows={3}
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Screen Position</Label>
                    <div className="flex gap-2 mt-1">
                      <Button
                        type="button"
                        variant={widgetPosition === 'right' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setWidgetPosition('right')}
                        className={`text-xs h-8 ${widgetPosition === 'right' ? 'bg-teal-600 text-white' : ''}`}
                      >
                        Bottom Right
                      </Button>
                      <Button
                        type="button"
                        variant={widgetPosition === 'left' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setWidgetPosition('left')}
                        className={`text-xs h-8 ${widgetPosition === 'left' ? 'bg-teal-600 text-white' : ''}`}
                      >
                        Bottom Left
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Embed Code (HTML / React / WordPress)
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCode}
                    className="h-7 text-xs font-semibold border-teal-500/30 text-teal-700 dark:text-teal-300"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copiedCode ? 'Copied' : 'Copy Code'}
                  </Button>
                </div>
                <pre className="p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed border border-gray-800">
                  {widgetScriptCode}
                </pre>
                <p className="text-[11px] text-gray-400">
                  Paste this snippet before the closing <code className="text-teal-600">&lt;/body&gt;</code> tag on any website.
                </p>
              </div>
            </div>

            {/* Live Interactive Preview */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm sticky top-6">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/5">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="h-4 w-4 text-teal-500" /> Live Website Preview
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Interactive
                  </Badge>
                </div>

                {/* Simulated browser window */}
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100/70 dark:bg-black/30 p-4 h-96 relative flex flex-col justify-between overflow-hidden shadow-inner">
                  {/* Mock browser header */}
                  <div className="flex items-center gap-1.5 pb-2 border-b border-gray-200/50 dark:border-white/5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                    <span className="text-[10px] text-gray-400 ml-2 font-mono">yourcompany.com</span>
                  </div>

                  <div className="text-center my-auto p-4 text-gray-400 text-xs">
                    <p className="font-semibold text-gray-600 dark:text-gray-300">Your Website Content</p>
                    <p className="text-[11px] mt-1">The widget floats dynamically on top of your existing page layout.</p>
                  </div>

                  {/* Floating Widget Mockup */}
                  <div
                    className={`absolute bottom-4 ${
                      widgetPosition === 'right' ? 'right-4' : 'left-4'
                    } flex flex-col items-end gap-2`}
                  >
                    {/* Chat Bubble Popup */}
                    <div className="w-64 bg-white dark:bg-[#1f2a28] rounded-2xl p-4 shadow-xl border border-gray-100 dark:border-white/10 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100 dark:border-white/5">
                        <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {widgetTitle}
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate">
                            {widgetSubtitle}
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 my-2.5 bg-gray-50 dark:bg-black/20 rounded-xl text-[11px] text-gray-600 dark:text-gray-300 italic border border-gray-100 dark:border-white/5">
                        “{widgetMessage}”
                      </div>

                      <a
                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(widgetMessage)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
                      >
                        Start WhatsApp Chat
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {/* Floating Launcher Button */}
                    <div className="h-12 w-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 cursor-pointer hover:scale-105 transition-transform">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Click-to-Chat QR Code Generator */}
        {activeTab === 'qrcode' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-6 space-y-4">
              <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-teal-600" />
                  Generate Click-to-Chat QR Code
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Print high-resolution QR codes for physical product packaging, retail stores, bills, or event banners. Customers scan with their phone camera to instantly start a chat.
                </p>

                <div className="space-y-3 pt-2">
                  <div>
                    <Label className="text-xs font-semibold">Target WhatsApp Phone</Label>
                    <Input
                      value={qrPhone}
                      onChange={(e) => setQrPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Campaign Tracking Tag</Label>
                    <Input
                      value={qrCampaignTag}
                      onChange={(e) => setQrCampaignTag(e.target.value)}
                      placeholder="e.g. retail_store_banner"
                      className="mt-1 h-9 text-xs"
                    />
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Used by OneSuit to track which physical collateral originated the customer chat.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Prefilled Welcome Message</Label>
                    <Textarea
                      value={qrMessage}
                      onChange={(e) => setQrMessage(e.target.value)}
                      rows={3}
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* QR Card Preview */}
            <div className="md:col-span-6">
              <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm flex flex-col items-center text-center">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                  Print-Ready Vector QR Code
                </h4>

                {/* Simulated QR Code Canvas */}
                <div className="p-6 bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col items-center">
                  <div className="h-48 w-48 bg-gray-900 rounded-lg p-2 flex items-center justify-center relative overflow-hidden">
                    {/* SVG QR Pattern representation */}
                    <div className="w-full h-full bg-[radial-gradient(#25D366_1px,transparent_1px)] [background-size:10px_10px] flex items-center justify-center">
                      <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-lg border border-gray-100">
                        <MessageSquare className="h-7 w-7 text-[#25D366]" />
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-gray-800 mt-3 font-mono">
                    Scan to Chat on WhatsApp
                  </span>
                  <span className="text-[10px] text-gray-400">{qrPhone}</span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleDownloadQR}
                    className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download PNG
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(qrWaLink);
                      toast.success('wa.me short link copied!');
                    }}
                    className="h-8 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy Short Link
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Consent Audit Logs */}
        {activeTab === 'audit' && (
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-white/5">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Customer Consent & Opt-In Trail
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Verifiable proof of user opt-in required by Meta Cloud API and WhatsApp Business Messaging Policies
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportConsentCSV}
                className="h-8 text-xs font-semibold border-teal-500/30 text-teal-700 dark:text-teal-300"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                Export Audit CSV
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100 dark:border-white/5 pb-2">
                    <th className="py-2.5 font-semibold">Phone Number</th>
                    <th className="py-2.5 font-semibold">Contact Name</th>
                    <th className="py-2.5 font-semibold">Opt-In Source</th>
                    <th className="py-2.5 font-semibold">Timestamp</th>
                    <th className="py-2.5 font-semibold">IP / Device</th>
                    <th className="py-2.5 font-semibold">Consent Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {consentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-3 font-mono font-semibold text-gray-900 dark:text-white">
                        {log.phone}
                      </td>
                      <td className="py-3 font-medium text-gray-800 dark:text-gray-200">{log.name}</td>
                      <td className="py-3 text-gray-600 dark:text-gray-400">{log.source}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400">{log.date}</td>
                      <td className="py-3 font-mono text-[11px] text-gray-400">{log.ip}</td>
                      <td className="py-3">
                        {log.status === 'active' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            SUBSCRIBED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                            OPTED-OUT
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OptInView;
