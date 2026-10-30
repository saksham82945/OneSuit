import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, SlidersHorizontal, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfigurationView } from './ConfigurationView';
import { SettingsView } from '@/views/settings/SettingsView';

/** The super admin's one Settings page: platform configuration and their own workspace settings. */
export const SuperAdminSettingsView: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'workspace' ? 'workspace' : 'platform';

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Settings"
        subtitle="Platform configuration and your workspace settings, in one place"
        icon={Settings}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'workspace' ? { tab: 'workspace' } : {}, { replace: true })} className="flex-1 flex flex-col">
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="platform">
              <SlidersHorizontal className="h-4 w-4 mr-2" /> Platform configuration
            </TabsTrigger>
            <TabsTrigger value="workspace">
              <Building2 className="h-4 w-4 mr-2" /> General
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="platform" className="mt-0 flex-1">
          <ConfigurationView embedded />
        </TabsContent>
        <TabsContent value="workspace" className="mt-0 flex-1">
          <SettingsView embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SuperAdminSettingsView;
