import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { contactsService, dataService, type ImportResult } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { CreateContactDialog } from '@/components/shared/CreateContactDialog';
import { ActionGrid, type ActionCardItem } from '@/components/shared/ActionGrid';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollectionsPanel } from '@/components/contacts/CollectionsPanel';
import { AddToCollectionDialog } from '@/components/contacts/AddToCollectionDialog';
import type { CollectionKind } from '@/components/contacts/collections';
import { colorFor, groupsService, type CollectionMember, type ContactGroup } from '@/services/groupsApi';
import {
  Users,
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Megaphone,
  Sparkles,
  UserPlus,
  Share2,
  Layers,
  ListChecks,
  FolderPlus,
  ListPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface Contact {
  id: string;
  phone_number?: string;
  phone?: string;
  profile_name?: string;
  name?: string;
  tags?: string[];
  unread_count?: number;
  last_message?: {
    content?: string;
    created_at?: string;
    status?: string;
  };
  last_message_at?: string;
  last_message_preview?: string;
  created_at: string;
}

const getDisplayName = (contact: Contact) => {
  return contact.profile_name || contact.name || contact.phone_number || contact.phone || 'Unnamed Contact';
};

const getPhone = (contact: Contact) => {
  return contact.phone_number || contact.phone || 'No phone';
};

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-teal-100 text-teal-800 border-teal-200/60 dark:bg-teal-950/60 dark:text-teal-300',
    'bg-purple-100 text-purple-800 border-purple-200/60 dark:bg-purple-950/60 dark:text-purple-300',
    'bg-amber-100 text-amber-800 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-emerald-100 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-blue-100 text-blue-800 border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-rose-100 text-rose-800 border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300',
  ];
  const charCode = name ? name.charCodeAt(0) : 0;
  return colors[charCode % colors.length];
};

const normalizeSearch = (raw: string) => {
  const trimmed = raw.trim().replace(/^\+/, '');
  return /^[\d\s()+-]+$/.test(trimmed) ? trimmed.replace(/[\s()+-]/g, '') : trimmed;
};

const getErrorMessage = async (err: unknown, fallback: string) => {
  if (!axios.isAxiosError(err)) return fallback;
  let data: unknown = err.response?.data;
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      return fallback;
    }
  }
  return (data as { message?: string } | undefined)?.message || fallback;
};

export const ContactsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Stay in whichever menu the user came from (Settings or Contacts).
  const contactsBase = useLocation().pathname.startsWith('/settings') ? '/settings/contacts' : '/contacts';
  const { hasPermission } = useAuthStore();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize] = useState(10);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const requestSeq = useRef(0);

  // CSV Import State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [updateOnDuplicate, setUpdateOnDuplicate] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Tabs: All contacts | Groups | Lists (kept in the URL so links and refresh work)
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: 'contacts' | 'groups' | 'lists' = rawTab === 'groups' || rawTab === 'lists' ? rawTab : 'contacts';
  const selectedCollectionId = searchParams.get('id');
  const setTab = (next: 'contacts' | 'groups' | 'lists', id?: string | null) => {
    const params = new URLSearchParams();
    if (next !== 'contacts') params.set('tab', next);
    if (id) params.set('id', id);
    setSearchParams(params);
  };

  // Group filter + bulk selection on the All contacts tab
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<CollectionKind | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setGroups(readList<ContactGroup>(await groupsService.list(), 'groups'));
    } catch {
      // The filter is optional; the directory still works without it.
    }
  }, []);

  useEffect(() => {
    if (tab === 'contacts') fetchGroups();
  }, [tab, fetchGroups]);

  const canWrite = hasPermission('contacts', 'write');
  const canDelete = hasPermission('contacts', 'delete');

  const fetchContacts = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const search = normalizeSearch(searchQuery);
      const params = { search: search || undefined, page: currentPage, limit: pageSize };
      if (groupFilter !== 'all') {
        // Filtering by group reads the group's members endpoint.
        const res = await groupsService.members(groupFilter, params);
        if (seq !== requestSeq.current) return;
        setContacts(
          readList<CollectionMember>(res, 'contacts').map((m) => ({ ...m, created_at: m.added_at }))
        );
        setTotalItems(readTotal(res, 'contacts'));
        return;
      }
      const res = await contactsService.list(params);
      if (seq !== requestSeq.current) return;
      setContacts(readList<Contact>(res, 'contacts'));
      setTotalItems(readTotal(res, 'contacts'));
    } catch (err) {
      if (seq === requestSeq.current) toast.error(await getErrorMessage(err, 'Failed to load contacts'));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [searchQuery, currentPage, pageSize, groupFilter]);

  useEffect(() => {
    if (tab === 'contacts') fetchContacts();
  }, [fetchContacts, tab]);

  // A deleted group can't stay selected as the filter.
  useEffect(() => {
    if (groupFilter !== 'all' && groups.length > 0 && !groups.some((g) => g.id === groupFilter)) {
      setGroupFilter('all');
    }
  }, [groups, groupFilter]);

  const pageIds = contacts.map((c) => c.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allPageSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  const activeGroup = groups.find((g) => g.id === groupFilter);

  const sortedContacts = useMemo(() => {
    const value = (c: Contact) =>
      sortKey === 'name'
        ? getDisplayName(c).toLowerCase()
        : sortKey === 'phone'
          ? getPhone(c)
          : c.created_at || '';
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...contacts].sort((a, b) => value(a).localeCompare(value(b)) * dir);
  }, [contacts, sortKey, sortDirection]);

  const handleDelete = async () => {
    if (!contactToDelete) return;
    setIsDeleting(true);
    try {
      await contactsService.delete(contactToDelete.id);
      toast.success('Contact deleted');
      setContactToDelete(null);
      if (contacts.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        fetchContacts();
      }
    } catch (err) {
      toast.error(await getErrorMessage(err, 'Failed to delete contact'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await dataService.exportData('contacts');
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const disposition = String(res.headers?.['content-disposition'] || '');
      const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] || 'contacts_export.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(await getErrorMessage(err, 'Failed to export contacts'));
    } finally {
      setIsExporting(false);
    }
  };

  const downloadSampleCSV = () => {
    const sample = 'phone_number,profile_name,tags\n+1234567890,Alice Smith,"VIP,Customer"\n+1987654321,Bob Jones,"Lead"';
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts_sample.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleRunImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = await dataService.importData('contacts', importFile, updateOnDuplicate);
      const result = readData<ImportResult>(res);
      setImportResult(result);
      toast.success(`Import complete: ${result.created || 0} created, ${result.updated || 0} updated`);
      fetchContacts();
    } catch (err) {
      toast.error(await getErrorMessage(err, 'Failed to import CSV file'));
    } finally {
      setIsImporting(false);
    }
  };

  const quickActions: ActionCardItem[] = [
    {
      id: 'broadcast',
      title: 'Send Broadcast Campaign',
      description: 'Reach thousands of qualified contacts instantly via Meta-approved templates.',
      icon: Megaphone,
      badge: 'Popular',
      badgeVariant: 'popular',
      iconBgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColorClass: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => navigate('/campaigns/new'),
    },
    {
      id: 'ai-lead',
      title: 'AI Lead Qualification',
      description: 'Automatically qualify incoming leads and sync custom attributes to contact tags.',
      icon: Sparkles,
      badge: 'AI',
      badgeVariant: 'ai',
      iconBgClass: 'bg-purple-50 dark:bg-purple-950/40',
      iconColorClass: 'text-purple-600 dark:text-purple-400',
      onClick: () => navigate('/chatbot'),
    },
    {
      id: 'new-contact',
      title: 'Add Single Contact',
      description: 'Directly register a phone number, name, and initial tag classification.',
      icon: UserPlus,
      badge: 'Quick',
      badgeVariant: 'new',
      iconBgClass: 'bg-teal-50 dark:bg-teal-950/40',
      iconColorClass: 'text-teal-600 dark:text-teal-400',
      onClick: () => setIsCreateOpen(true),
    },
    {
      id: 'lead-sync',
      title: 'Meta Lead Form Sync',
      description: 'Connect Click-to-WhatsApp ads to ingest inquiries directly into your CRM.',
      icon: Share2,
      iconBgClass: 'bg-blue-50 dark:bg-blue-950/40',
      iconColorClass: 'text-blue-600 dark:text-blue-400',
      onClick: () => toast.info('WhatsApp Lead Sync is active and monitoring incoming chats'),
    },
  ];

  const columns: Column<Contact>[] = [
    ...(canWrite
      ? [
          {
            key: 'select',
            label: '',
            width: 'w-10',
            render: (contact: Contact) => (
              <input
                type="checkbox"
                aria-label={`Select ${getDisplayName(contact)}`}
                checked={selectedIds.has(contact.id)}
                onChange={() => toggleSelected(contact.id)}
                className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
              />
            ),
          } as Column<Contact>,
        ]
      : []),
    {
      key: 'name',
      label: t('contacts.name') || 'Contact Name',
      sortable: true,
      render: (contact) => {
        const displayName = getDisplayName(contact);
        const avatarLetter = (displayName[0] || 'C').toUpperCase();
        const colorClass = getAvatarColor(displayName);

        return (
          <div className="flex items-center gap-3">
            <div
              className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border shadow-xs ${colorClass}`}
            >
              {avatarLetter}
            </div>
            <div className="flex flex-col min-w-0">
              <Link
                to={`${contactsBase}/${contact.id}`}
                className="font-semibold text-xs text-gray-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 transition-colors truncate max-w-[220px]"
              >
                {displayName}
              </Link>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                {contact.last_message?.content || contact.last_message_preview || 'No messages yet'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'phone',
      label: t('contacts.phoneNumber') || 'Phone Number',
      sortable: true,
      render: (contact) => (
        <code className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-gray-200 font-mono font-medium">
          {getPhone(contact)}
        </code>
      ),
    },
    {
      key: 'tags',
      label: t('contacts.tags') || 'Tags',
      render: (contact) => {
        const tags = contact.tags || [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/50"
              >
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'created_at',
      label: t('contacts.created') || 'Created',
      sortable: true,
      render: (contact) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(contact.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (contact) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={MessageSquare}
            label="Chat"
            className="text-gray-500 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
            onClick={() => navigate(`/chat/${contact.id}`)}
          />
          <Link to={`${contactsBase}/${contact.id}`}>
            <IconButton icon={Pencil} label="Edit" className="text-gray-500 hover:text-gray-900 dark:hover:text-white" />
          </Link>
          {canDelete && (
            <IconButton
              icon={Trash2}
              label="Delete"
              className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => setContactToDelete(contact)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900 dark:bg-[#0a0f0e] dark:text-gray-100 overflow-y-auto">
      {/* Top Header & Action Grid Section */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Modern Action Grid */}
        <ActionGrid
          guideTag="AUDIENCE PLAYBOOK"
          guideTitle="Grow and organise your WhatsApp audience"
          guideDescription="Import contacts, segment leads with tags, and set up automated re-engagement broadcasts."
          actions={quickActions}
        />

        {/* Directory Card */}
        <div className="rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-6 space-y-5">
          <div
            role="tablist"
            aria-label="Contacts sections"
            className="flex items-center gap-1 p-1 rounded-xl bg-gray-100/80 dark:bg-white/[0.04] w-fit max-w-full overflow-x-auto"
          >
            {([
              { id: 'contacts', label: 'All contacts', icon: Users },
              { id: 'groups', label: 'Groups', icon: Layers },
              { id: 'lists', label: 'Broadcast lists', icon: ListChecks },
            ] as const).map(({ id, label, icon: TabIcon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === id
                    ? 'bg-white text-teal-800 shadow-sm dark:bg-[#1f2b29] dark:text-emerald-300'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {tab !== 'contacts' ? (
            <CollectionsPanel
              key={tab}
              kind={tab === 'groups' ? 'group' : 'list'}
              selectedId={selectedCollectionId}
              onSelect={(id) => setTab(tab, id)}
              canWrite={canWrite}
              contactsBase={contactsBase}
            />
          ) : (
          <>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('contacts.allContacts') || 'Contacts Directory'}
                </h2>
                <Badge className="bg-teal-50 text-teal-700 border-teal-200 font-semibold text-[11px] px-2 py-0.5 rounded-full dark:bg-teal-950/60 dark:text-teal-300">
                  {totalItems} total
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('contacts.allContactsDesc') || 'Search, filter, and manage verified customer phone numbers'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <SearchInput
                value={searchQuery}
                onChange={(value) => {
                  setSearchQuery(value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name, phone..."
                className="w-64"
              />

              {groups.length > 0 && (
                <Select
                  value={groupFilter}
                  onValueChange={(v) => {
                    setGroupFilter(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger
                    aria-label="Filter by group"
                    className="h-9 w-44 rounded-xl text-xs font-semibold"
                  >
                    <SelectValue placeholder="All groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${colorFor(g.color).dot}`} />
                          {g.name}
                          <span className="opacity-50">({g.member_count})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <input
                type="file"
                ref={csvInputRef}
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                    setImportResult(null);
                    setIsImportOpen(true);
                  }
                  e.target.value = '';
                }}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImportFile(null);
                  setImportResult(null);
                  setIsImportOpen(true);
                }}
                className="h-9 rounded-xl border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5 text-teal-600 dark:text-teal-400" />
                Import CSV
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={isExporting}
                onClick={handleExport}
                className="h-9 rounded-xl border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
              >
                <Download className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </Button>

              {canWrite && (
                <Button
                  size="sm"
                  className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Contact
                </Button>
              )}
            </div>
          </div>

          {activeGroup && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span>Showing contacts in</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-semibold ${colorFor(activeGroup.color).chip}`}>
                {activeGroup.name}
                <button
                  type="button"
                  aria-label="Clear group filter"
                  onClick={() => {
                    setGroupFilter('all');
                    setCurrentPage(1);
                  }}
                  className="hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              <button
                type="button"
                onClick={() => setTab('groups', activeGroup.id)}
                className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
              >
                Manage group
              </button>
            </div>
          )}

          {canWrite && contacts.length > 0 && (
            <div
              className={`flex items-center justify-between flex-wrap gap-3 rounded-xl px-3.5 py-2.5 border transition-colors ${
                selectedIds.size > 0
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60'
                  : 'bg-gray-50/80 border-gray-200/70 dark:bg-white/[0.02] dark:border-white/[0.06]'
              }`}
            >
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
                  />
                  Select page
                </label>
                {selectedIds.size > 0 ? (
                  <>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      {selectedIds.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:underline"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">Select contacts to add them to a group or list</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0}
                  onClick={() => setBulkTarget('group')}
                  className="h-8 rounded-xl text-xs font-semibold border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
                >
                  <FolderPlus className="h-3.5 w-3.5 mr-1.5 text-teal-600 dark:text-teal-400" />
                  Add to group
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0}
                  onClick={() => setBulkTarget('list')}
                  className="h-8 rounded-xl text-xs font-semibold border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
                >
                  <ListPlus className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                  Add to list
                </Button>
              </div>
            </div>
          )}

          <DataTable
            items={sortedContacts}
            columns={columns}
            isLoading={isLoading}
            emptyIcon={Users}
            emptyTitle={searchQuery ? 'No matching contacts' : 'No contacts yet'}
            emptyDescription={searchQuery ? 'Try another search term' : 'Add your first contact to start messaging'}
            emptyAction={
              canWrite ? (
                <Button
                  size="sm"
                  className="bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold rounded-xl"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Contact
                </Button>
              ) : undefined
            }
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(k, dir) => {
              setSortKey(k);
              setSortDirection(dir);
            }}
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
          </>
          )}
        </div>
      </div>

      <AddToCollectionDialog
        kind={bulkTarget || 'group'}
        open={bulkTarget !== null}
        onOpenChange={(open) => !open && setBulkTarget(null)}
        contactIds={[...selectedIds]}
        onDone={() => {
          setSelectedIds(new Set());
          fetchGroups();
          if (groupFilter !== 'all') fetchContacts();
        }}
      />

      <CreateContactDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => fetchContacts()}
      />

      <DeleteConfirmDialog
        open={!!contactToDelete}
        onOpenChange={(open) => !open && setContactToDelete(null)}
        title="Delete Contact"
        itemName={contactToDelete ? getDisplayName(contactToDelete) : undefined}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />

      {/* Import Contacts from CSV Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-md bg-white text-gray-900 border-gray-200 dark:bg-[#141415] dark:border-white/10 dark:text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Import Contacts from CSV
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 dark:text-gray-400">
              Bulk upload customer phone numbers, names, and tags from a CSV file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!importFile ? (
              <div
                onClick={() => csvInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-teal-500 rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-teal-50/20 dark:hover:bg-white/[0.02]"
              >
                <Upload className="h-8 w-8 text-teal-600 dark:text-teal-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-900 dark:text-white">
                  Click to choose CSV file
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  File must contain <code className="font-mono text-teal-600">phone_number</code> column
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileSpreadsheet className="h-5 w-5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="text-xs font-medium truncate">{importFile.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    onClick={() => {
                      setImportFile(null);
                      setImportResult(null);
                    }}
                  >
                    Change
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="updateDuplicate"
                    checked={updateOnDuplicate}
                    onChange={(e) => setUpdateOnDuplicate(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <Label htmlFor="updateDuplicate" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    Update existing contact if phone number already exists
                  </Label>
                </div>

                {importResult && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Import Processed
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span>Created: <strong>{importResult.created}</strong></span>
                      <span>Updated: <strong>{importResult.updated}</strong></span>
                      <span>Skipped: <strong>{importResult.skipped}</strong></span>
                      {importResult.errors > 0 && <span className="text-red-500">Errors: <strong>{importResult.errors}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/10 text-xs">
              <span className="text-gray-400 text-[11px]">Need help with columns?</span>
              <button
                type="button"
                onClick={downloadSampleCSV}
                className="text-teal-700 dark:text-teal-400 hover:underline font-semibold text-[11px] flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Download Sample CSV
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(false)}
              className="text-xs rounded-xl"
            >
              Close
            </Button>
            <Button
              size="sm"
              disabled={!importFile || isImporting}
              onClick={handleRunImport}
              className="bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold rounded-xl"
            >
              {isImporting ? 'Importing...' : 'Upload & Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactsView;
