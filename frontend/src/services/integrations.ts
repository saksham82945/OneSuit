import { api } from '@/services/api';

// Social login (super admin) and lead integrations (super admin catalog +
// each client's connections).

export interface SocialProvider {
  provider: 'google' | 'facebook';
  name: string;
  enabled: boolean;
  show_on_login: boolean;
  client_id: string;
  has_secret: boolean;
  keys_set: boolean;
  /** Redirect URL to register with Google / Facebook. */
  callback_url: string;
}

export type LeadField = 'external_id' | 'name' | 'phone' | 'email' | 'city' | 'subject' | 'message';

export const LEAD_FIELD_LABELS: Record<LeadField, string> = {
  external_id: 'Lead ID',
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  city: 'City',
  subject: 'Product / subject',
  message: 'Message',
};

export interface IntegrationDefinition {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  setup_steps: string;
  docs_url: string;
  logo_url: string;
  color: string;
  field_map: Partial<Record<LeadField, string[]>>;
  is_enabled: boolean;
  is_builtin: boolean;
  sort_order: number;
  /** Super admin list only */
  connections?: number;
  leads?: number;
}

export interface IntegrationConnection {
  id: string;
  definition_key: string;
  name: string;
  tag: string;
  is_active: boolean;
  lead_count: number;
  last_lead_at: string | null;
  created_at: string;
  lead_url: string;
}

export interface IntegrationLead {
  id: string;
  connection_id: string;
  definition_key: string;
  external_id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  subject: string;
  message: string;
  contact_id: string | null;
  created_at: string;
}

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const socialLoginService = {
  get: () => unwrap<{ providers: SocialProvider[] }>(api.get('/super-admin/social-login')).then((d) => d.providers),
  update: (
    provider: string,
    data: { enabled?: boolean; show_on_login?: boolean; client_id?: string; client_secret?: string; clear_keys?: boolean }
  ) => unwrap<{ providers: SocialProvider[] }>(api.put(`/super-admin/social-login/${provider}`, data)).then((d) => d.providers),
};

export type IntegrationDefinitionInput = Partial<
  Pick<IntegrationDefinition, 'name' | 'category' | 'description' | 'setup_steps' | 'docs_url' | 'color' | 'field_map' | 'is_enabled' | 'sort_order'>
>;

export const integrationCatalogService = {
  list: () => unwrap<{ integrations: IntegrationDefinition[] }>(api.get('/super-admin/integrations')).then((d) => d.integrations),
  create: (data: IntegrationDefinitionInput) => unwrap<IntegrationDefinition>(api.post('/super-admin/integrations', data)),
  update: (key: string, data: IntegrationDefinitionInput) => unwrap<IntegrationDefinition>(api.put(`/super-admin/integrations/${key}`, data)),
  remove: (key: string) => api.delete(`/super-admin/integrations/${key}`),
};

export const integrationsService = {
  list: () => unwrap<{ integrations: IntegrationDefinition[]; connections: IntegrationConnection[] }>(api.get('/integrations')),
  connect: (data: { definition_key: string; name?: string; tag?: string }) =>
    unwrap<IntegrationConnection>(api.post('/integrations/connections', data)),
  update: (id: string, data: { name?: string; tag?: string; is_active?: boolean; rotate_link?: boolean }) =>
    unwrap<IntegrationConnection>(api.put(`/integrations/connections/${id}`, data)),
  disconnect: (id: string) => api.delete(`/integrations/connections/${id}`),
  leads: (connectionId?: string) =>
    unwrap<{ leads: IntegrationLead[] }>(api.get('/integrations/leads', { params: connectionId ? { connection_id: connectionId } : undefined })).then(
      (d) => d.leads
    ),
};
