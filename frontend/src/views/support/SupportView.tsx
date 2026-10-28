import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { supportService, type SupportTicket, type SupportTicketReply } from '@/services/support';
import { formatDate, ticketRef, superAdminService } from '@/services/superAdmin';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LifeBuoy,
  Plus,
  CheckCircle2,
  CircleDot,
  Send,
  Clock,
  MessageSquare,
  Paperclip,
  ImageIcon,
  X,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Filter = 'all' | SupportTicket['status'];
type Priority = SupportTicket['priority'];

const MAX_SUBJECT = 255;

const priorityStyles: Record<Priority, string> = {
  high: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700',
  medium: 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700',
  low: 'bg-white/[0.08] text-white/60 light:bg-gray-100 light:text-gray-600',
};

const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900';

const emptyForm = { subject: '', description: '', priority: 'medium' as Priority };

const errorMessage = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { message?: string } } } | undefined;
  return e?.response?.data?.message || fallback;
};

export const SupportView: React.FC = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // New ticket dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ticket detail popup
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Lightbox Zoom
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const load = () => {
    setError(null);
    supportService
      .list()
      .then(setTickets)
      .catch((e) => setError(errorMessage(e, "We couldn't load your tickets.")));
  };
  useEffect(load, []);

  const counts = useMemo(
    () => ({
      all: tickets?.length ?? 0,
      open: tickets?.filter((tk) => tk.status === 'open').length ?? 0,
      solved: tickets?.filter((tk) => tk.status === 'solved').length ?? 0,
    }),
    [tickets]
  );
  const visible = (tickets ?? []).filter((tk) => filter === 'all' || tk.status === filter);

  const openDialog = () => {
    setForm(emptyForm);
    setNewImage(null);
    setNewImagePreview(null);
    setDialogOpen(true);
  };

  const handleNewImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPEG, WebP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be 10 MB or smaller');
      return;
    }
    setNewImage(file);
    const reader = new FileReader();
    reader.onload = () => setNewImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleReplyImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPEG, WebP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be 10 MB or smaller');
      return;
    }
    setReplyImage(file);
    const reader = new FileReader();
    reader.onload = () => setReplyImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error('Please add a subject');
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl = '';
      if (newImage) {
        imageUrl = await supportService.uploadImage(newImage);
      }

      const created = await supportService.create({
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        image_url: imageUrl || undefined,
      });

      setTickets((list) => [created, ...(list ?? [])]);
      setFilter('all');
      setDialogOpen(false);
      setNewImage(null);
      setNewImagePreview(null);
      toast.success(`Ticket ${ticketRef(created.id)} sent to platform support`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send your ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openTicketDetail = async (tk: SupportTicket) => {
    setSelectedTicket(tk);
    setReplyText('');
    setReplyImage(null);
    setReplyImagePreview(null);
    setDetailOpen(true);

    try {
      const fresh = await supportService.get(tk.id);
      setSelectedTicket(fresh);
    } catch {
      // Keep existing data if fresh fetch fails
    }
  };

  const handleSendReply = async () => {
    if ((!replyText.trim() && !replyImage) || !selectedTicket) return;
    setSendingReply(true);
    try {
      let uploadedUrl = '';
      if (replyImage) {
        uploadedUrl = await supportService.uploadImage(replyImage);
      }

      const reply = await supportService.reply(selectedTicket.id, {
        message: replyText.trim(),
        image_url: uploadedUrl || undefined,
      });

      const updatedTicket: SupportTicket = {
        ...selectedTicket,
        replies: [...(selectedTicket.replies || []), reply],
      };

      setSelectedTicket(updatedTicket);
      setTickets((list) =>
        (list ?? []).map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
      );
      setReplyText('');
      setReplyImage(null);
      setReplyImagePreview(null);
      toast.success('Reply sent successfully');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send reply'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    const newStatus: SupportTicket['status'] = selectedTicket.status === 'open' ? 'solved' : 'open';
    try {
      const updated = await superAdminService.updateTicket(selectedTicket.id, { status: newStatus });
      const merged = { ...selectedTicket, status: newStatus, solved_at: updated.solved_at };
      setTickets((list) =>
        (list ?? []).map((tk) => (tk.id === merged.id ? merged : tk))
      );
      setSelectedTicket(merged);
      toast.success(newStatus === 'solved' ? 'Ticket marked as solved' : 'Ticket reopened');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update ticket status'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title={t('nav.support', 'Support & Helpdesk')}
        subtitle="Ask the platform team for assistance, attach screenshots, and track resolutions"
        icon={LifeBuoy}
        actions={
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold" onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" /> New ticket
          </Button>
        }
      />

      <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {error ? (
          <ErrorState title="Couldn't load tickets" description={error} onRetry={load} />
        ) : (
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900 shadow-xl">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">Your organization tickets</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    Track questions, bug reports, and assistance requests from your team
                  </CardDescription>
                </div>
                <div className="flex gap-1 rounded-xl bg-white/[0.04] light:bg-gray-100 p-1 border border-white/[0.06] light:border-gray-200">
                  {(['all', 'open', 'solved'] as Filter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        'px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                        filter === f
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-white/50 hover:text-white light:text-gray-500 light:hover:text-gray-900'
                      )}
                    >
                      {f} <span className="tabular-nums opacity-80">({counts[f]})</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {tickets === null ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse light:bg-gray-100" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/40 light:bg-gray-50 light:text-gray-400">
                    <LifeBuoy className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold">
                    {filter === 'all' ? 'No tickets yet' : `No ${filter} tickets`}
                  </p>
                  <p className="text-xs text-white/50 light:text-gray-500 mt-1 max-w-sm">
                    {filter === 'all'
                      ? 'Have an issue or need assistance? Click "New ticket" above to notify the platform administrators.'
                      : `You don't have any tickets currently marked as ${filter}.`}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.04] light:divide-gray-100">
                  {visible.map((tk) => {
                    const solved = tk.status === 'solved';
                    return (
                      <li key={tk.id}>
                        <button
                          type="button"
                          onClick={() => openTicketDetail(tk)}
                          className="w-full py-4 px-3 -mx-3 flex items-center gap-3 text-left hover:bg-white/[0.03] light:hover:bg-gray-50 rounded-xl transition-colors group cursor-pointer"
                        >
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-xs',
                              solved
                                ? 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700'
                                : 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700'
                            )}
                          >
                            {solved ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate text-white light:text-gray-900 group-hover:text-emerald-400 transition-colors">
                                {tk.subject}
                              </p>
                              {tk.image_url && (
                                <span title="Screenshot attached" className="text-cyan-400">
                                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/50 light:text-gray-500 mt-0.5 truncate">
                              <span className="font-mono text-emerald-400/90 font-medium">{ticketRef(tk.id)}</span>
                              <span> · opened {formatDate(tk.created_at)}</span>
                              {solved && tk.solved_at && ` · solved ${formatDate(tk.solved_at)}`}
                              {tk.replies && tk.replies.length > 0 && (
                                <span className="ml-2 text-teal-400 font-medium">({tk.replies.length} replies)</span>
                              )}
                            </p>
                          </div>
                          <Badge className={cn('border-0 shadow-none text-[11px] capitalize shrink-0', priorityStyles[tk.priority])}>
                            {tk.priority}
                          </Badge>
                          <Badge
                            className={cn(
                              'border-0 shadow-none text-[11px] capitalize shrink-0 hidden sm:inline-flex',
                              solved
                                ? 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700'
                                : 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700'
                            )}
                          >
                            {tk.status}
                          </Badge>
                          <MessageSquare className="h-4 w-4 shrink-0 text-white/30 light:text-gray-300 group-hover:text-emerald-400" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* NEW TICKET DIALOG (WITH IMAGE UPLOAD) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#141415] border-white/10 text-white light:bg-white light:border-gray-200 light:text-gray-900 shadow-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-white light:text-gray-900">
                Raise a Support Ticket
              </DialogTitle>
              <DialogDescription className="text-xs text-white/50 light:text-gray-500">
                Describe what happened, attach screenshots, and our platform administrators will investigate.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3.5 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ticket-subject" className="text-xs font-semibold">Subject *</Label>
                <Input
                  id="ticket-subject"
                  required
                  maxLength={MAX_SUBJECT}
                  placeholder="e.g. WhatsApp number disconnection error"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className={fieldClass}
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Priority</Label>
                <Select value={form.priority} onValueChange={(p) => setForm({ ...form, priority: p as Priority })}>
                  <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#141415] text-white border-white/10 light:bg-white light:text-gray-900">
                    <SelectItem value="low">Low: question or minor question</SelectItem>
                    <SelectItem value="medium">Medium: feature or workflow issue</SelectItem>
                    <SelectItem value="high">High: urgent blocker / service impacted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-description" className="text-xs font-semibold">Details & Error Description</Label>
                <Textarea
                  id="ticket-description"
                  rows={4}
                  placeholder="Please describe the steps to reproduce or what error message appeared…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={fieldClass}
                />
              </div>

              {/* Upload Image Section */}
              <div className="grid gap-1.5 pt-1">
                <Label className="text-xs font-semibold text-white/80 light:text-gray-700 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                  Attach Screenshot or Image (Optional)
                </Label>

                {newImagePreview ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                    <img src={newImagePreview} alt="Upload preview" className="h-12 w-12 object-cover rounded-lg" />
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-semibold text-emerald-300 light:text-emerald-700 truncate">{newImage?.name}</p>
                      <p className="text-[10px] text-white/50 light:text-gray-500">Image will be attached to ticket</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setNewImage(null);
                        setNewImagePreview(null);
                      }}
                      className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="border border-dashed border-white/20 light:border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-500/60 hover:bg-white/[0.02] light:hover:bg-gray-50 transition-all flex flex-col items-center justify-center gap-1">
                    <Paperclip className="h-5 w-5 text-white/40 light:text-gray-400" />
                    <span className="text-xs font-semibold text-emerald-400">Click to upload screenshot</span>
                    <span className="text-[10px] text-white/40 light:text-gray-400">PNG, JPEG, WebP, GIF (up to 10 MB)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleNewImageSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-white/[0.08] light:border-gray-200 pt-3">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs">
                {submitting ? 'Submitting ticket…' : 'Send Ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* TICKET DETAIL POPUP (CONVERSATION & REPLIES & IMAGE ZOOM) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[88vh] flex flex-col p-0 overflow-hidden bg-[#141415] border-white/10 text-white light:bg-white light:border-gray-200 light:text-gray-900 shadow-2xl">
          {selectedTicket && (
            <>
              <DialogHeader className="p-5 border-b border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-gray-50/80 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {ticketRef(selectedTicket.id)}
                      </span>
                      <Badge className={cn('text-[10px] font-semibold uppercase', priorityStyles[selectedTicket.priority])}>
                        {selectedTicket.priority} Priority
                      </Badge>
                      <Badge
                        className={cn(
                          'text-[10px] font-semibold uppercase',
                          selectedTicket.status === 'solved'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                        )}
                      >
                        {selectedTicket.status}
                      </Badge>
                    </div>
                    <DialogTitle className="text-base sm:text-lg font-bold leading-tight">
                      {selectedTicket.subject}
                    </DialogTitle>
                    <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50 light:text-gray-500">
                      <span>Opened {formatDate(selectedTicket.created_at)}</span>
                      {selectedTicket.solved_at && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400">Solved {formatDate(selectedTicket.solved_at)}</span>
                        </>
                      )}
                    </DialogDescription>
                  </div>

                  {/* Status Toggle Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingStatus}
                    onClick={handleToggleStatus}
                    className="text-xs font-semibold shrink-0 border-white/10 light:border-gray-300"
                  >
                    {updatingStatus ? (
                      'Updating…'
                    ) : selectedTicket.status === 'open' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                        Mark Solved
                      </>
                    ) : (
                      <>
                        <CircleDot className="h-3.5 w-3.5 mr-1 text-amber-400" />
                        Reopen Ticket
                      </>
                    )}
                  </Button>
                </div>
              </DialogHeader>

              {/* Scrollable Conversation Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Original Description Card */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] light:bg-gray-50 light:border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center">
                      <LifeBuoy className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white light:text-gray-900">Your Initial Problem Statement</p>
                      <p className="text-[10px] text-white/40 light:text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(selectedTicket.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-sm text-white/90 light:text-gray-800 whitespace-pre-wrap leading-relaxed pl-9">
                    {selectedTicket.description || <span className="text-white/40 italic">No details were provided.</span>}
                  </div>

                  {/* Original Attached Image */}
                  {selectedTicket.image_url && (
                    <div className="mt-3 pl-9">
                      <p className="text-[11px] font-semibold text-white/50 light:text-gray-500 mb-1 flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Attached Screenshot:
                      </p>
                      <div
                        onClick={() => setZoomImageUrl(selectedTicket.image_url!)}
                        className="group relative inline-block rounded-lg overflow-hidden border border-white/10 light:border-gray-300 cursor-pointer max-w-sm max-h-48 bg-black/40"
                      >
                        <img
                          src={selectedTicket.image_url}
                          alt="Ticket screenshot"
                          className="object-cover max-h-48 hover:opacity-90 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-xs text-white font-medium">
                          <Maximize2 className="h-4 w-4" /> Click to zoom
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversation Replies Thread */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-white/[0.08] light:bg-gray-200 flex-1" />
                    <span className="text-[11px] font-semibold text-white/40 light:text-gray-400 uppercase tracking-wider">
                      Conversation History ({selectedTicket.replies?.length || 0})
                    </span>
                    <div className="h-px bg-white/[0.08] light:bg-gray-200 flex-1" />
                  </div>

                  {(!selectedTicket.replies || selectedTicket.replies.length === 0) ? (
                    <div className="py-6 text-center text-xs text-white/40 light:text-gray-400">
                      No replies on this ticket yet. Platform administrators will post updates here.
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
                              ? 'bg-emerald-950/20 border-emerald-500/20 text-white light:bg-emerald-50/70 light:border-emerald-200'
                              : 'bg-white/[0.03] border-white/[0.08] text-white light:bg-gray-50 light:border-gray-200'
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
                                {isSuperAdmin ? 'Platform Support' : 'You (Client)'}
                              </span>
                              <span className="text-xs font-semibold text-white/80 light:text-gray-800">
                                {reply.sender_name}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/40 light:text-gray-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(reply.created_at)}
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

              {/* Reply Section Footer */}
              <div className="p-4 border-t border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-gray-50/80 shrink-0">
                {replyImagePreview && (
                  <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 w-fit">
                    <img src={replyImagePreview} alt="Preview" className="h-10 w-10 object-cover rounded" />
                    <div className="text-xs">
                      <p className="font-semibold text-emerald-300 light:text-emerald-700">{replyImage?.name}</p>
                      <p className="text-[10px] text-white/40 light:text-gray-500">Ready to attach to reply</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setReplyImage(null);
                        setReplyImagePreview(null);
                      }}
                      className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10 ml-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                <Textarea
                  rows={2}
                  placeholder="Provide additional details or reply to support…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className={cn(fieldClass, 'resize-none text-xs sm:text-sm')}
                />

                <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                  {/* Attach image in reply */}
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.1] bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08] light:border-gray-200 light:bg-white light:text-gray-700 light:hover:bg-gray-100 transition-colors">
                      <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{replyImage ? 'Change Image' : 'Attach Screenshot'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleReplyImageSelect}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <Button
                    size="sm"
                    disabled={(!replyText.trim() && !replyImage) || sendingReply}
                    onClick={handleSendReply}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                  >
                    {sendingReply ? (
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
                alt="Screenshot enlarged"
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

export default SupportView;
