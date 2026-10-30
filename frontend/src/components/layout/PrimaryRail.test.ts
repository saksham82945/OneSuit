import { describe, it, expect } from 'vitest';
import { primaryModules, visibleRailModules } from './PrimaryRail';

describe('PrimaryRail navigation modules', () => {
  it('should include Platform Admin module with correct configuration', () => {
    const superAdminMod = primaryModules.find((m) => m.id === 'super-admin');
    expect(superAdminMod).toBeDefined();
    expect(superAdminMod?.label).toBe('Platform Admin');
    expect(superAdminMod?.path).toBe('/super-admin');
    expect(superAdminMod?.superAdminOnly).toBe(true);
    expect(superAdminMod?.matcher('/super-admin')).toBe(true);
    expect(superAdminMod?.matcher('/super-admin/clients')).toBe(true);
    expect(superAdminMod?.matcher('/dashboard')).toBe(false);
  });

  it('should include all workspace modules without superAdminHidden flag', () => {
    const moduleIds = primaryModules.map((m) => m.id);
    expect(moduleIds).toContain('dashboard');
    expect(moduleIds).toContain('super-admin');
    expect(moduleIds).toContain('chat');
    expect(moduleIds).toContain('contacts');
    expect(moduleIds).toContain('campaigns');
    expect(moduleIds).toContain('templates');
    expect(moduleIds).toContain('flows');
    expect(moduleIds).not.toContain('calling'); // Removed from primary rail — access via super-admin
    expect(moduleIds).toContain('catalogs');
    expect(moduleIds).toContain('analytics');
    expect(moduleIds).toContain('settings');

    // Workspace modules should not have superAdminHidden set to true
    // so Super Admins can access all workspace features
    primaryModules.forEach((m) => {
      // @ts-expect-error checking if property was erroneously set
      expect(m.superAdminHidden).toBeFalsy();
    });
  });

  it('should correctly match path routes for all modules', () => {
    const dashboard = primaryModules.find((m) => m.id === 'dashboard')!;
    expect(dashboard.matcher('/')).toBe(true);
    expect(dashboard.matcher('/chat')).toBe(false);

    const chat = primaryModules.find((m) => m.id === 'chat')!;
    expect(chat.matcher('/chat')).toBe(true);
    expect(chat.matcher('/chat/123')).toBe(true);
    expect(chat.matcher('/chatbot/keywords')).toBe(false);

    const contacts = primaryModules.find((m) => m.id === 'contacts')!;
    expect(contacts.matcher('/contacts')).toBe(true);
    expect(contacts.matcher('/tags')).toBe(true);

    const campaigns = primaryModules.find((m) => m.id === 'campaigns')!;
    expect(campaigns.matcher('/campaigns')).toBe(true);
    expect(campaigns.matcher('/campaigns/new')).toBe(true);

    const templates = primaryModules.find((m) => m.id === 'templates')!;
    expect(templates.matcher('/templates')).toBe(true);

    const flows = primaryModules.find((m) => m.id === 'flows')!;
    expect(flows.matcher('/flows')).toBe(true);
    expect(flows.matcher('/chatbot')).toBe(true);
    expect(flows.matcher('/chatbot/keywords')).toBe(true);
    expect(flows.matcher('/flows/keywords')).toBe(true);


    const catalogs = primaryModules.find((m) => m.id === 'catalogs')!;
    expect(catalogs.matcher('/catalogs')).toBe(true);

    const analytics = primaryModules.find((m) => m.id === 'analytics')!;
    expect(analytics.matcher('/analytics/agents')).toBe(true);

    const settings = primaryModules.find((m) => m.id === 'settings')!;
    expect(settings.matcher('/settings')).toBe(true);
    expect(settings.matcher('/settings/accounts')).toBe(true);
  });

  it('gives the super admin only Platform Admin and Settings, unless inside a client', () => {
    const all = () => true;
    expect(visibleRailModules(true, false, all).map((m) => m.id)).toEqual(['super-admin', 'settings']);
    const inside = visibleRailModules(true, true, all).map((m) => m.id);
    expect(inside).toContain('chat');
    expect(inside).toContain('dashboard');
    const business = visibleRailModules(false, false, all).map((m) => m.id);
    expect(business).not.toContain('super-admin');
    expect(business).toContain('chat');
  });
});
