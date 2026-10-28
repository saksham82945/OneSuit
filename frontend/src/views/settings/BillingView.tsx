import React, { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  CreditCard,
  Zap,
  CheckCircle2,
  TrendingUp,
  Download,
  AlertCircle,
  Sparkles,
  Phone,
  Users,
  MessageSquare,
  ArrowUpRight,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  date: string;
  description: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  pdfUrl?: string;
}

export const BillingView: React.FC = () => {
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(2000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [walletBalance, setWalletBalance] = useState<number>(4850.0);
  const [isProcessing, setIsProcessing] = useState(false);

  const [invoices] = useState<Invoice[]>([
    {
      id: 'INV-2026-0891',
      date: 'Oct 01, 2026',
      description: 'Growth Pro Plan (Monthly)',
      amount: '₹2,499.00',
      status: 'paid',
    },
    {
      id: 'INV-2026-0742',
      date: 'Sep 14, 2026',
      description: 'Prepaid Wallet Credit Recharge',
      amount: '₹5,000.00',
      status: 'paid',
    },
    {
      id: 'INV-2026-0618',
      date: 'Sep 01, 2026',
      description: 'Growth Pro Plan (Monthly)',
      amount: '₹2,499.00',
      status: 'paid',
    },
    {
      id: 'INV-2026-0499',
      date: 'Aug 01, 2026',
      description: 'Starter Tier Plan (Monthly)',
      amount: '₹999.00',
      status: 'paid',
    },
  ]);

  const handleRecharge = () => {
    const amount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setWalletBalance((prev) => prev + amount);
      setIsProcessing(false);
      setRechargeModalOpen(false);
      setCustomAmount('');
      toast.success(`Successfully recharged ₹${amount.toLocaleString()} to your wallet!`);
    }, 900);
  };

  const handleDownloadInvoice = (inv: Invoice) => {
    toast.success(`Downloading receipt ${inv.id}...`);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100 overflow-y-auto">
      <PageHeader
        title="Billing & Subscription"
        subtitle="Manage your OneSuit subscription plan, message quotas, prepaid wallet and invoices"
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRechargeModalOpen(true)}
              className="h-9 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Recharge Wallet
            </Button>
            <Button
              size="sm"
              onClick={() => setUpgradeModalOpen(true)}
              className="h-9 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-600/20"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Upgrade Plan
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Active Plan Card */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Current Plan
                </span>
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  ACTIVE
                </Badge>
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-2">
                Growth Pro
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                ₹2,499.00 / month · Renews Nov 15, 2026
              </p>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-white/5 mt-6 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Payment: Visa ending in 4242</span>
              <button
                onClick={() => setUpgradeModalOpen(true)}
                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
              >
                Change Plan <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Prepaid Wallet Card */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Prepaid Wallet Balance
                </span>
                <Zap className="h-4 w-4 text-emerald-500" />
              </div>
              <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Used for Meta Cloud API per-message delivery charges & AI tokens
              </p>
            </div>

            <div className="pt-4 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRechargeModalOpen(true)}
                className="w-full h-8 rounded-xl border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold"
              >
                + Add Funds to Wallet
              </Button>
            </div>
          </div>

          {/* Message Quota Card */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Monthly Broadcast Quota
                </span>
                <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-gray-900 dark:text-white">42,850</span>
                <span className="text-sm text-gray-400">/ 100,000 sent</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full"
                  style={{ width: '42.8%' }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 flex justify-between">
                <span>57,150 messages remaining</span>
                <span>42.8% used</span>
              </p>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-white/5 mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Quota resets in 18 days</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Tier 3 (100k/day)</span>
            </div>
          </div>
        </div>

        {/* Feature Usage Breakdown */}
        <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Workspace Limits & Add-ons
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Resource allocation included in your current subscription tier
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 mb-2">
                <Phone className="h-4 w-4" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">WhatsApp Lines</span>
              </div>
              <div className="text-xl font-black text-gray-900 dark:text-white">2 / 5</div>
              <p className="text-[11px] text-gray-400 mt-0.5">Connected WABA numbers</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                <Users className="h-4 w-4" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Agent Seats</span>
              </div>
              <div className="text-xl font-black text-gray-900 dark:text-white">8 / 15</div>
              <p className="text-[11px] text-gray-400 mt-0.5">Team members active</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Flow Chatbots</span>
              </div>
              <div className="text-xl font-black text-gray-900 dark:text-white">Unlimited</div>
              <p className="text-[11px] text-gray-400 mt-0.5">Drag-and-drop bots</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Webhooks & API</span>
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">Enabled</div>
              <p className="text-[11px] text-gray-400 mt-0.5">Full REST API access</p>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Billing History & Invoices
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Download past tax invoices, receipts and billing statements
              </p>
            </div>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100 dark:border-white/5 pb-2">
                  <th className="py-2.5 font-semibold">Invoice ID</th>
                  <th className="py-2.5 font-semibold">Date</th>
                  <th className="py-2.5 font-semibold">Description</th>
                  <th className="py-2.5 font-semibold">Amount</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono font-semibold text-gray-900 dark:text-white">
                      {inv.id}
                    </td>
                    <td className="py-3 text-gray-500 dark:text-gray-400">{inv.date}</td>
                    <td className="py-3 font-medium text-gray-800 dark:text-gray-200">{inv.description}</td>
                    <td className="py-3 font-semibold text-gray-900 dark:text-white">{inv.amount}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        PAID
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadInvoice(inv)}
                        className="h-7 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 font-semibold"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recharge Wallet Modal */}
      <Dialog open={rechargeModalOpen} onOpenChange={setRechargeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Recharge Prepaid Wallet
            </DialogTitle>
            <DialogDescription>
              Add funds to pay for WhatsApp conversation messages, marketing broadcasts and AI automation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Select Amount (INR)
              </Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(amt);
                      setCustomAmount('');
                    }}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedAmount === amt && !customAmount
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-500'
                        : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    ₹{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="custom-amount" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Or Enter Custom Amount (₹)
              </Label>
              <Input
                id="custom-amount"
                type="number"
                placeholder="e.g. 10000"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedAmount(0);
                }}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="p-3 bg-gray-50 dark:bg-white/[0.03] rounded-xl border border-gray-100 dark:border-white/5 text-[11px] text-gray-500 space-y-1">
              <div className="flex justify-between">
                <span>Selected Recharge:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  ₹{(customAmount ? parseFloat(customAmount) || 0 : selectedAmount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>GST (18% included):</span>
                <span>₹{((customAmount ? parseFloat(customAmount) || 0 : selectedAmount) * 0.18 / 1.18).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200/50 dark:border-white/5 font-bold text-gray-900 dark:text-white">
                <span>Total Payable:</span>
                <span>₹{(customAmount ? parseFloat(customAmount) || 0 : selectedAmount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRechargeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRecharge}
              disabled={isProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isProcessing ? 'Processing Payment...' : 'Proceed to Pay with Razorpay / UPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Plan Modal */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-600" />
              Choose Your OneSuit Plan
            </DialogTitle>
            <DialogDescription>
              Scale your WhatsApp outreach with higher daily limits, dedicated numbers and team seats.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
            {/* Starter */}
            <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase">Starter</span>
                <div className="text-xl font-black mt-1">₹999<span className="text-xs text-gray-400 font-normal">/mo</span></div>
                <ul className="text-[11px] text-gray-500 space-y-1.5 mt-3">
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> 1 Phone Number</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> 2 Team Seats</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> 10k Msgs / mo</li>
                </ul>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4 text-xs font-semibold">
                Downgrade
              </Button>
            </div>

            {/* Growth Pro (Current) */}
            <div className="rounded-xl border-2 border-teal-500 bg-teal-50/20 dark:bg-teal-950/30 p-4 flex flex-col justify-between relative shadow-sm">
              <Badge className="absolute -top-2.5 right-4 bg-teal-600 text-white text-[9px] font-bold">
                CURRENT PLAN
              </Badge>
              <div>
                <span className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase">Growth Pro</span>
                <div className="text-xl font-black text-gray-900 dark:text-white mt-1">₹2,499<span className="text-xs text-gray-400 font-normal">/mo</span></div>
                <ul className="text-[11px] text-gray-600 dark:text-gray-300 space-y-1.5 mt-3">
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-600" /> 5 Phone Numbers</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-600" /> 15 Team Seats</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-600" /> 100k Msgs / mo</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-teal-600" /> AI Visual Bot Studio</li>
                </ul>
              </div>
              <Button size="sm" disabled className="w-full mt-4 text-xs font-semibold bg-teal-600 text-white">
                Active Tier
              </Button>
            </div>

            {/* Enterprise */}
            <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-purple-600 uppercase">Enterprise</span>
                <div className="text-xl font-black mt-1">₹6,999<span className="text-xs text-gray-400 font-normal">/mo</span></div>
                <ul className="text-[11px] text-gray-500 space-y-1.5 mt-3">
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-purple-500" /> Unlimited Numbers</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-purple-500" /> Unlimited Seats</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-purple-500" /> 500k+ Msgs / mo</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-purple-500" /> Dedicated Account Mgr</li>
                </ul>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  toast.success('Enterprise upgrade request submitted. Our team will reach out within 2 hours.');
                  setUpgradeModalOpen(false);
                }}
                className="w-full mt-4 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
              >
                Upgrade to Enterprise
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUpgradeModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingView;
