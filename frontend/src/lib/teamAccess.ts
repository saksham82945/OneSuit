import { BarChart3, Contact, FileText, Megaphone, MessageSquare, MessageSquareText, Phone, Workflow, type LucideIcon } from 'lucide-react';

/** Parts of the app a team can be given. Members get this on top of their role. */
export const TEAM_ACCESS_OPTIONS: { key: string; label: string; description: string; icon: LucideIcon }[] = [
  { key: 'chat', label: 'Live Chat', description: 'Reply to customers, assign and transfer chats', icon: MessageSquare },
  { key: 'contacts', label: 'Contacts & Tags', description: 'View, add and edit contacts and tags', icon: Contact },
  { key: 'campaigns', label: 'Campaigns & Ads', description: 'Create and send broadcasts and ads', icon: Megaphone },
  { key: 'templates', label: 'Templates', description: 'Create and manage message templates', icon: FileText },
  { key: 'automation', label: 'Flows & Chatbots', description: 'Build flows, keyword replies and AI bots', icon: Workflow },
  { key: 'canned', label: 'Canned Responses', description: 'Manage saved quick replies', icon: MessageSquareText },
  { key: 'analytics', label: 'Analytics', description: 'See reports and agent performance', icon: BarChart3 },
  { key: 'calls', label: 'Calls', description: 'Call logs, outgoing calls and call routing', icon: Phone },
];

export const teamAccessLabel = (key: string) => TEAM_ACCESS_OPTIONS.find((o) => o.key === key)?.label ?? key;
