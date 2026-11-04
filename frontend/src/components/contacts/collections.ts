import {
  groupsService,
  listsService,
  type BroadcastList,
  type ContactGroup,
  type MembersParams,
} from '@/services/groupsApi';

/** Groups organise contacts; lists are saved broadcast audiences. */
export type CollectionKind = 'group' | 'list';

/** The fields groups and lists share (groups also carry a colour). */
export type Collection = (ContactGroup | BroadcastList) & { color?: string };

/** Per-kind API calls and copy, so the UI can treat groups and lists alike. */
type Res = Promise<{ data?: unknown }>;

export interface CollectionAdapter {
  kind: CollectionKind;
  noun: string; // "group" / "list"
  title: string; // "Groups" / "Broadcast lists"
  listKey: 'groups' | 'lists';
  list: (params?: { search?: string; contact_id?: string }) => Res;
  create: (data: { name: string; color?: string; description?: string }) => Res;
  update: (id: string, data: { name?: string; color?: string; description?: string }) => Res;
  delete: (id: string) => Res;
  members: (id: string, params?: MembersParams) => Res;
  addContacts: (id: string, contactIds: string[]) => Res;
  removeContacts: (id: string, contactIds: string[]) => Res;
}

export const groupAdapter: CollectionAdapter = {
  kind: 'group',
  noun: 'group',
  title: 'Groups',
  listKey: 'groups',
  list: groupsService.list,
  create: groupsService.create,
  update: groupsService.update,
  delete: groupsService.delete,
  members: groupsService.members,
  addContacts: groupsService.addMembers,
  removeContacts: groupsService.removeMembers,
};

export const listAdapter: CollectionAdapter = {
  kind: 'list',
  noun: 'list',
  title: 'Broadcast lists',
  listKey: 'lists',
  list: listsService.list,
  create: ({ name, description }) => listsService.create({ name, description }),
  update: (id, { name, description }) => listsService.update(id, { name, description }),
  delete: listsService.delete,
  members: listsService.members,
  addContacts: (id, contactIds) => listsService.addMembers(id, { contact_ids: contactIds }),
  removeContacts: listsService.removeMembers,
};

export const adapterFor = (kind: CollectionKind) => (kind === 'group' ? groupAdapter : listAdapter);
