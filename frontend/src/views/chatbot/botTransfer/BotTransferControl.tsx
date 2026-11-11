import React, { useState } from 'react';
import { chatbotService } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Download, FileJson, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ImportBotsDialog } from './ImportBotsDialog';
import { AiBotHelpDialog } from './AiBotHelpDialog';
import { SAMPLE_BOT_FILE, botFileName, downloadJson } from './botFile';

export interface BotTransferControlProps {
  /** Which list this sits on: the selected ids are flows or keyword bots. */
  kind: 'flows' | 'keywords';
  selectedIds: string[];
  /** Called after a successful import, to reload the list. */
  onImported: () => void;
}

type ApiError = { response?: { data?: { message?: string } } };

/** Import / Export of bots in the OneSuit bot format, for the Bot Flows and Keyword bots lists. */
export const BotTransferControl: React.FC<BotTransferControlProps> = ({ kind, selectedIds, onImported }) => {
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const runExport = async (params?: { flows?: string; keywords?: string }) => {
    setExporting(true);
    try {
      const res = await chatbotService.exportBots(params);
      const file = res.data as { flows?: unknown[]; keyword_bots?: unknown[] };
      downloadJson(file, botFileName());
      const flows = file?.flows?.length ?? 0;
      const keywords = file?.keyword_bots?.length ?? 0;
      toast.success(`Exported ${flows} flow bot${flows === 1 ? '' : 's'} and ${keywords} keyword bot${keywords === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error((err as ApiError)?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportSelected = () =>
    runExport(kind === 'flows' ? { flows: selectedIds.join(',') } : { keywords: selectedIds.join(',') });

  const outline =
    'border-white/10 hover:bg-white/[0.04] text-white light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={outline} disabled={exporting}>
            <FileJson className="h-4 w-4 sm:mr-1.5 text-emerald-400 light:text-emerald-600" />
            <span className="hidden sm:inline">Import / Export</span>
            <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2 text-emerald-400 light:text-emerald-600" />
            Import bots…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={selectedIds.length === 0} onSelect={exportSelected}>
            <Download className="h-4 w-4 mr-2 text-teal-400 light:text-teal-600" />
            Export selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runExport()}>
            <Download className="h-4 w-4 mr-2 text-teal-400 light:text-teal-600" />
            Export all bots
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => downloadJson(SAMPLE_BOT_FILE, 'onesuit-bots-sample.json')}>
            <FileJson className="h-4 w-4 mr-2 opacity-70" />
            Download sample file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2 text-teal-400 light:text-teal-600" />
            Create a bot with AI
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportBotsDialog open={importOpen} onOpenChange={setImportOpen} onImported={onImported} />
      <AiBotHelpDialog open={helpOpen} onOpenChange={setHelpOpen} onImportClick={() => setImportOpen(true)} />
    </>
  );
};

export default BotTransferControl;
