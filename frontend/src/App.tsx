import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/stores/auth';

// Auth Views
import { LoginView } from '@/views/auth/LoginView';

// Core Dashboard & Chat
import { DashboardView } from '@/views/dashboard/DashboardView';
import { ChatView } from '@/views/chat/ChatView';
import { ProfileView } from '@/views/profile/ProfileView';

// Messaging
import { TemplatesView } from '@/views/settings/TemplatesView';
import { TemplateDetailView } from '@/views/settings/TemplateDetailView';
import { CampaignsView } from '@/views/settings/CampaignsView';
import { CampaignDetailView } from '@/views/settings/CampaignDetailView';
import { FlowsView } from '@/views/settings/FlowsView';

// Chatbot Suite
import { ChatbotView } from '@/views/chatbot/ChatbotView';
import { KeywordsView } from '@/views/chatbot/KeywordsView';
import { ChatbotFlowsView } from '@/views/chatbot/ChatbotFlowsView';
import { ChatbotFlowBuilderView } from '@/views/chatbot/ChatbotFlowBuilderView';
import { AIContextsView } from '@/views/chatbot/AIContextsView';
import { AgentTransfersView } from '@/views/chatbot/AgentTransfersView';

// Calling Suite
import { CallLogsView } from '@/views/calling/CallLogsView';
import { IVRFlowsView } from '@/views/calling/IVRFlowsView';
import { CallTransfersView } from '@/views/calling/CallTransfersView';

// Analytics
import { AgentAnalyticsView } from '@/views/analytics/AgentAnalyticsView';
import { MetaInsightsView } from '@/views/analytics/MetaInsightsView';

// Settings Suite
import { SettingsView } from '@/views/settings/SettingsView';
import { AccountsView } from '@/views/settings/AccountsView';
import { ContactsView } from '@/views/settings/ContactsView';
import { ContactDetailView } from '@/views/settings/ContactDetailView';
import { CannedResponsesView } from '@/views/settings/CannedResponsesView';
import { TagsView } from '@/views/settings/TagsView';
import { TeamsView } from '@/views/settings/TeamsView';
import { UsersView } from '@/views/settings/UsersView';
import { RolesView } from '@/views/settings/RolesView';
import { APIKeysView } from '@/views/settings/APIKeysView';
import { WebhooksView } from '@/views/settings/WebhooksView';
import { CustomActionsView } from '@/views/settings/CustomActionsView';
import { SSOSettingsView } from '@/views/settings/SSOSettingsView';
import { AuditLogsView } from '@/views/settings/AuditLogsView';
import { ChatbotSettingsView } from '@/views/settings/ChatbotSettingsView';
import { BillingView } from '@/views/settings/BillingView';
import { OptInView } from '@/views/settings/OptInView';

// Ads Manager
import { AdsManagerView } from '@/views/ads/AdsManagerView';
import { AdsAgentView } from '@/views/ads/AdsAgentView';
import { AdsLeadsView } from '@/views/ads/AdsLeadsView';
import { AdsFormsView } from '@/views/ads/AdsFormsView';
import { AdsAudiencesView } from '@/views/ads/AdsAudiencesView';
import { AdsEventsView } from '@/views/ads/AdsEventsView';
import { AdsSetupView } from '@/views/ads/AdsSetupView';

// Catalogue
import { CatalogsView } from '@/views/catalog/CatalogsView';
import { CatalogDetailView } from '@/views/catalog/CatalogDetailView';

// Support
import { SupportView } from '@/views/support/SupportView';

// Public website pages (no login)
import { LandingPageView } from '@/views/public/LandingPageView';
import { PricingView } from '@/views/public/PricingView';
import { SignupView } from '@/views/public/SignupView';
import { JoinView } from '@/views/public/JoinView';
import { ExploreView } from '@/views/public/ExploreView';

// Super Admin Panel
import { SuperAdminRoute } from '@/components/layout/SuperAdminRoute';
import { WhatsAppSetupView } from '@/views/settings/WhatsAppSetupView';
import { SuperAdminDashboardView } from '@/views/super-admin/SuperAdminDashboardView';
import { VendorsView } from '@/views/super-admin/VendorsView';
import { SubscriptionsView } from '@/views/super-admin/SubscriptionsView';
import { PagesManagementView } from '@/views/super-admin/PagesManagementView';
import { ConfigurationView } from '@/views/super-admin/ConfigurationView';
import { ManageTicketsView } from '@/views/super-admin/ManageTicketsView';
import { AICallSetupView } from '@/views/super-admin/AICallSetupView';

/**
 * RootRoute: Unauthenticated visitors visiting the homepage root `/` see the
 * modern One Suit landing page. Authenticated users see their application shell & dashboard.
 */
const RootRoute: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, restoreSession } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreSession();
    setReady(true);
  }, [restoreSession]);

  if (!ready) return null;

  // Unauthenticated visitor visiting "/" gets the landing page
  if (!isAuthenticated && location.pathname === '/') {
    return <LandingPageView />;
  }

  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
};

export const App: React.FC = () => {
  return (
    <>
      <Toaster position="top-right" richColors theme="light" />
      <BrowserRouter>
        <Routes>
          {/* Public Landing & Marketing Pages */}
          <Route path="/landing" element={<LandingPageView />} />
          <Route path="/home" element={<LandingPageView />} />

          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginView />} />
          <Route path="/register" element={<LoginView />} />
          <Route path="/pricing" element={<PricingView />} />
          <Route path="/signup" element={<SignupView />} />
          <Route path="/join/:token" element={<JoinView />} />
          <Route path="/explore" element={<ExploreView />} />

          {/* Main App Shell */}
          <Route path="/" element={<RootRoute />}>
            <Route index element={<DashboardView />} />
            <Route path="dashboard" element={<DashboardView />} />

            {/* Omnichannel Chat */}
            <Route path="chat" element={<ChatView />} />
            <Route path="chat/:contactId" element={<ChatView />} />

            {/* Profile */}
            <Route path="profile" element={<ProfileView />} />

            {/* Support tickets (every signed-in user) */}
            <Route path="support" element={<SupportView />} />

            {/* Messaging: Templates, Campaigns & Flows */}
            <Route path="templates" element={<TemplatesView />} />
            <Route path="templates/:id" element={<TemplateDetailView />} />
            <Route path="templates/new" element={<TemplateDetailView />} />
            <Route path="campaigns" element={<CampaignsView />} />
            <Route path="campaigns/:id" element={<CampaignDetailView />} />
            <Route path="campaigns/new" element={<CampaignDetailView />} />
            <Route path="ads" element={<AdsManagerView />} />
            <Route path="ads/agent" element={<AdsAgentView />} />
            <Route path="ads/leads" element={<AdsLeadsView />} />
            <Route path="ads/forms" element={<AdsFormsView />} />
            <Route path="ads/audiences" element={<AdsAudiencesView />} />
            <Route path="ads/events" element={<AdsEventsView />} />
            <Route path="ads/setup" element={<AdsSetupView />} />
            <Route path="flows" element={<FlowsView />} />
            <Route path="flows/keywords" element={<KeywordsView />} />
            <Route path="flows/keywords/new" element={<KeywordsView />} />
            <Route path="flows/keywords/:id" element={<KeywordsView />} />
            <Route path="catalogs" element={<CatalogsView />} />
            <Route path="catalogs/:id" element={<CatalogDetailView />} />

            {/* Chatbot Visual Studio */}
            <Route path="chatbot" element={<ChatbotView />} />
            <Route path="chatbot/keywords" element={<KeywordsView />} />
            <Route path="chatbot/keywords/new" element={<KeywordsView />} />
            <Route path="chatbot/keywords/:id" element={<KeywordsView />} />
            <Route path="chatbot/flows" element={<ChatbotFlowsView />} />
            <Route path="chatbot/flows/new" element={<ChatbotFlowBuilderView />} />
            <Route path="chatbot/flows/:id/edit" element={<ChatbotFlowBuilderView />} />
            <Route path="chatbot/ai" element={<AIContextsView />} />
            <Route path="chatbot/transfers" element={<AgentTransfersView />} />

            {/* Calling & Voice */}
            <Route path="calling" element={<Navigate to="/calling/logs" replace />} />
            <Route path="calling/logs" element={<CallLogsView />} />
            <Route path="calling/ivr-flows" element={<IVRFlowsView />} />
            <Route path="calling/ivr-flows/:id/edit" element={<IVRFlowsView />} />
            <Route path="calling/transfers" element={<CallTransfersView />} />

            {/* Analytics */}
            <Route path="analytics/agents" element={<AgentAnalyticsView />} />
            <Route path="analytics/meta-insights" element={<MetaInsightsView />} />

            {/* Settings Suite */}
            <Route path="settings" element={<SettingsView />} />
            <Route path="settings/accounts" element={<AccountsView />} />
            <Route path="settings/contacts" element={<ContactsView />} />
            <Route path="settings/contacts/:id" element={<ContactDetailView />} />
            <Route path="contacts" element={<ContactsView />} />
            <Route path="contacts/:id" element={<ContactDetailView />} />
            <Route path="settings/canned-responses" element={<CannedResponsesView />} />
            <Route path="settings/tags" element={<TagsView />} />
            <Route path="tags" element={<TagsView />} />
            <Route path="settings/teams" element={<TeamsView />} />
            <Route path="settings/users" element={<UsersView />} />
            <Route path="settings/api-keys" element={<APIKeysView />} />
            <Route path="settings/webhooks" element={<WebhooksView />} />
            <Route path="settings/custom-actions" element={<CustomActionsView />} />
            <Route path="settings/sso" element={<SSOSettingsView />} />
            {/* Roles and audit logs: super admin only */}
            <Route element={<SuperAdminRoute />}>
              <Route path="settings/roles" element={<RolesView />} />
              <Route path="settings/audit-logs" element={<AuditLogsView />} />
            </Route>
            <Route path="settings/whatsapp-setup" element={<WhatsAppSetupView />} />
            <Route path="settings/accounts/connect" element={<WhatsAppSetupView />} />
            <Route path="settings/chatbot" element={<ChatbotSettingsView />} />
            <Route path="settings/billing" element={<BillingView />} />
            <Route path="settings/opt-in" element={<OptInView />} />

            {/* Super Admin (platform management; super admins only) */}
            <Route path="super-admin" element={<SuperAdminRoute />}>
              <Route index element={<SuperAdminDashboardView />} />
              <Route path="vendors" element={<VendorsView />} />
              <Route path="subscriptions" element={<SubscriptionsView />} />
              <Route path="pages" element={<PagesManagementView />} />
              <Route path="configuration" element={<ConfigurationView />} />
              <Route path="tickets" element={<ManageTicketsView />} />
              <Route path="ai-call-setup" element={<AICallSetupView />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export default App;
