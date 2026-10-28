import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  Paperclip,
  X,
  ExternalLink,
  Building2,
  User,
  Mail,
  ImageIcon,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  superAdminService,
  formatDate,
  ticketRef,
  type SupportTicket,
  type SupportTicketReply,
} from '@/services/superAdmin';
import { supportService } from '@/services/support';
import { cardClass } from './shared';

const statusConfig: Record<SupportTicket['status'], { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Open', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30', icon: AlertCircle },
  solved: { label: 'Solved', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', icon: CheckCircle2 },
};

const priorityConfig: Record<SupportTicket['priority'], { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-white/[0.06] text-white/60 light:bg-gray-100 light:text-gray-600' },
  medium: { label: 'Medium', color: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  high: { label: 'High', color: 'bg-rose-500/15 text-rose-400 border border-rose-500/30' },
};

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const ManageTicketsView: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'solved'>('all');

  // Selected Ticket Modal State
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Reply State
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Lightbox Image Zoom
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await superAdminService.listTickets(
        statusFilter === 'all' ? undefined : statusFilter
      );
      setTickets(data || []);
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const openTicketModal = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReplyText('');
    setReplyImage(null);
    setReplyImagePreview(null);
    setModalOpen(true);
    setModalLoading(true);

    try {
      const fresh = await superAdminService.getTicket(ticket.id);
      setSelectedTicket(fresh);
    } catch {
      // Keep existing data if fresh fetch fails
    } finally {
      setModalLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPEG, WebP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be 10 MB or smaller');
      return;
    }

    setReplyImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      setReplyImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeReplyImage = () => {
    setReplyImage(null);
    setReplyImagePreview(null);
  };

  const handleSendReply = async (andSolve: boolean = false) => {
    if (!selectedTicket) return;
    if (!replyText.trim() && !replyImage) {
      toast.error('Please type a message or attach an image');
      return;
    }

    setIsSubmittingReply(true);
    try {
      let uploadedUrl = '';
      if (replyImage) {
        uploadedUrl = await supportService.uploadImage(replyImage);
      }

      const newReply = await superAdminService.replyTicket(selectedTicket.id, {
        message: replyText.trim(),
        image_url: uploadedUrl || undefined,
      });

      let updatedTicket = {
        ...selectedTicket,
        replies: [...(selectedTicket.replies || []), newReply],
      };

      if (andSolve && selectedTicket.status !== 'solved') {
        const solved = await superAdminService.updateTicket(selectedTicket.id, { status: 'solved' });
        updatedTicket = { ...updatedTicket, status: 'solved', solved_at: solved.solved_at };
        toast.success('Reply sent and ticket marked as solved!');
      } else {
        toast.success('Reply sent to client');
      }

      setSelectedTicket(updatedTicket);
      setTickets((prev) =>
        prev.map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
      );
      setReplyText('');
      setReplyImage(null);
      setReplyImagePreview(null);
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedTicket) return;
    setIsUpdatingStatus(true);
    const nextStatus: SupportTicket['status'] = selectedTicket.status === 'open' ? 'solved' : 'open';

    try {
      const updated = await superAdminService.updateTicket(selectedTicket.id, { status: nextStatus });
      const merged = { ...selectedTicket, status: nextStatus, solved_at: updated.solved_at };
      setSelectedTicket(merged);
      setTickets((prev) =>
        prev.map((t) => (t.id === merged.id ? { ...t, ...merged } : t))
      );
      toast.success(nextStatus === 'solved' ? 'Ticket marked as solved' : 'Ticket reopened as open');
    } catch {
      toast.error('Could not update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.subject.toLowerCase().includes(q) ||
      (t.vendor_name || '').toLowerCase().includes(q) ||
      (t.creator_name || '').toLowerCase().includes(q) ||
      (t.creator_email || '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    solved: tickets.filter((t) => t.status === 'solved').length,
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white light:text-gray-900 flex items-center gap-2">
            <Ticket className="h-5 w-5 text-emerald-400" />
            Support Helpdesk & Tickets
          </h1>
          <p className="text-sm text-white/50 light:text-gray-500 mt-0.5">
            View, investigate, reply, and resolve tickets raised by all organizations and vendors
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTickets}
          disabled={loading}
          className="gap-2 border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.06] light:border-gray-200 light:text-gray-600 light:hover:text-gray-900 light:hover:bg-gray-100"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={cn('rounded-xl border p-4', cardClass)}>
          <p className="text-xs text-white/50 light:text-gray-500 font-medium">Total Raised Tickets</p>
          <p className="text-2xl font-bold mt-1 text-white light:text-gray-900 tabular-nums">{stats.total}</p>
        </div>
        <div className={cn('rounded-xl border p-4', cardClass)}>
          <p className="text-xs text-amber-400 light:text-amber-600 font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Open Issues (Pending Action)
          </p>
          <p className="text-2xl font-bold mt-1 text-amber-400 light:text-amber-600 tabular-nums">{stats.open}</p>
        </div>
        <div className={cn('rounded-xl border p-4', cardClass)}>
          <p className="text-xs text-emerald-400 light:text-emerald-600 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolved & Solved
          </p>
          <p className="text-2xl font-bold mt-1 text-emerald-400 light:text-emerald-600 tabular-nums">{stats.solved}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 light:text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets by subject, agency/vendor, client email, or ID…"
            className="pl-9 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 light:bg-white light:border-gray-200 light:text-gray-900 light:placeholder:text-gray-400"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-xl bg-white/[0.04] light:bg-gray-100 p-1 border border-white/[0.06] light:border-gray-200">
          {(['all', 'open', 'solved'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                statusFilter === tab
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-white/60 hover:text-white light:text-gray-600 light:hover:text-gray-900'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Table */}
      <div className={cn('rounded-xl border overflow-hidden', cardClass)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] light:border-gray-100 bg-white/[0.02] light:bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Subject & Raiser</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Agency / Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-white/40 light:text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <RefreshCw className="h-6 w-6 text-emerald-500 animate-spin mx-auto mb-2" />
                    <p className="text-white/40 light:text-gray-400 text-xs font-medium">Loading support tickets…</p>
                  </td>
                </tr>
              ) : filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Ticket className="h-8 w-8 text-white/20 mx-auto mb-3 light:text-gray-300" />
                    <p className="text-white/50 light:text-gray-500 text-sm font-medium">No tickets found</p>
                    <p className="text-white/30 light:text-gray-400 text-xs mt-1">
                      {search ? 'Try adjusting your search criteria' : 'No tickets raised in this category yet'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket, i) => {
                  const status = statusConfig[ticket.status];
                  const priority = priorityConfig[ticket.priority];
                  const StatusIcon = status.icon;

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicketModal(ticket)}
                      className={cn(
                        'transition-colors hover:bg-white/[0.04] cursor-pointer light:hover:bg-gray-50 group',
                        i !== filteredTickets.length - 1 && 'border-b border-white/[0.04] light:border-gray-100'
                      )}
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-emerald-400 light:text-emerald-700 whitespace-nowrap">
                        {ticketRef(ticket.id)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white light:text-gray-900 group-hover:text-emerald-400 transition-colors line-clamp-1">
                            {ticket.subject}
                          </p>
                          {ticket.image_url && (
                            <span title="Includes screenshot / image attachment" className="text-cyan-400">
                              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 light:text-gray-500 mt-0.5 line-clamp-1">
                          {ticket.creator_name || ticket.creator_email || 'Client user'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-white/80 light:text-gray-700 font-medium">
                          <Building2 className="h-3.5 w-3.5 text-white/40 light:text-gray-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{ticket.vendor_name || 'Organization'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className={cn('text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full', priority.color)}>
                          {priority.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', status.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-white/40 light:text-gray-500 whitespace-nowrap">
                        {timeAgo(ticket.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTicketModal(ticket);
                          }}
                          className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP MODAL: FULL TICKET DETAILS & REPLY & RESOLUTION */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-[#141415] border-white/10 text-white light:bg-white light:border-gray-200 light:text-gray-900 shadow-2xl">
          {selectedTicket && (
            <>
              {/* Modal Header */}
              <DialogHeader className="p-5 border-b border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-gray-50/80 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-emerald-400 light:text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {ticketRef(selectedTicket.id)}
                      </span>
                      <Badge className={cn('text-[10px] font-semibold uppercase', priorityConfig[selectedTicket.priority].color)}>
                        {selectedTicket.priority} Priority
                      </Badge>
                      <Badge className={cn('text-[10px] font-semibold uppercase', statusConfig[selectedTicket.status].color)}>
                        {selectedTicket.status === 'solved' ? 'Resolved' : 'Open'}
                      </Badge>
                    </div>
                    <DialogTitle className="text-base sm:text-lg font-bold text-white light:text-gray-900 leading-snug">
                      {selectedTicket.subject}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-white/50 light:text-gray-500 flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-white/70 light:text-gray-700">
                        <Building2 className="h-3 w-3 text-white/40" />
                        {selectedTicket.vendor_name || 'Vendor'}
                      </span>
                      {selectedTicket.creator_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-white/40" />
                          {selectedTicket.creator_email}
                        </span>
                      )}
                      <span>Created {formatDate(selectedTicket.created_at)}</span>
                    </DialogDescription>
                  </div>

                  {/* Solve / Reopen Button */}
                  <Button
                    size="sm"
                    disabled={isUpdatingStatus}
                    onClick={handleToggleStatus}
                    className={cn(
                      'font-semibold text-xs transition-all shrink-0',
                      selectedTicket.status === 'open'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                    )}
                  >
                    {isUpdatingStatus ? (
                      'Updating…'
                    ) : selectedTicket.status === 'open' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Mark as Solved
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Reopen Ticket
                      </>
                    )}
                  </Button>
                </div>
              </DialogHeader>

              {/* Scrollable Conversation Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {modalLoading && (
                  <div className="py-2 text-center text-xs text-white/40 light:text-gray-400">
                    Refreshing ticket conversation…
                  </div>
                )}

                {/* Original Issue Description Card */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] light:bg-gray-50 light:border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-7 w-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white light:text-gray-900">
                        {selectedTicket.creator_name || 'Client Ticket Raiser'}
                        <span className="font-normal text-white/40 light:text-gray-400 ml-1.5">
                          ({selectedTicket.vendor_name || 'Organization'})
                        </span>
                      </p>
                      <p className="text-[10px] text-white/40 light:text-gray-400">
                        Initial Issue Description • {timeAgo(selectedTicket.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-sm text-white/90 light:text-gray-800 whitespace-pre-wrap leading-relaxed pl-9">
                    {selectedTicket.description || <span className="italic text-white/40">No description provided.</span>}
                  </div>

                  {/* Original Attached Image */}
                  {selectedTicket.image_url && (
                    <div className="mt-3 pl-9">
                      <p className="text-[11px] font-semibold text-white/50 light:text-gray-500 mb-1.5 flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Attached Screenshot:
                      </p>
                      <div
                        onClick={() => setZoomImageUrl(selectedTicket.image_url!)}
                        className="group relative inline-block rounded-lg overflow-hidden border border-white/10 light:border-gray-300 cursor-pointer max-w-sm max-h-48 bg-black/40"
                      >
                        <img
                          src={selectedTicket.image_url}
                          alt="Ticket attachment"
                          className="object-cover max-h-48 hover:opacity-90 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-xs text-white font-medium">
                          <Maximize2 className="h-4 w-4" /> Click to zoom
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversation Thread / Replies */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-white/[0.08] light:bg-gray-200 flex-1" />
                    <span className="text-[11px] font-semibold text-white/40 light:text-gray-400 uppercase tracking-wider">
                      Conversation Thread ({selectedTicket.replies?.length || 0})
                    </span>
                    <div className="h-px bg-white/[0.08] light:bg-gray-200 flex-1" />
                  </div>

                  {(!selectedTicket.replies || selectedTicket.replies.length === 0) ? (
                    <div className="py-6 text-center text-xs text-white/40 light:text-gray-400 bg-white/[0.01] rounded-lg">
                      No replies yet. Type a response below to assist the client.
                    </div>
                  ) : (
                    selectedTicket.replies.map((reply: SupportTicketReply) => {
                      const isSuperAdmin = reply.sender_role === 'super_admin';
                      return (
                        <div
                          key={reply.id}
                          className={cn(
                            'rounded-xl p-4 border transition-all',
                            isSuperAdmin
                              ? 'bg-emerald-950/20 border-emerald-500/20 text-white light:bg-emerald-50/70 light:border-emerald-200 ml-4 sm:ml-8'
                              : 'bg-white/[0.03] border-white/[0.08] text-white light:bg-gray-50 light:border-gray-200 mr-4 sm:mr-8'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                                  isSuperAdmin
                                    ? 'bg-emerald-500/20 text-emerald-300 light:bg-emerald-200 light:text-emerald-800'
                                    : 'bg-blue-500/20 text-blue-300 light:bg-blue-200 light:text-blue-800'
                                )}
                              >
                                {isSuperAdmin ? 'Platform Super Admin' : 'Client User'}
                              </span>
                              <span className="text-xs font-semibold text-white/80 light:text-gray-800">
                                {reply.sender_name}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/40 light:text-gray-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {timeAgo(reply.created_at)}
                            </span>
                          </div>

                          <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-white/90 light:text-gray-800">
                            {reply.message}
                          </div>

                          {reply.image_url && (
                            <div className="mt-2.5">
                              <div
                                onClick={() => setZoomImageUrl(reply.image_url!)}
                                className="group relative inline-block rounded-lg overflow-hidden border border-white/10 light:border-gray-300 cursor-pointer max-w-sm max-h-48 bg-black/40"
                              >
                                <img
                                  src={reply.image_url}
                                  alt="Reply attachment"
                                  className="object-cover max-h-48 hover:opacity-90 transition-opacity"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-xs text-white font-medium">
                                  <Maximize2 className="h-4 w-4" /> Click to zoom
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Reply Box Footer */}
              <div className="p-4 border-t border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-gray-50/80 shrink-0">
                {/* Upload Image Preview */}
                {replyImagePreview && (
                  <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 w-fit">
                    <img src={replyImagePreview} alt="Preview" className="h-10 w-10 object-cover rounded" />
                    <div className="text-xs">
                      <p className="font-semibold text-emerald-300 light:text-emerald-700">{replyImage?.name}</p>
                      <p className="text-[10px] text-white/40 light:text-gray-500">Ready to upload with reply</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={removeReplyImage}
                      className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10 ml-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                <Textarea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type an official Super Admin reply to the client…"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 light:bg-white light:border-gray-200 light:text-gray-900 resize-none text-xs sm:text-sm"
                />

                <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                  {/* Image Upload Input */}
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.1] bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08] light:border-gray-200 light:bg-white light:text-gray-700 light:hover:bg-gray-100 transition-colors">
                      <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{replyImage ? 'Change Image' : 'Attach Screenshot'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[10px] text-white/40 light:text-gray-500 hidden sm:inline">
                      PNG, JPEG, WebP, GIF (up to 10MB)
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {selectedTicket.status === 'open' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmittingReply}
                        onClick={() => handleSendReply(true)}
                        className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Reply & Solve
                      </Button>
                    )}

                    <Button
                      size="sm"
                      disabled={isSubmittingReply || (!replyText.trim() && !replyImage)}
                      onClick={() => handleSendReply(false)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                    >
                      {isSubmittingReply ? (
                        'Sending…'
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          Send Reply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* LIGHTBOX MODAL FOR ZOOMING IMAGES */}
      <Dialog open={Boolean(zoomImageUrl)} onOpenChange={(open) => !open && setZoomImageUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/95 border-white/10 text-white flex flex-col items-center justify-center">
          {zoomImageUrl && (
            <div className="relative w-full max-h-[85vh] flex flex-col items-center justify-center overflow-auto">
              <img
                src={zoomImageUrl}
                alt="Enlarged screenshot"
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
              <div className="mt-2 flex items-center justify-between w-full px-2">
                <span className="text-xs text-white/60">Ticket Screenshot</span>
                <a
                  href={zoomImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in full tab
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageTicketsView;
