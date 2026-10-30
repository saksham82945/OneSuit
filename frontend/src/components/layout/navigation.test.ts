import { describe, it, expect } from 'vitest';
import { navigationSections, navigationItems } from './navigation';

describe('Navigation configuration', () => {
  it('should include all main navigation sections', () => {
    const labels = navigationSections.map((s) => s.label);
    expect(labels).toContain('nav.sectionSuperAdmin');
    expect(labels).toContain('nav.sectionMain');
    expect(labels).toContain('nav.sectionMessaging');
    expect(labels).not.toContain('nav.sectionAiCallSetup'); // Removed — calling moved to super-admin only
    expect(labels).toContain('nav.sectionAnalytics');
    expect(labels).toContain('nav.sectionHelp');
  });

  it('should not hide messaging section from super admins', () => {
    const messagingSection = navigationSections.find((s) => s.label === 'nav.sectionMessaging');
    expect(messagingSection).toBeDefined();
    expect(messagingSection?.superAdminHidden).toBeFalsy();
  });

  it('should include platform administration items under super admin section', () => {
    const superAdminSection = navigationSections.find((s) => s.label === 'nav.sectionSuperAdmin')!;
    const itemPaths = superAdminSection.items.map((i) => i.path);
    expect(itemPaths).toContain('/super-admin');
    expect(itemPaths).toContain('/super-admin/clients');
    expect(itemPaths).toContain('/super-admin/subscriptions');
    expect(itemPaths).toContain('/super-admin/pages');
    expect(itemPaths).toContain('/super-admin/configuration');
    expect(itemPaths).toContain('/super-admin/tickets');
    expect(itemPaths).toContain('/super-admin/ai-call-setup');
  });

  it('should populate navigationItems from all sections', () => {
    expect(navigationItems.length).toBeGreaterThan(10);
    const paths = navigationItems.map((i) => i.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/super-admin');
    expect(paths).toContain('/chat');
    expect(paths).toContain('/campaigns');
    expect(paths).toContain('/templates');
  });
});
