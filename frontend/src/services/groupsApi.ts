import { api } from '@/services/api';

/** A contact group (organising contacts). GET /api/contact-groups */
export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  description: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** A saved broadcast list (campaign audience). GET /api/broadcast-lists */
export interface BroadcastList {
  id: string;
  name: string;
  description: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** A contact as returned by the group/list members endpoints. */
export interface CollectionMember {
  id: string;
  phone_number: string;
  name: string;
  profile_name: string;
  tags: string[];
  whatsapp_account?: string;
  marketing_opt_out: boolean;
  added_at: string;
}

export interface MembersParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const GROUP_COLORS = ['emerald', 'teal', 'blue', 'purple', 'red', 'amber', 'pink', 'gray'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export const groupsService = {
  list: (params?: { search?: string; contact_id?: string }) => api.get('/contact-groups', { params }),
  get: (id: string) => api.get(`/contact-groups/${id}`),
  create: (data: { name: string; color?: string; description?: string }) => api.post('/contact-groups', data),
  update: (id: string, data: { name?: string; color?: string; description?: string }) =>
    api.put(`/contact-groups/${id}`, data),
  delete: (id: string) => api.delete(`/contact-groups/${id}`),
  members: (id: string, params?: MembersParams) => api.get(`/contact-groups/${id}/members`, { params }),
  addMembers: (id: string, contactIds: string[]) =>
    api.post(`/contact-groups/${id}/members`, { contact_ids: contactIds }),
  removeMembers: (id: string, contactIds: string[]) =>
    api.post(`/contact-groups/${id}/members/remove`, { contact_ids: contactIds }),
};

/** One source of contacts to add to a broadcast list. */
export type ListMemberSource =
  | { contact_ids: string[] }
  | { group_id: string }
  | { tag: string }
  | { all_contacts: true };

export const listsService = {
  list: (params?: { search?: string; contact_id?: string }) => api.get('/broadcast-lists', { params }),
  get: (id: string) => api.get(`/broadcast-lists/${id}`),
  create: (data: { name: string; description?: string; contact_ids?: string[] }) =>
    api.post('/broadcast-lists', data),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/broadcast-lists/${id}`, data),
  delete: (id: string) => api.delete(`/broadcast-lists/${id}`),
  members: (id: string, params?: MembersParams) => api.get(`/broadcast-lists/${id}/members`, { params }),
  addMembers: (id: string, source: ListMemberSource) => api.post(`/broadcast-lists/${id}/members`, source),
  removeMembers: (id: string, contactIds: string[]) =>
    api.post(`/broadcast-lists/${id}/members/remove`, { contact_ids: contactIds }),
  /** Add a list's contacts to a draft campaign. */
  addToCampaign: (campaignId: string, listId: string) =>
    api.post(`/campaigns/${campaignId}/recipients/from-list`, { list_id: listId }),
};

/** Tailwind classes for a group colour chip / dot, readable in light and dark mode. */
export const groupColorClasses: Record<string, { dot: string; chip: string; soft: string }> = {
  emerald: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
    soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  teal: {
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60',
    soft: 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400',
  },
  blue: {
    dot: 'bg-blue-500',
    chip: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60',
    soft: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  },
  purple: {
    dot: 'bg-purple-500',
    chip: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/60',
    soft: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  },
  red: {
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60',
    soft: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  },
  amber: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  },
  pink: {
    dot: 'bg-pink-500',
    chip: 'bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-800/60',
    soft: 'bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400',
  },
  gray: {
    dot: 'bg-gray-400',
    chip: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:border-white/10',
    soft: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300',
  },
};

export const colorFor = (c?: string) => groupColorClasses[c || ''] || groupColorClasses.teal;

/** Message from an API error response, or the fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}
