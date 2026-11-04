import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Gift,
  Loader2,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Tag as TagIcon,
  Users,
  X,
  ListChecks,
  UserRound,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, accountsService, campaignsService, contactsService, tagsService, templatesService, type Tag } from '@/services/api';
import { readData, readList } from '@/services/response';
import { groupsService, listsService, colorFor, type BroadcastList, type ContactGroup } from '@/services/groupsApi';
import { getColorHex } from '@/views/settings/TagsView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// New campaign wizard: 1 Goal → 2 Audience → 3 Journey → 4 Review.
// The server works out the recipients from the chosen audience.

interface TemplateOption {
  id: string;
  name: string;
  display_name?: string;
  language?: string;
  status?: string;
  category?: string;
  whatsapp_account?: string;
  header_type?: string;
  header_content?: string;
  body_content?: string;
  footer_content?: string;
}

interface PickedContact {
  id: string;
  name: string;
  phone: string;
}

const STEPS = ['Goal', 'Audience', 'Journey', 'Review'] as const;

const GOALS = [
  { id: 'promotion', title: 'Promotion / offer', hint: 'Sales, discounts, launches', icon: Gift, marketing: true },
  { id: 'announcement', title: 'Announcement', hint: 'News and updates', icon: Megaphone, marketing: true },
  { id: 'reminder', title: 'Reminder', hint: 'Payments, appointments, events', icon: Bell, marketing: false },
  { id: 'reengage', title: 'Re-engagement', hint: 'Win back quiet customers', icon: RotateCcw, marketing: true },
] as const;

const errorMessage = (err: unknown, fallback: string) => {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof m === 'string' && m ? m : fallback;
};

const card =
  'rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141b1a] light:border-gray-200 light:bg-white';

/** A toggleable chip. */
const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }> = ({ active, onClick, children, dot }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]'
    )}
  >
    {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />}
    {children}
    {active && <Check className="h-3 w-3" />}
  </button>
);

const Section: React.FC<{ icon: React.ElementType; title: string; hint?: string; children: React.ReactNode }> = ({ icon: Icon, title, hint, children }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
    </div>
    {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    {children}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-white/20')}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
    <span>
      <span className="block text-sm text-gray-900 dark:text-white">{label}</span>
      {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </span>
  </label>
);

export const CampaignWizardView: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);

  // Step 1: goal
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<(typeof GOALS)[number]['id']>('promotion');

  // Step 2: audience
  const [allContacts, setAllContacts] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [listIds, setListIds] = useState<string[]>(params.get('list_id') ? [params.get('list_id') as string] : []);
  const [picked, setPicked] = useState<PickedContact[]>([]);
  const [excludeOptedOut, setExcludeOptedOut] = useState(true);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [matchLanguage, setMatchLanguage] = useState(false);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<PickedContact[]>([]);
  const [preview, setPreview] = useState<{ count: number; opted_out: number; sample: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Step 3: journey
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');

  // Step 4
  const [startNow, setStartNow] = useState(true);
  const [creating, setCreating] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const goalInfo = GOALS.find((g) => g.id === goal)!;

  // --- data loading ---
  const loadTemplates = useCallback(async () => {
    try {
      const list = readList<TemplateOption>(await templatesService.list({ limit: 500 }), 'templates');
      setTemplates(list);
      setTemplateId((cur) => cur || (list.find((t) => (t.status || '').toUpperCase() === 'APPROVED') || list[0])?.id || '');
      return list;
    } catch {
      return [];
    } finally {
      setTemplatesLoaded(true);
    }
  }, []);

  const syncTemplates = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        const names = readList<{ name?: string }>(await accountsService.list(), 'accounts')
          .map((a) => a.name)
          .filter((n): n is string => !!n);
        if (names.length === 0) {
          if (!quiet) toast.error('Connect a WhatsApp number first, then sync templates');
          return;
        }
        const failures: string[] = [];
        for (const n of names) {
          try {
            await api.post('/templates/sync', { whatsapp_account: n });
          } catch (err) {
            failures.push(`${n}: ${errorMessage(err, 'sync failed')}`);
          }
        }
        const list = await loadTemplates();
        if (!quiet) {
          if (failures.length) toast.error(`Template sync failed for ${failures.join('; ')}`);
          else toast.success(list.length ? `Loaded ${list.length} templates from Meta` : 'Meta has no templates for this number yet');
        }
      } finally {
        setSyncing(false);
      }
    },
    [loadTemplates]
  );

  useEffect(() => {
    void loadTemplates().then((list) => {
      if (list.length === 0) void syncTemplates(true);
    });
    tagsService.list({ limit: 200 }).then((r) => setAllTags(readList<Tag>(r, 'tags'))).catch(() => setAllTags([]));
    groupsService.list().then((r) => setGroups(readList<ContactGroup>(r, 'groups'))).catch(() => setGroups([]));
    listsService.list().then((r) => setLists(readList<BroadcastList>(r, 'lists'))).catch(() => setLists([]));
  }, [loadTemplates, syncTemplates]);

  // Contact search for picking single contacts
  useEffect(() => {
    const q = contactSearch.trim();
    if (q.length < 2) {
      setContactResults([]);
      return;
    }
    const t = setTimeout(() => {
      contactsService
        .list({ search: q, limit: 8 })
        .then((r) =>
          setContactResults(
            readList<{ id: string; name?: string; profile_name?: string; phone_number?: string }>(r, 'contacts').map((c) => ({
              id: c.id,
              name: c.name || c.profile_name || c.phone_number || 'Contact',
              phone: c.phone_number || '',
            }))
          )
        )
        .catch(() => setContactResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  const audience = useMemo(
    () => ({
      all_contacts: allContacts,
      tags: allContacts ? [] : tags,
      group_ids: allContacts ? [] : groupIds,
      list_ids: allContacts ? [] : listIds,
      contact_ids: allContacts ? [] : picked.map((p) => p.id),
      exclude_opted_out: excludeOptedOut,
      exclude_tags: excludeTags,
      language: matchLanguage ? template?.language || '' : '',
    }),
    [allContacts, tags, groupIds, listIds, picked, excludeOptedOut, excludeTags, matchLanguage, template?.language]
  );
  const audienceChosen = allContacts || tags.length + groupIds.length + listIds.length + picked.length > 0;

  // Live recipient count
  useEffect(() => {
    if (!audienceChosen) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(() => {
      api
        .post('/campaigns/audience/preview', audience)
        .then((r) => setPreview(readData<{ count: number; opted_out: number; sample: string[] }>(r) ?? null))
        .catch((err) => {
          setPreview(null);
          toast.error(errorMessage(err, 'Could not count the audience'));
        })
        .finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [audience, audienceChosen]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // --- step validation ---
  const stepError = (s: number): string => {
    if (s === 0 && !name.trim()) return 'Give the campaign a name';
    if (s === 1) {
      if (!audienceChosen) return 'Choose who should get this campaign';
      if (preview && preview.count === 0) return 'No contacts match this audience';
    }
    if (s === 2) {
      if (!template) return 'Choose a message template';
      if (!template.whatsapp_account) return 'This template is not linked to a WhatsApp number';
      if (when === 'later') {
        if (!scheduleAt) return 'Pick a date and time';
        if (new Date(scheduleAt).getTime() <= Date.now()) return 'The scheduled time must be in the future';
      }
    }
    return '';
  };

  const goTo = (target: number) => {
    for (let s = 0; s < target; s++) {
      const err = stepError(s);
      if (err) {
        setStep(s);
        toast.error(err);
        return;
      }
    }
    setStep(target);
  };

  const create = async () => {
    for (let s = 0; s < 3; s++) {
      const err = stepError(s);
      if (err) {
        setStep(s);
        toast.error(err);
        return;
      }
    }
    if (!template) return;
    setCreating(true);
    try {
      const created = readData<{ id: string; total_recipients?: number; status?: string }>(
        await campaignsService.create({
          name: name.trim(),
          whatsapp_account: template.whatsapp_account,
          template_id: template.id,
          scheduled_at: when === 'later' ? new Date(scheduleAt).toISOString() : undefined,
          audience,
        })
      );
      const n = created.total_recipients || 0;
      if (when === 'now' && startNow) {
        try {
          await campaignsService.start(created.id);
          toast.success(`Campaign started for ${n} recipient${n === 1 ? '' : 's'}`);
        } catch (err) {
          toast.error(`Campaign created, but it couldn't start: ${errorMessage(err, 'unknown error')}`);
        }
      } else if (when === 'later') {
        toast.success(`Campaign scheduled for ${new Date(scheduleAt).toLocaleString()} · ${n} recipients`);
      } else {
        toast.success(`Draft saved with ${n} recipient${n === 1 ? '' : 's'}. Start it when you're ready.`);
      }
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create campaign'));
    } finally {
      setCreating(false);
    }
  };

  const isMarketing = (template?.category || '').toUpperCase() === 'MARKETING';
  const hasVars = !!template && /\{\{[^}]+\}\}/.test(`${template.body_content || ''} ${template.header_type === 'TEXT' ? template.header_content || '' : ''}`);

  // --- UI ---
  const Stepper = (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="Campaign steps">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => (i <= step ? setStep(i) : goTo(i))}
              className="flex min-w-0 items-center gap-2"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
                  done && 'border-emerald-600 bg-emerald-600 text-white',
                  active && 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                  !done && !active && 'border-gray-300 text-gray-400 dark:border-white/20'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('hidden truncate text-sm font-medium sm:block', active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className={cn('h-0.5 flex-1 rounded', i < step ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-white/10')} />}
          </li>
        );
      })}
    </ol>
  );

  const RecipientsBadge = (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
      <Users className="h-4 w-4" />
      {previewing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <span>
          <b>{preview?.count ?? 0}</b> recipient{preview?.count === 1 ? '' : 's'}
          {preview && preview.opted_out > 0 && !excludeOptedOut && <span className="text-amber-700 dark:text-amber-300"> · {preview.opted_out} opted out</span>}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#f8faf9] text-gray-900 dark:bg-[#0a0f0e] dark:text-gray-100 light:bg-gray-50 light:text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0d1312]/95 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <button type="button" onClick={() => navigate('/campaigns')} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to campaigns">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-semibold">Create campaign</h1>
        </div>
        <div className="mx-auto mt-3 max-w-4xl">{Stepper}</div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 p-4 sm:p-6">
        {step === 0 && (
          <div className={cn(card, 'space-y-5')}>
            <div>
              <h2 className="text-base font-bold">Step 1 · Goal</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Name the campaign and tell us what it's for.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="camp-name" className="text-xs">Campaign name *</Label>
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer – Nashik builders" maxLength={255} autoFocus />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setGoal(g.id);
                    setExcludeOptedOut(g.marketing);
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    goal === g.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <g.icon className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <span className="block text-sm font-semibold">{g.title}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{g.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className={cn(card, 'space-y-6')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Step 2 · Audience</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mix tags, groups, broadcast lists and single contacts. Each person gets it once.</p>
              </div>
              {RecipientsBadge}
            </div>

            <Toggle checked={allContacts} onChange={setAllContacts} label="Send to all contacts" hint="Everyone in this workspace (filters below still apply)" />

            {!allContacts && (
              <>
                <Section icon={TagIcon} title="Labels / tags" hint={allTags.length ? undefined : 'No tags yet. Create them in Settings → Tags.'}>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((t) => (
                      <Chip key={t.name} active={tags.includes(t.name)} onClick={() => toggle(tags, setTags, t.name)} dot={getColorHex(t.color)}>
                        {t.name}
                      </Chip>
                    ))}
                  </div>
                </Section>

                <Section icon={Users} title="Groups" hint={groups.length ? undefined : 'No groups yet. Create them in Contacts → Groups.'}>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => (
                      <Chip key={g.id} active={groupIds.includes(g.id)} onClick={() => toggle(groupIds, setGroupIds, g.id)}>
                        <span className={cn('h-2 w-2 rounded-full', colorFor(g.color).dot)} />
                        {g.name} <span className="text-gray-400">({g.member_count})</span>
                      </Chip>
                    ))}
                  </div>
                </Section>

                <Section icon={ListChecks} title="Broadcast lists" hint={lists.length ? undefined : 'No broadcast lists yet. Create them in Contacts → Broadcast lists.'}>
                  <div className="flex flex-wrap gap-2">
                    {lists.map((l) => (
                      <Chip key={l.id} active={listIds.includes(l.id)} onClick={() => toggle(listIds, setListIds, l.id)}>
                        {l.name} <span className="text-gray-400">({l.member_count})</span>
                      </Chip>
                    ))}
                  </div>
                </Section>

                <Section icon={UserRound} title="Single contacts">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search by name or phone (2+ letters)" className="pl-8" />
                    {contactResults.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#141b1a]">
                        {contactResults.map((c) => {
                          const on = picked.some((p) => p.id === c.id);
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPicked(on ? picked.filter((p) => p.id !== c.id) : [...picked, c]);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/[0.05]"
                              >
                                <span>
                                  {c.name} <span className="text-xs text-gray-500">{c.phone}</span>
                                </span>
                                {on && <Check className="h-4 w-4 text-emerald-600" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {picked.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {picked.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-white/10">
                          {p.name}
                          <button type="button" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}

            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold">Filters</h4>
              </div>
              <Toggle checked={excludeOptedOut} onChange={setExcludeOptedOut} label="Skip contacts who opted out of marketing" hint="Recommended for promotions; Meta may block numbers that keep messaging opted-out people." />
              <Toggle checked={matchLanguage} onChange={setMatchLanguage} label="Restrict by language" hint="Send only to contacts whose language matches the template's language (chosen in step 3)." />
              {allTags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Leave out contacts with these tags</p>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((t) => (
                      <Chip key={t.name} active={excludeTags.includes(t.name)} onClick={() => toggle(excludeTags, setExcludeTags, t.name)} dot={getColorHex(t.color)}>
                        {t.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {preview && preview.sample.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Includes {preview.sample.join(', ')}
                {preview.count > preview.sample.length ? ` and ${preview.count - preview.sample.length} more` : ''}.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={cn(card, 'space-y-6')}>
            <div>
              <h2 className="text-base font-bold">Step 3 · Journey</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pick the message and when it goes out.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-xs">Approved message template *</Label>
                {templatesLoaded && templates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm dark:border-white/10">
                    <p className="font-medium">{syncing ? 'Getting your templates from Meta…' : 'No message templates yet'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => syncTemplates()} disabled={syncing}>
                        {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                        Sync templates from Meta
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => navigate('/templates')}>
                        Create a template
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {templates.map((t) => {
                      const st = (t.status || '').toUpperCase();
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                            templateId === t.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{t.display_name || t.name}</span>
                            <span className="block text-[11px] text-gray-500">
                              {[t.category, t.language, t.whatsapp_account].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                              st === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                            )}
                          >
                            {st || 'UNKNOWN'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {template && (template.status || '').toUpperCase() !== 'APPROVED' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Meta hasn't approved this template yet, so messages will fail until it does.</p>
                )}
                {hasVars && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This template has variables like {'{{1}}'}; contacts carry no values for them, so Meta may reject the messages. Prefer a template without variables.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Preview</Label>
                <div className="mt-2 rounded-xl bg-[#e7ded5] p-4 dark:bg-[#0b141a]">
                  {template ? (
                    <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white p-3 text-sm text-gray-900 shadow dark:bg-[#1f2c34] dark:text-gray-100">
                      {template.header_type === 'TEXT' && template.header_content && <p className="mb-1 font-semibold">{template.header_content}</p>}
                      {template.header_type && template.header_type !== 'TEXT' && template.header_type !== 'NONE' && (
                        <p className="mb-2 rounded bg-gray-100 p-6 text-center text-xs text-gray-500 dark:bg-white/10">{template.header_type.toLowerCase()} header</p>
                      )}
                      <p className="whitespace-pre-wrap">{template.body_content || '—'}</p>
                      {template.footer_content && <p className="mt-1 text-xs text-gray-500">{template.footer_content}</p>}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-gray-500">Choose a template to see it here.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs">When to send</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { id: 'now', title: 'Send now', hint: 'Starts right after you create it', icon: Send },
                  { id: 'later', title: 'Schedule for later', hint: 'Starts automatically at the time you pick', icon: Calendar },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setWhen(o.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left',
                      when === o.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <o.icon className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <span className="block text-sm font-semibold">{o.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {when === 'later' && (
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="max-w-xs" aria-label="Scheduled date and time" />
              )}
              {template?.whatsapp_account && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sent from <b>{template.whatsapp_account}</b> (the number this template belongs to).
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={cn(card, 'space-y-5')}>
            <div>
              <h2 className="text-base font-bold">Step 4 · Review</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Check everything, then create the campaign.</p>
            </div>
            <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm dark:divide-white/5 dark:border-white/10">
              {[
                ['Name', name, 0],
                ['Goal', goalInfo.title, 0],
                [
                  'Audience',
                  allContacts
                    ? 'All contacts'
                    : [
                        tags.length && `Tags: ${tags.join(', ')}`,
                        groupIds.length && `Groups: ${groups.filter((g) => groupIds.includes(g.id)).map((g) => g.name).join(', ')}`,
                        listIds.length && `Lists: ${lists.filter((l) => listIds.includes(l.id)).map((l) => l.name).join(', ')}`,
                        picked.length && `${picked.length} single contact${picked.length === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                  1,
                ],
                [
                  'Filters',
                  [excludeOptedOut && 'skip opted-out', matchLanguage && template?.language && `language ${template.language}`, excludeTags.length && `without tags ${excludeTags.join(', ')}`]
                    .filter(Boolean)
                    .join(' · ') || 'None',
                  1,
                ],
                ['Recipients', previewing ? 'Counting…' : String(preview?.count ?? 0), 1],
                ['Template', template ? `${template.display_name || template.name}${template.language ? ` (${template.language})` : ''}` : '—', 2],
                ['WhatsApp number', template?.whatsapp_account || '—', 2],
                ['When', when === 'now' ? 'Now' : scheduleAt ? new Date(scheduleAt).toLocaleString() : '—', 2],
              ].map(([k, v, s]) => (
                <div key={k as string} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                  <dd className="flex items-center gap-2 text-right font-medium">
                    <span>{v as string}</span>
                    <button type="button" onClick={() => setStep(s as number)} className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                      Edit
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            {isMarketing && !excludeOptedOut && (
              <p className="text-xs text-amber-600 dark:text-amber-400">This is a marketing template and opted-out contacts are included.</p>
            )}
            {when === 'now' && (
              <Toggle checked={startNow} onChange={setStartNow} label="Start sending right away" hint="Off saves it as a draft you can start later from the campaign page." />
            )}
          </div>
        )}

        {/* Footer navigation */}
        <div className="flex items-center justify-between gap-3 pb-6">
          <Button type="button" variant="outline" onClick={() => (step === 0 ? navigate('/campaigns') : setStep(step - 1))}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => {
                const err = stepError(step);
                if (err) toast.error(err);
                else setStep(step + 1);
              }}
            >
              Next: {STEPS[step + 1]}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={create} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              {when === 'later' ? 'Schedule campaign' : startNow ? 'Create & send' : 'Create campaign'}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default CampaignWizardView;
