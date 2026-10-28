import { api } from '@/services/api';
import type { SupportTicket, SupportTicketReply } from '@/services/superAdmin';

export type { SupportTicket, SupportTicketReply };

export interface NewSupportTicket {
  subject: string;
  description?: string;
  priority?: SupportTicket['priority'];
  image_url?: string;
}

/** Support tickets for the organization the user is signed in to. */
export const supportService = {
  list: () => api.get<{ data: SupportTicket[] }>('/support-tickets').then((r) => r.data.data ?? []),
  get: (id: string) => api.get<{ data: SupportTicket }>(`/support-tickets/${id}`).then((r) => r.data.data),
  create: (data: NewSupportTicket) =>
    api.post<{ data: SupportTicket }>('/support-tickets', data).then((r) => r.data.data),
  reply: (id: string, data: { message: string; image_url?: string }) =>
    api.post<{ data: SupportTicketReply }>(`/support-tickets/${id}/reply`, data).then((r) => r.data.data),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<{ data: { url: string } }>('/support-tickets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data.url);
  },
};
