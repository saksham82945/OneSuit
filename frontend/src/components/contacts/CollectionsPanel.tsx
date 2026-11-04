import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FolderOpen,
  Hash,
  Layers,
  ListChecks,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { IconButton } from '@/components/shared/IconButton';
import { cn } from '@/lib/utils';
import { readData, readList, readTotal } from '@/services/response';
import {
  apiErrorMessage,
  colorFor,
  groupsService,
  listsService,
  type CollectionMember,
  type ContactGroup,
} from '@/services/groupsApi';
import { adapterFor, type Collection, type CollectionKind } from './collections';
import { CollectionFormDialog } from './CollectionFormDialog';
import { ContactPickerDialog } from './ContactPickerDialog';

interface CollectionsPanelProps {
  kind: CollectionKind;
  /** Selected group/list id (from the URL), or null for the overview. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  canWrite: boolean;
  contactsBase: string;
}

const MEMBERS_PAGE = 20;

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** Groups or Broadcast lists tab: overview grid, plus a detail view with members. */
export const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  kind,
  selectedId,
  onSelect,
  canWrite,
  contactsBase,
}) => {
  const adapter = adapterFor(kind);
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [toDelete, setToDelete] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(readList<Collection>(await adapter.list(), adapter.listKey));
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to load ${adapter.noun}s`));
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
      : items;
  }, [items, filter]);

  const selected = items.find((i) => i.id === selectedId) || null;

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adapter.delete(toDelete.id);
      toast.success(`Deleted “${toDelete.name}”`);
      if (selectedId === toDelete.id) onSelect(null);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to delete ${adapter.noun}`));
    } finally {
      setDeleting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Collection) => {
    setEditing(c);
    setFormOpen(true);
  };

  const dialogs = (
    <>
      <CollectionFormDialog
        kind={kind}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={(saved) => {
          load();
          if (!editing) onSelect(saved.id);
        }}
      />
      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${adapter.noun}`}
        itemName={toDelete?.name}
        description={`The ${adapter.noun} is removed. Its contacts are kept and stay in your directory.`}
        isSubmitting={deleting}
        onConfirm={handleDelete}
      />
    </>
  );

  if (selectedId) {
    if (loading && !selected) {
      return (
        <div className="flex items-center justify-center py-20 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      );
    }
    if (!selected) {
      return (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">This {adapter.noun} no longer exists.</p>
          <Button size="sm" variant="outline" onClick={() => onSelect(null)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> All {adapter.title.toLowerCase()}
          </Button>
        </div>
      );
    }
    return (
      <>
        <CollectionDetail
          kind={kind}
          collection={selected}
          canWrite={canWrite}
          contactsBase={contactsBase}
          onBack={() => onSelect(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => setToDelete(selected)}
          onChanged={load}
        />
        {dialogs}
      </>
    );
  }

  const EmptyIcon = kind === 'group' ? Layers : ListChecks;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{adapter.title}</h2>
            <Badge className="bg-teal-50 text-teal-700 border-teal-200 font-semibold text-[11px] px-2 py-0.5 rounded-full dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/60">
              {items.length} total
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {kind === 'group'
              ? 'Organise contacts into groups. One contact can be in many groups.'
              : 'Saved audiences for broadcast campaigns. Pick a list when you create a campaign.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchInput value={filter} onChange={setFilter} placeholder={`Search ${adapter.noun}s...`} className="w-56" />
          {canWrite && (
            <Button
              size="sm"
              onClick={openCreate}
              className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New {adapter.noun}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-14 px-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <EmptyIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            {kind === 'group' ? 'No groups yet' : 'No broadcast lists yet'}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            {kind === 'group'
              ? 'Create a group, then add contacts here or select them in All contacts and choose “Add to group”.'
              : 'Create a list of the people you want to message, then choose it as the audience of a campaign.'}
          </p>
          {canWrite && (
            <Button
              size="sm"
              onClick={openCreate}
              className="mt-4 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first {adapter.noun}
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-xs text-gray-500 dark:text-gray-400">No {adapter.noun}s match “{filter}”.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <CollectionCard
              key={item.id}
              kind={kind}
              item={item}
              canWrite={canWrite}
              onOpen={() => onSelect(item.id)}
              onEdit={() => openEdit(item)}
              onDelete={() => setToDelete(item)}
            />
          ))}
        </div>
      )}
      {dialogs}
    </div>
  );
};

const CollectionCard: React.FC<{
  kind: CollectionKind;
  item: Collection;
  canWrite: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ kind, item, canWrite, onOpen, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const color = colorFor(kind === 'group' ? item.color : 'emerald');
  const Icon = kind === 'group' ? FolderOpen : Megaphone;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="group relative rounded-2xl border border-gray-200/90 bg-white dark:bg-[#18201f] dark:border-[#1e2a28] p-4 text-left shadow-xs hover:shadow-md hover:border-teal-300 dark:hover:border-teal-800 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', color.soft)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2rem] mt-0.5">
            {item.description || (kind === 'group' ? 'No description' : 'Broadcast audience')}
          </p>
        </div>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label={`Actions for ${item.name}`}
                className="h-7 w-7 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-white/[0.06]"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Rename / edit
              </DropdownMenuItem>
              {kind === 'list' && (
                <DropdownMenuItem onClick={() => navigate(`/campaigns/new?list_id=${item.id}`)}>
                  <Megaphone className="h-3.5 w-3.5 mr-2" /> Send campaign
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-400 light:text-red-600">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border', color.chip)}>
          <Users className="h-3 w-3" />
          {plural(item.member_count, 'contact')}
        </span>
        <span className="text-[11px] whitespace-nowrap truncate text-gray-400 dark:text-gray-500">
          Updated {new Date(item.updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};

const CollectionDetail: React.FC<{
  kind: CollectionKind;
  collection: Collection;
  canWrite: boolean;
  contactsBase: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}> = ({ kind, collection, canWrite, contactsBase, onBack, onEdit, onDelete, onChanged }) => {
  const adapter = adapterFor(kind);
  const navigate = useNavigate();
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sourceDialog, setSourceDialog] = useState<'group' | 'tag' | 'all' | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await adapter.members(collection.id, {
        search: search.trim() || undefined,
        page,
        limit: MEMBERS_PAGE,
      });
      if (mine !== seq.current) return;
      setMembers(readList<CollectionMember>(res, 'contacts'));
      setTotal(readTotal(res, 'contacts'));
    } catch (err) {
      if (mine === seq.current) toast.error(apiErrorMessage(err, 'Failed to load contacts'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [adapter, collection.id, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPicked(new Set());
  }, [collection.id, page, search]);

  const refresh = () => {
    load();
    onChanged();
  };

  const removeContacts = async (ids: string[]) => {
    if (ids.length === 0) return;
    setRemoving(true);
    try {
      await adapter.removeContacts(collection.id, ids);
      toast.success(`Removed ${plural(ids.length, 'contact')} from “${collection.name}”`);
      setPicked(new Set());
      if (members.length === ids.length && page > 1) setPage(page - 1);
      else load();
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to remove contacts'));
    } finally {
      setRemoving(false);
    }
  };

  const addContacts = async (ids: string[]) => {
    try {
      const res = await adapter.addContacts(collection.id, ids);
      const added = readData<{ added?: number }>(res)?.added ?? ids.length;
      toast.success(
        `Added ${plural(added, 'contact')}` + (ids.length - added > 0 ? ` · ${ids.length - added} already in it` : '')
      );
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to add contacts'));
      throw err;
    }
  };

  const allPicked = members.length > 0 && members.every((m) => picked.has(m.id));
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const color = colorFor(kind === 'group' ? collection.color : 'emerald');
  const Icon = kind === 'group' ? FolderOpen : Megaphone;

  const columns: Column<CollectionMember>[] = [
    ...(canWrite
      ? [
          {
            key: 'select',
            label: '',
            width: 'w-10',
            render: (m: CollectionMember) => (
              <input
                type="checkbox"
                aria-label={`Select ${m.name || m.phone_number}`}
                checked={picked.has(m.id)}
                onChange={() => togglePick(m.id)}
                className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
              />
            ),
          } as Column<CollectionMember>,
        ]
      : []),
    {
      key: 'name',
      label: 'Contact',
      render: (m) => (
        <div className="flex flex-col min-w-0">
          <Link
            to={`${contactsBase}/${m.id}`}
            className="font-semibold text-xs text-gray-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 truncate max-w-[240px]"
          >
            {m.name || m.phone_number || 'Unnamed contact'}
          </Link>
          {m.marketing_opt_out && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">Opted out of marketing</span>
          )}
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone Number',
      render: (m) => (
        <code className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-gray-200 font-mono font-medium">
          {m.phone_number}
        </code>
      ),
    },
    {
      key: 'tags',
      label: 'Tags',
      render: (m) => (
        <div className="flex flex-wrap gap-1.5">
          {(m.tags || []).slice(0, 3).map((t) => (
            <Badge
              key={t}
              variant="secondary"
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/50"
            >
              {t}
            </Badge>
          ))}
          {(m.tags || []).length > 3 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-full">
              +{m.tags.length - 3}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'added',
      label: 'Added',
      render: (m) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(m.added_at).toLocaleDateString()}</span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (m: CollectionMember) => (
              <IconButton
                icon={UserMinus}
                label={`Remove from ${adapter.noun}`}
                className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                onClick={() => removeContacts([m.id])}
              />
            ),
          } as Column<CollectionMember>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All {adapter.title.toLowerCase()}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', color.soft)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{collection.name}</h2>
              <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border', color.chip)}>
                {plural(collection.member_count, 'contact')}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
              {collection.description || (kind === 'group' ? 'Contact group' : 'Broadcast list')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {kind === 'list' && (
            <Button
              size="sm"
              disabled={collection.member_count === 0}
              onClick={() => navigate(`/campaigns/new?list_id=${collection.id}`)}
              className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 shadow-sm"
            >
              <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Send campaign
            </Button>
          )}
          {canWrite && (
            <>
              {kind === 'list' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add contacts
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-[11px]">Add to this list</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setPickerOpen(true)}>
                      <UserPlus className="h-3.5 w-3.5 mr-2" /> Choose contacts…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSourceDialog('group')}>
                      <Layers className="h-3.5 w-3.5 mr-2" /> All contacts of a group…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSourceDialog('tag')}>
                      <Hash className="h-3.5 w-3.5 mr-2" /> All contacts with a tag…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSourceDialog('all')}>
                      <Users className="h-3.5 w-3.5 mr-2" /> Every contact
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add contacts
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="h-9 rounded-xl border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <IconButton
                icon={Trash2}
                label={`Delete ${adapter.noun}`}
                className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                onClick={onDelete}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search members..."
          className="w-64"
        />
        {canWrite && members.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(members.map((m) => m.id)))}
                className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
              />
              Select page
            </label>
            {picked.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={removing}
                onClick={() => removeContacts([...picked])}
                className="h-8 rounded-xl text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {removing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5 mr-1.5" />}
                Remove {picked.size}
              </Button>
            )}
          </div>
        )}
      </div>

      <DataTable
        items={members}
        columns={columns}
        isLoading={loading}
        emptyIcon={Users}
        emptyTitle={search ? 'No matching contacts' : `This ${adapter.noun} is empty`}
        emptyDescription={
          search
            ? 'Try another search term'
            : kind === 'group'
              ? 'Add contacts here, or select them in All contacts and choose “Add to group”.'
              : 'Add contacts one by one, from a group, by tag, or everyone at once.'
        }
        emptyAction={
          canWrite && !search ? (
            <Button
              size="sm"
              className="bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold rounded-xl"
              onClick={() => setPickerOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-1.5" /> Add contacts
            </Button>
          ) : undefined
        }
        currentPage={page}
        totalItems={total}
        pageSize={MEMBERS_PAGE}
        onPageChange={setPage}
      />

      <ContactPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={`Add contacts to “${collection.name}”`}
        description="Contacts already in it are skipped."
        confirmLabel="Add"
        onConfirm={addContacts}
      />

      {kind === 'list' && (
        <ListSourceDialog
          mode={sourceDialog}
          listId={collection.id}
          listName={collection.name}
          onClose={() => setSourceDialog(null)}
          onAdded={refresh}
        />
      )}
    </div>
  );
};

/** Add every contact of a group, with a tag, or everyone, to a broadcast list. */
const ListSourceDialog: React.FC<{
  mode: 'group' | 'tag' | 'all' | null;
  listId: string;
  listName: string;
  onClose: () => void;
  onAdded: () => void;
}> = ({ mode, listId, listName, onClose, onAdded }) => {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGroupId('');
    setTag('');
    if (mode === 'group') {
      groupsService
        .list()
        .then((res) => setGroups(readList<ContactGroup>(res, 'groups')))
        .catch((err) => toast.error(apiErrorMessage(err, 'Failed to load groups')));
    }
  }, [mode]);

  const submit = async () => {
    setSaving(true);
    try {
      const source =
        mode === 'group' ? { group_id: groupId } : mode === 'tag' ? { tag: tag.trim() } : { all_contacts: true as const };
      const res = await listsService.addMembers(listId, source);
      const { added = 0, matched = 0 } = readData<{ added?: number; matched?: number }>(res) || {};
      toast.success(
        matched === 0
          ? 'No matching contacts found'
          : `Added ${plural(added, 'contact')} to “${listName}”` + (matched - added > 0 ? ` · ${matched - added} already in it` : '')
      );
      onAdded();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to add contacts'));
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || (mode === 'group' && !groupId) || (mode === 'tag' && !tag.trim());

  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'group' ? 'Add a group’s contacts' : mode === 'tag' ? 'Add contacts by tag' : 'Add every contact'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'all'
              ? `Every contact in your directory will be added to “${listName}”. Contacts already in it are skipped.`
              : `Matching contacts are added to “${listName}” now. Later changes to the ${mode} don’t update the list.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'group' && (
          <div className="max-h-60 overflow-y-auto space-y-1.5" role="listbox" aria-label="Groups">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-xs text-white/50 light:text-gray-500">No groups yet.</p>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="option"
                  aria-selected={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                    groupId === g.id
                      ? 'border-emerald-500/70 bg-emerald-500/10 light:bg-emerald-50'
                      : 'border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50'
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', colorFor(g.color).dot)} />
                  <span className="flex-1 text-sm font-medium truncate">{g.name}</span>
                  <span className="text-[11px] text-white/50 light:text-gray-500">{g.member_count}</span>
                </button>
              ))
            )}
          </div>
        )}

        {mode === 'tag' && (
          <div className="grid gap-1.5">
            <label htmlFor="list-tag" className="text-xs font-medium">Tag name</label>
            <Input
              id="list-tag"
              autoFocus
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !disabled && submit()}
              placeholder="e.g. VIP"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={disabled} onClick={submit} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Add contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
