import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  X,
  Pencil,
  Mail,
  Phone,
  Languages,
  Smartphone,
  UserCheck,
  Tags as TagsIcon,
  Plus,
  StickyNote,
  Trash2,
  Loader2,
  Clock,
} from 'lucide-react';
import { contactsService, notesService, type ConversationNote, type Tag } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  type Contact,
  type TeamMember,
  getAvatarColor,
  getContactName,
  getErrorMessage,
  getInitials,
  isWindowOpen,
  metaString,
  tagChipStyle,
  windowTimeLeft,
} from './chatUtils';

interface ContactPanelProps {
  contact: Contact;
  team: TeamMember[];
  currentUser?: { id: string; full_name?: string } | null;
  availableTags: Tag[];
  tagColors: Record<string, string>;
  notes: ConversationNote[];
  onNotesChange: (notes: ConversationNote[]) => void;
  onContactChange: (patch: Partial<Contact>) => void;
  initialTab?: 'info' | 'notes';
  onClose: () => void;
  className?: string;
}

const sectionTitle = 'mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400';
const card = 'rounded-2xl border border-gray-200/80 bg-white p-3.5 dark:border-white/[0.07] dark:bg-white/[0.03]';

export const ContactPanel: React.FC<ContactPanelProps> = ({
  contact,
  team,
  currentUser,
  availableTags,
  tagColors,
  notes,
  onNotesChange,
  onContactChange,
  initialTab = 'info',
  onClose,
  className,
}) => {
  const [tab, setTab] = useState<'info' | 'notes'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const name = getContactName(contact);
  const email = metaString(contact, 'email');
  const language = metaString(contact, 'language');

  // Assignment
  const [assignee, setAssignee] = useState<string>(contact.assigned_user_id || '');
  const [savingAssign, setSavingAssign] = useState(false);
  useEffect(() => setAssignee(contact.assigned_user_id || ''), [contact.id, contact.assigned_user_id]);

  // Tags
  const [tags, setTags] = useState<string[]>(contact.tags || []);
  const [tagToAdd, setTagToAdd] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const contactTagsKey = (contact.tags || []).join('\u0000');
  useEffect(() => setTags(contact.tags || []), [contact.id, contactTagsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tagsDirty = tags.join('\u0000') !== contactTagsKey;

  // Edit contact
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', language: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Notes
  const [noteText, setNoteText] = useState('');

  const teamOptions: TeamMember[] = team.length
    ? team
    : currentUser
      ? [{ id: currentUser.id, full_name: currentUser.full_name || 'Me' }]
      : [];
  const assigneeKnown = !assignee || teamOptions.some((m) => m.id === assignee);

  const saveAssignment = async () => {
    setSavingAssign(true);
    try {
      await contactsService.assign(contact.id, assignee || null);
      onContactChange({ assigned_user_id: assignee || null });
      const who = teamOptions.find((m) => m.id === assignee)?.full_name;
      toast.success(assignee ? `Assigned to ${who || 'team member'}` : 'Chat unassigned');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to assign chat'));
    } finally {
      setSavingAssign(false);
    }
  };

  const saveTags = async () => {
    setSavingTags(true);
    try {
      await contactsService.updateTags(contact.id, tags);
      onContactChange({ tags });
      toast.success('Labels saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save labels'));
    } finally {
      setSavingTags(false);
    }
  };

  const openEdit = () => {
    setForm({ name: contact.profile_name || contact.name || '', email, language });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const mail = form.email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSavingEdit(true);
    try {
      const metadata = { ...(contact.metadata || {}), email: mail, language: form.language.trim() };
      await contactsService.update(contact.id, { profile_name: form.name.trim(), metadata });
      onContactChange({ profile_name: form.name.trim(), name: form.name.trim(), metadata });
      setEditOpen(false);
      toast.success('Contact updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update contact'));
    } finally {
      setSavingEdit(false);
    }
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteText.trim();
    if (!content) return;
    try {
      const note = readData<ConversationNote>(await notesService.create(contact.id, { content }));
      if (note?.id) onNotesChange([note, ...notes]);
      setNoteText('');
      toast.success('Internal note added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add note'));
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await notesService.delete(contact.id, id);
      onNotesChange(notes.filter((n) => n.id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete note'));
    }
  };

  const open = isWindowOpen(contact);
  const left = windowTimeLeft(contact);
  const unusedTags = availableTags.filter((t) => !tags.includes(t.name));

  const infoRow = (Icon: React.ElementType, label: string, value: string) => (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
        <div className={cn('break-words text-xs', value ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400')}>
          {value || 'Not set'}
        </div>
      </div>
    </div>
  );

  return (
    <aside className={cn('flex min-h-0 flex-col bg-gray-50 dark:bg-[#0f1716]', className)}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200/80 bg-white px-3 dark:border-white/[0.07] dark:bg-[#111a19]">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-0.5 text-xs font-medium dark:bg-white/[0.05]">
          {(['info', 'notes'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-1.5',
                tab === t
                  ? 'bg-white text-teal-800 shadow-sm dark:bg-teal-900/50 dark:text-teal-100'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              {t === 'info' ? 'Contact Info' : 'Notes'}
              {t === 'notes' && notes.length > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white">{notes.length}</span>
              )}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel" className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:hover:text-white">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {tab === 'info' ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* Identity */}
          <div className={cn(card, 'text-center')}>
            <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold', getAvatarColor(name))}>
              {getInitials(name)}
            </div>
            <h3 className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{name}</h3>
            <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{contact.phone_number}</p>
            <span
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                open
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
              )}
            >
              <Clock className="h-3 w-3" />
              {open ? `Reply window open${left ? ` · ${left} left` : ''}` : 'Reply window closed'}
            </span>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <span className={sectionTitle}>Details</span>
              <button
                type="button"
                onClick={openEdit}
                className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-900/30"
              >
                <Pencil className="h-3 w-3" /> Edit contact
              </button>
            </div>
            {infoRow(Phone, 'Phone', contact.phone_number)}
            {infoRow(Mail, 'Email', email)}
            {infoRow(Languages, 'Language', language)}
            {infoRow(Smartphone, 'WhatsApp number', contact.whatsapp_account || 'Default account')}
          </div>

          {/* Assign team member */}
          <div className={card}>
            <span className={sectionTitle}>
              <UserCheck className="h-3.5 w-3.5" /> Assign team member
            </span>
            <div className="flex gap-2">
              <select
                aria-label="Assign team member"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-2.5 text-xs text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-white/[0.1] dark:bg-[#0f1716] dark:text-white"
              >
                <option value="">Unassigned</option>
                {!assigneeKnown && <option value={assignee}>Another team member</option>}
                {teamOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                    {m.id === currentUser?.id ? ' (you)' : ''}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={saveAssignment}
                disabled={savingAssign || assignee === (contact.assigned_user_id || '')}
                className="h-9 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {savingAssign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>

          {/* Labels */}
          <div className={card}>
            <span className={sectionTitle}>
              <TagsIcon className="h-3.5 w-3.5" /> Labels
            </span>
            <div className="flex min-h-[28px] flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-xs text-gray-400">No labels yet</span>}
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={tagChipStyle(tagColors[tag])}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    aria-label={`Remove ${tag}`}
                    className="rounded-full opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex gap-2">
              <select
                aria-label="Add a label"
                value={tagToAdd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
                  setTagToAdd('');
                }}
                disabled={unusedTags.length === 0}
                className="h-9 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-2.5 text-xs text-gray-900 focus:border-teal-500 focus:outline-none disabled:opacity-60 dark:border-white/[0.1] dark:bg-[#0f1716] dark:text-white"
              >
                <option value="">{unusedTags.length ? '+ Add label' : availableTags.length ? 'All labels added' : 'Create labels in Tags'}</option>
                {unusedTags.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={saveTags}
                disabled={!tagsDirty || savingTags}
                className="h-9 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {savingTags ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <form onSubmit={addNote} className="space-y-2 border-b border-gray-200/80 p-3 dark:border-white/[0.07]">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add an internal note for your team (customers never see it)…"
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-white/[0.1] dark:bg-[#0f1716] dark:text-white"
            />
            <Button type="submit" size="sm" disabled={!noteText.trim()} className="h-8 w-full gap-1.5 rounded-xl bg-amber-600 text-xs font-semibold text-white hover:bg-amber-500">
              <Plus className="h-3.5 w-3.5" /> Save note
            </Button>
          </form>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
            {notes.length === 0 && (
              <p className="flex flex-col items-center gap-2 py-8 text-center text-xs text-gray-400">
                <StickyNote className="h-5 w-5" /> No notes yet
              </p>
            )}
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-800 dark:text-amber-300">{n.created_by_name || 'Team member'}</span>
                  <span className="flex items-center gap-2 text-gray-400">
                    {new Date(n.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {n.created_by_id === currentUser?.id && (
                      <button type="button" onClick={() => deleteNote(n.id)} aria-label="Delete note" className="hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-gray-200">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
            <DialogDescription>Phone number {contact.phone_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Language</Label>
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="e.g. English, Hindi" className="mt-1 h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={savingEdit} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {savingEdit ? 'Saving…' : 'Save contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default ContactPanel;
